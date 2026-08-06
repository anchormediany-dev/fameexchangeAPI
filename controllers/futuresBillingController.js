// Fame Futures Phase 3 — Stripe Subscriptions, replacing Base44's Wix
// Checkout webhooks. Two parallel subscription types (see
// models/futuresMembershipModel.js / futuresFanMembershipTierModel.js headers)
// plus one-time crowdfunding support, all settled through Stripe. See
// ~/.claude/plans/soft-wiggling-tiger.md Phase 3.
import mongoose from "mongoose";
import stripe from "../services/stripeClient.js";
import { ensureStripeCustomer } from "./billingController.js";
import {
  getOrCreatePlatformPriceId,
  getOrCreateFanTierPriceId,
  mapSubscriptionStatus,
  PLATFORM_PLANS,
} from "../services/futuresStripeService.js";
import User from "../models/user.js";
import FuturesMembership from "../models/futuresMembershipModel.js";
import FuturesFanMembershipTier from "../models/futuresFanMembershipTierModel.js";
import FuturesFanSubscription from "../models/futuresFanSubscriptionModel.js";
import FuturesProject from "../models/futuresProjectModel.js";
import FuturesProjectSupport from "../models/futuresProjectSupportModel.js";
import Notification from "../models/notificationModel.js";

function assert(v, msg, code = 400) {
  if (!v) {
    const err = new Error(msg);
    err.status = code;
    throw err;
  }
}

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// Pulls the client secret Stripe needs to confirm the subscription's first
// invoice — same shape the frontend already knows how to confirm via
// stripe.confirmCardPayment (see PledgeModal.jsx's CardForm).
function clientSecretFromSubscription(sub) {
  return sub?.latest_invoice?.payment_intent?.client_secret || null;
}

// ── Platform membership (starter/pro/elite) ─────────────────────────────
// POST /api/futures-hub/billing/membership/start
// Body: { plan, recipientUserId? } — recipientUserId lets a fan gift a
// membership to another user (Base44's Membership.sponsored_by_id).
export const startPlatformMembershipCheckout = async (req, res, next) => {
  try {
    assert(req.user?._id, "Unauthorized", 401);
    const { plan, recipientUserId } = req.body || {};
    assert(PLATFORM_PLANS[plan], "Invalid plan");

    const isGift = recipientUserId && String(recipientUserId) !== String(req.user._id);
    if (isGift) assert(isValidId(recipientUserId), "Invalid recipientUserId");

    const recipient = isGift
      ? await User.findById(recipientUserId)
      : await User.findById(req.user._id);
    assert(recipient, "Recipient not found", 404);

    const existingActive = await FuturesMembership.findOne({
      userId: recipient._id,
      status: { $in: ["active", "pending"] },
    });
    assert(!existingActive, "Recipient already has a membership in progress", 409);

    const customerId = await ensureStripeCustomer(recipient);
    const priceId = await getOrCreatePlatformPriceId(plan);

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.payment_intent"],
      metadata: {
        kind: "futures_membership",
        userId: String(recipient._id),
        plan,
        ...(isGift ? { sponsoredById: String(req.user._id) } : {}),
      },
    });

    const membership = await FuturesMembership.create({
      userId: recipient._id,
      plan,
      status: "pending",
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      sponsoredById: isGift ? req.user._id : null,
    });

    res.json({
      success: true,
      membershipId: membership._id,
      subscriptionId: subscription.id,
      clientSecret: clientSecretFromSubscription(subscription),
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ success: false, message: e.message });
    next(e);
  }
};

// GET /api/futures-hub/billing/membership/me
export const getMyMembership = async (req, res, next) => {
  try {
    assert(req.user?._id, "Unauthorized", 401);
    const membership = await FuturesMembership.findOne({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, data: membership });
  } catch (e) {
    next(e);
  }
};

// POST /api/futures-hub/billing/membership/cancel
export const cancelPlatformMembership = async (req, res, next) => {
  try {
    assert(req.user?._id, "Unauthorized", 401);
    const membership = await FuturesMembership.findOne({
      userId: req.user._id,
      status: "active",
    });
    assert(membership, "No active membership", 404);

    if (membership.stripeSubscriptionId) {
      await stripe.subscriptions.cancel(membership.stripeSubscriptionId);
    }
    membership.status = "canceled";
    await membership.save();

    res.json({ success: true, data: membership });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ success: false, message: e.message });
    next(e);
  }
};

// ── Fan subscriptions to a talent's custom tier ─────────────────────────
// POST /api/futures-hub/billing/fan-subscription/start
// Body: { tierId }
export const startFanSubscriptionCheckout = async (req, res, next) => {
  try {
    assert(req.user?._id, "Unauthorized", 401);
    const { tierId } = req.body || {};
    assert(isValidId(tierId), "Invalid tierId");

    const tier = await FuturesFanMembershipTier.findById(tierId);
    assert(tier, "Tier not found", 404);
    assert(tier.status === "active", "Tier is not active", 400);
    assert(String(tier.talentId) !== String(req.user._id), "Cannot subscribe to your own tier", 400);

    const existingActive = await FuturesFanSubscription.findOne({
      fanId: req.user._id,
      talentId: tier.talentId,
      status: { $in: ["active", "pending"] },
    });
    assert(!existingActive, "Already subscribed to this talent", 409);

    const fan = await User.findById(req.user._id);
    const customerId = await ensureStripeCustomer(fan);
    const priceId = await getOrCreateFanTierPriceId(tier);

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.payment_intent"],
      metadata: {
        kind: "futures_fan_subscription",
        fanId: String(req.user._id),
        talentId: String(tier.talentId),
        tierId: String(tier._id),
      },
    });

    const fanSubscription = await FuturesFanSubscription.create({
      talentId: tier.talentId,
      fanId: req.user._id,
      tierId: tier._id,
      price: tier.price,
      status: "pending",
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
    });

    res.json({
      success: true,
      fanSubscriptionId: fanSubscription._id,
      subscriptionId: subscription.id,
      clientSecret: clientSecretFromSubscription(subscription),
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ success: false, message: e.message });
    next(e);
  }
};

// GET /api/futures-hub/billing/fan-subscription/me — talents I support
export const getMyFanSubscriptions = async (req, res, next) => {
  try {
    assert(req.user?._id, "Unauthorized", 401);
    const data = await FuturesFanSubscription.find({ fanId: req.user._id })
      .sort({ createdAt: -1 })
      .populate("tierId", "name price benefits")
      .lean();
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

// GET /api/futures-hub/billing/fan-subscription/my-subscribers — as a talent
export const getMySubscribers = async (req, res, next) => {
  try {
    assert(req.user?._id, "Unauthorized", 401);
    const data = await FuturesFanSubscription.find({
      talentId: req.user._id,
      status: "active",
    })
      .sort({ createdAt: -1 })
      .populate("fanId", "name images")
      .populate("tierId", "name price")
      .lean();
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

// POST /api/futures-hub/billing/fan-subscription/:id/cancel
export const cancelFanSubscription = async (req, res, next) => {
  try {
    assert(req.user?._id, "Unauthorized", 401);
    const sub = await FuturesFanSubscription.findOne({
      _id: req.params.id,
      fanId: req.user._id,
      status: "active",
    });
    assert(sub, "Active subscription not found", 404);

    if (sub.stripeSubscriptionId) {
      await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
    }
    sub.status = "canceled";
    await sub.save();

    res.json({ success: true, data: sub });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ success: false, message: e.message });
    next(e);
  }
};

// ── Crowdfunding project support (one-time, not a subscription) ────────
// POST /api/futures-hub/billing/project-support/start
// Body: { projectId, amount }
export const startProjectSupportPaymentIntent = async (req, res, next) => {
  try {
    assert(req.user?._id, "Unauthorized", 401);
    const { projectId, amount } = req.body || {};
    assert(isValidId(projectId), "Invalid projectId");

    const project = await FuturesProject.findById(projectId);
    assert(project, "Project not found", 404);
    assert(project.status === "active", "Project is not active", 400);

    const n = Number(amount);
    assert(Number.isFinite(n) && n >= 1, "Invalid amount");
    const amountInMinor = Math.round(n * 100);

    const fan = await User.findById(req.user._id);
    const customerId = await ensureStripeCustomer(fan);

    const pi = await stripe.paymentIntents.create({
      amount: amountInMinor,
      currency: "usd",
      customer: customerId,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      metadata: {
        kind: "futures_project_support",
        projectId: String(project._id),
        fanId: String(req.user._id),
      },
    });

    const support = await FuturesProjectSupport.create({
      projectId: project._id,
      fanId: req.user._id,
      amount: n,
      status: "pending",
      stripePaymentIntentId: pi.id,
    });

    res.json({
      success: true,
      supportId: support._id,
      paymentIntentId: pi.id,
      clientSecret: pi.client_secret,
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ success: false, message: e.message });
    next(e);
  }
};

// ── Webhook: POST /api/futures-hub/billing/webhook (raw body) ──────────
// Separate from the existing /api/billing/webhook and /api/products/webhook
// (same pattern — each domain owns its own endpoint, see app.js).
export const futuresStripeWebhook = async (req, res, next) => {
  try {
    let event;
    const sig = req.headers["stripe-signature"];
    const secret = process.env.STRIPE_FUTURES_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;

    if (secret && sig) {
      try {
        event = stripe.webhooks.constructEvent(req.body, sig, secret);
      } catch (err) {
        return res.status(400).json({ error: `Webhook signature error: ${err.message}` });
      }
    } else if (process.env.NODE_ENV !== "production") {
      // req.body is the raw Buffer here (see app.js's express.raw()
      // registration for this path) — must parse it ourselves since there's
      // no signature to verify through stripe.webhooks.constructEvent.
      event = JSON.parse(req.body.toString());
    } else {
      return res.status(400).json({ error: "Missing webhook signature" });
    }

    switch (event.type) {
      case "invoice.paid":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await handleSubscriptionLifecycleEvent(event);
        break;
      }
      case "payment_intent.succeeded": {
        await handleProjectSupportSucceeded(event);
        break;
      }
      case "payment_intent.payment_failed": {
        const pi = event.data.object;
        if (pi.metadata?.kind === "futures_project_support") {
          await FuturesProjectSupport.findOneAndUpdate(
            { stripePaymentIntentId: pi.id },
            { status: "failed" }
          );
        }
        break;
      }
      default:
        break;
    }

    return res.status(200).send("ok");
  } catch (e) {
    next(e);
  }
};

async function handleSubscriptionLifecycleEvent(event) {
  const obj = event.data.object;
  const subscriptionId =
    event.type === "invoice.paid" ? obj.subscription : obj.id;
  if (!subscriptionId) return;

  const subscription =
    event.type === "invoice.paid"
      ? await stripe.subscriptions.retrieve(subscriptionId)
      : obj;

  const status =
    event.type === "customer.subscription.deleted"
      ? "canceled"
      : mapSubscriptionStatus(subscription.status);

  const kind = subscription.metadata?.kind;

  if (kind === "futures_membership") {
    const membership = await FuturesMembership.findOneAndUpdate(
      { stripeSubscriptionId: subscriptionId },
      { $set: { status } },
      { new: true }
    );
    if (membership && status === "active" && event.type !== "customer.subscription.updated") {
      await Notification.create({
        userId: membership.userId,
        category: "payment",
        description: `Your Fame Futures ${membership.plan} membership is now active.`,
        referenceModel: "FuturesMembership",
        referenceId: membership._id,
      }).catch(() => {});
    }
  } else if (kind === "futures_fan_subscription") {
    const sub = await FuturesFanSubscription.findOneAndUpdate(
      { stripeSubscriptionId: subscriptionId },
      { $set: { status } },
      { new: true }
    );
    if (sub && status === "active" && event.type !== "customer.subscription.updated") {
      await Notification.create({
        userId: sub.talentId,
        category: "payment",
        description: `You have a new fan subscriber!`,
        referenceModel: "FuturesFanSubscription",
        referenceId: sub._id,
      }).catch(() => {});
    }
  }
}

async function handleProjectSupportSucceeded(event) {
  const pi = event.data.object;
  if (pi.metadata?.kind !== "futures_project_support") return;

  const support = await FuturesProjectSupport.findOneAndUpdate(
    { stripePaymentIntentId: pi.id, status: { $ne: "paid" } },
    { $set: { status: "paid" } },
    { new: true }
  );
  if (!support) return;

  const project = await FuturesProject.findOneAndUpdate(
    { _id: support.projectId },
    { $inc: { total_raised: support.amount } },
    { new: true }
  );
  if (project && project.funding_goal > 0 && project.total_raised >= project.funding_goal) {
    await FuturesProject.updateOne({ _id: project._id }, { $set: { status: "funded" } });
  }

  if (project) {
    await Notification.create({
      userId: project.talentId,
      category: "payment",
      description: `New crowdfunding support: $${support.amount} for "${project.title}".`,
      referenceModel: "FuturesProject",
      referenceId: project._id,
    }).catch(() => {});
  }
}

// controllers/billingController.js
import stripe from "../services/stripeClient.js";
import mongoose from "mongoose";
import Event from "../models/eventModel.js";
import Payment from "../models/paymentModel.js";
import Ticket from "../models/ticketModel.js";
import Session from "../models/sessionModel.js";
import FanInverseRequest from "../models/fanInverseRequestModel.js";
import User from "../models/user.js";
import Notification from "../models/notificationModel.js";
import Talent from "../models/talentModel.js";
import { logTalentRevenue } from "../services/talentRevenueService.js";
import {
  calcUnitPriceFromEvent,
  getDiscountPercentFromEvent,
  safeTotal,
  toMinorUnits,
} from "../utils/money.js";

function assert(v, msg, code = 400) {
  if (!v) {
    const err = new Error(msg);
    err.status = code;
    throw err;
  }
}

export async function ensureStripeCustomer(user) {
  if (user.stripeCustomerId) return user.stripeCustomerId;

  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name,
    metadata: { userId: String(user._id) },
  });

  user.stripeCustomerId = customer.id;
  await user.save();
  return customer.id;
}

// GET /api/billing/quote?eventId=...&quantity=1
export const getQuote = async (req, res, next) => {
  try {
    const { eventId, quantity = 1, currency = "usd" } = req.query;
    assert(eventId, "Missing eventId");

    const event = await Event.findById(eventId).lean();
    assert(event, "Event not found", 404);
    assert(event.status === "active", "Event is not active", 400);

    const now = new Date();
    assert(new Date(event.datetime) >= now, "Event already in the past", 400);

    const unitPrice = calcUnitPriceFromEvent(event);
    const amount = safeTotal(unitPrice, quantity);
    const amountInMinor = toMinorUnits(amount, currency);

    return res.json({
      success: true,
      eventId,
      quantity: Number(quantity),
      currency,
      breakdown: { unitPrice, amount, amountInMinor },
      eventTitle: event.title,
      datetime: event.datetime,
    });
  } catch (e) {
    next(e);
  }
};

// POST /api/billing/payment-intents
// Body: { eventId, quantity?, currency?, save_payment_method?, customerId? }
export const createPaymentIntent = async (req, res, next) => {
  try {
    const userId = req.user?._id; // assume auth middleware sets req.user
    assert(userId, "Unauthorized", 401);

    const {
      eventId,
      quantity: qIn = 1,
      currency = "usd",
      save_payment_method = false,
      customerId, // optional if you manage Stripe Customers
      attendees,
      discount_code,
      no_of_persons,
      type = "event",
    } = req.body;

    assert(eventId, "Missing eventId");

    const event = await Event.findById(eventId).lean();
    assert(event, "Event not found", 404);
    assert(event.status === "active", "Event is not active", 400);

    const now = new Date();
    assert(new Date(event.datetime) >= now, "Event already in the past", 400);

    const normAttendees = Array.isArray(attendees)
      ? attendees
          .map((a) => ({
            fullName: String(a.fullName || "").trim(),
            email: String(a.email || "")
              .trim()
              .toLowerCase(),
            phone: String(a.phone || "").trim(),
            userId:
              a.userId && mongoose.Types.ObjectId.isValid(a.userId)
                ? new mongoose.Types.ObjectId(a.userId)
                : undefined,
          }))
          .filter((a) => a.fullName.length > 0)
      : [];

    // Admit count logic:
    // 1) Prefer explicit no_of_persons if provided and >0
    // 2) Else, use attendees.length if >0
    // 3) Else, fallback to quantity
    const quantity = Math.max(1, Number(qIn) || 1);

    const personsFromProp =
      Number(no_of_persons) > 0 ? Number(no_of_persons) : null;
    const personsFromAttendees =
      normAttendees.length > 0 ? normAttendees.length : null;
    const admitCount = personsFromProp || personsFromAttendees || quantity;

    // optional guard: don't allow no_of_persons < attendees.length
    if (personsFromProp && normAttendees.length > personsFromProp) {
      return res.status(400).json({
        success: false,
        error: "no_of_persons cannot be less than attendees count",
      });
    }

    // --- soft capacity check (fast fail; still rechecked atomically later) ---
    const remaining =
      (Number(event.no_of_persons) || 0) -
      (Number(event.totalSoldTickets) || 0);
    // assert(quantity <= remaining, "Not enough seats available", 400);

    const codePct = getDiscountPercentFromEvent(event, discount_code);
    const unitPrice = calcUnitPriceFromEvent(event, codePct);
    // Then compute totals:
    const amount = safeTotal(unitPrice, admitCount);
    const amountInMinor = toMinorUnits(amount, currency);

    // console.log("codepct", codePct);
    // console.log("unitPrice", unitPrice);
    // console.log("amount", amount);
    // console.log("amountInMinor", amountInMinor);

    assert(amountInMinor >= 50, "Amount too small", 400); // min $0.50

    // ===== FREE FLOW =====
    if (event.is_free === true) {
      // 1) Atomically increment seats (no transaction).
      //    Prevent oversell using $expr guard: (no_of_persons - totalSoldTickets) >= quantity
      const evtAfter = await Event.findOneAndUpdate(
        event._id,
        { $inc: { totalSoldTickets: admitCount } },

        { new: true }
      );

      if (!evtAfter) {
        return res
          .status(400)
          .json({ success: false, error: "Not enough seats available" });
      }

      // 2) Issue tickets (mark as free)
      const ticket = await Ticket.create({
        userId,
        eventId: event._id,
        paymentId: null,
        quantity: admitCount,
        no_of_persons: admitCount,
        attendees: normAttendees, // <-- store all provided attendees
        status: "CONFIRMED",
        isFree: true,
      });

      // 3) Optional: record a zero-amount Payment for reporting
      await Payment.create({
        userId,
        eventId: event._id,
        quantity: admitCount,
        type,
        currency,
        unitPrice: 0,
        amount: 0,
        amountInMinor: 0,
        stripePaymentIntentId: null,
        status: "succeeded",
        meta: {
          title: event.title,
          datetime: event.datetime,
          free: true,
          finalized: true,
          no_of_persons: admitCount,
          attendees: normAttendees,
        },
      });

      return res.json({
        success: true,
        free: true,
        ticketId: String(ticket._id),
        eventId: String(event._id),
        soldTotal: evtAfter.totalSoldTickets,
        message: "Free tickets issued",
      });
    }

    // Create PI (automatic payment methods enabled; no redirects for custom UI)
    const pi = await stripe.paymentIntents.create({
      amount: amountInMinor,
      currency,
      ...(customerId ? { customer: customerId } : {}),
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      setup_future_usage: save_payment_method ? "off_session" : undefined,
      metadata: {
        eventId: String(event._id),
        userId: String(userId),
        quantity: String(admitCount),
        unitPrice: String(unitPrice),
      },
    });

    // Upsert a local record (pending)
    await Payment.findOneAndUpdate(
      { stripePaymentIntentId: pi.id },
      {
        userId,
        eventId: event._id,
        quantity: admitCount,
        currency,
        unitPrice,
        amount,
        amountInMinor,
        stripePaymentIntentId: pi.id,
        status: pi.status,
        meta: {
          title: event.title,
          datetime: event.datetime,
          no_of_persons: admitCount,
          attendees: normAttendees,
        },
      },
      { upsert: true, new: true }
    );

    return res.json({
      success: true,
      paymentIntentId: pi.id,
      clientSecret: pi.client_secret,
      status: pi.status,
      currency,
      amountInMinor,
      amount,
    });
  } catch (e) {
    console.log("error", e);
    next(e);
  }
};

// OPTIONAL: server-side confirm (if you collect a payment_method on client)
// POST /api/billing/confirm
// Body: { paymentIntentId, paymentMethodId, return_url? }
export const confirmPaymentIntent = async (req, res, next) => {
  try {
    const { paymentIntentId, paymentMethodId, return_url } = req.body;
    assert(paymentIntentId, "Missing paymentIntentId");

    const pi = await stripe.paymentIntents.confirm(paymentIntentId, {
      ...(paymentMethodId ? { payment_method: paymentMethodId } : {}),
      ...(return_url ? { return_url } : {}),
    });

    // reflect status locally
    await Payment.findOneAndUpdate(
      { stripePaymentIntentId: paymentIntentId },
      { status: pi.status },
      { new: true }
    );

    return res.json({
      success: true,
      paymentIntentId: pi.id,
      status: pi.status,
      clientSecret: pi.client_secret,
    });
  } catch (e) {
    next(e);
  }
};

// GET /api/billing/payment-intents/:id
export const retrievePaymentIntent = async (req, res, next) => {
  try {
    const { id } = req.params;
    assert(id, "Missing id");

    const pi = await stripe.paymentIntents.retrieve(id);
    return res.json({ success: true, paymentIntent: pi });
  } catch (e) {
    next(e);
  }
};

// Webhook: POST /api/billing/webhook  (raw body)
// Handle success/failure and mark Payment accordingly.
export const stripeWebhook = async (req, res, next) => {
  try {
    let event;

    const sig = req.headers["stripe-signature"];
    const secret = process.env.STRIPE_WEBHOOK_SECRET;

    if (secret && sig) {
      try {
        event = stripe.webhooks.constructEvent(req.body, sig, secret);
      } catch (err) {
        return res.status(400).json({ error: `Webhook signature error: ${err.message}` });
      }
    } else if (process.env.NODE_ENV !== "production") {
      // Allow unsigned events only in development
      event = req.body;
    } else {
      return res.status(400).json({ error: "Missing webhook signature" });
    }

    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event?.data?.object;
        if (!pi?.id) break;

        // Idempotency guard: only proceed if not already finalized
        const payment = await Payment.findOneAndUpdate(
          { stripePaymentIntentId: pi.id, "meta.finalized": { $ne: true } },
          { $set: { status: "succeeded" } },
          { new: true }
        );

        // Unknown payment or already finalized
        if (!payment) break;

        // This endpoint's remaining logic is event-ticket-specific
        // (capacity check against payment.eventId, Ticket.create). Other
        // payment types (product/merch, and session bookings — which
        // confirm via confirmInverseSessionPayment's own direct Stripe
        // lookup instead of this webhook) must not fall through into it,
        // or a merch purchase's succeeded event ends up mistakenly marked
        // "failed" here for having no matching Event.
        if (payment.type !== "event") break;

        const qty = Number(payment.quantity) || 1;
        const metaAttendees = Array.isArray(payment.meta?.attendees)
          ? payment.meta.attendees
          : [];
        const metaPersons = Number(payment.meta?.no_of_persons) || qty;

        // Atomically check capacity + event eligibility and increment sold seats
        const eventUpdate = await Event.updateOne(
          {
            _id: payment.eventId,
            status: "active",
            datetime: { $gte: new Date() }, // event not in the past
            // Ensure we don't exceed capacity: totalSoldTickets + metaPersons <= no_of_persons
            $expr: {
              $lte: [
                { $add: ["$totalSoldTickets", metaPersons] },
                "$no_of_persons",
              ],
            },
          },
          { $inc: { totalSoldTickets: metaPersons } }
        );

        if (eventUpdate.modifiedCount === 0) {
          // Capacity exceeded OR event inactive/past → mark failed
          await Payment.updateOne(
            { _id: payment._id },
            {
              $set: {
                status: "failed",
                "meta.failReason": "capacity_or_ineligible_event",
              },
            }
          );
          break;
        }

        // Issue tickets (no transaction, but safe because seats were already reserved atomically)
        await Ticket.create([
          {
            userId: payment.userId,
            eventId: payment.eventId,
            paymentId: payment._id,
            quantity: qty,
            no_of_persons: metaPersons,
            attendees: metaAttendees,
            status: "CONFIRMED",
            isFree: false,
          },
        ]);

        // Mark finalized so duplicate webhooks won't double-issue
        await Payment.updateOne(
          { _id: payment._id },
          { $set: { "meta.finalized": true } }
        );

        break;
      }
      case "payment_intent.payment_failed": {
        const pi = event.data.object;
        await Payment.findOneAndUpdate(
          { stripePaymentIntentId: pi.id },
          { status: "payment_failed" },
          { new: true }
        );
        break;
      }
      case "payment_intent.canceled": {
        const pi = event.data.object;
        await Payment.findOneAndUpdate(
          { stripePaymentIntentId: pi.id },
          { status: "canceled" },
          { new: true }
        );
        break;
      }
      default:
        // handle other events if you enable more PM types
        break;
    }

    return res.status(200).send("ok");
  } catch (e) {
    next(e);
  }
};

// *********************************************  stripe payment for sessions *********************************************

// ---------- core creators ----------
/**
 * Creates a PaymentIntent and a Payment doc for a SESSION purchase.
 * Returns { paymentDoc, paymentIntent, clientSecret }
 */
export async function createSessionPayment({
  user,
  session,
  quantity = 1,
  meta = {},
}) {
  // Helper to get total price for selected accessTypes
  function getTotalAccessTypePrice(session) {
    if (!Array.isArray(session.accessType)) return 0;
    // Only sum prices for accessType objects that exist and have a valid price
    return session.accessType.reduce((sum, item) => {
      if (typeof item.price === "number" && item.price > 0) {
        return sum + item.price;
      }
      return sum;
    }, 0);
  }

  const currency = (session.currency || "usd").toLowerCase();
  const unitPrice = getTotalAccessTypePrice(session);
  if (typeof unitPrice !== "number" || unitPrice <= 0) {
    throw new Error("Invalid or missing accessType price.");
  }
  const qty = Math.max(1, Number(quantity));
  const amount = unitPrice * qty; // major units
  const amountInMinor = toMinorUnits(amount, currency);

  if (amountInMinor <= 0) {
    throw new Error("Invalid session amount (<= 0).");
  }

  const customerId = await ensureStripeCustomer(user);

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountInMinor,
    currency,
    customer: customerId,
    automatic_payment_methods: { enabled: true }, // client will confirm
    metadata: {
      type: "session",
      userId: String(user._id),
      sessionId: String(session._id),
      ...(meta?.fanRequestId
        ? { fanRequestId: String(meta.fanRequestId) }
        : {}),
      ...(meta?.talentId ? { talentId: String(meta.talentId) } : {}),
    },
  });

  const paymentDoc = await Payment.create({
    userId: user._id,
    sessionId: session._id,
    type: "session",
    quantity: qty,
    currency,
    unitPrice,
    amount,
    amountInMinor,
    provider: "stripe",
    stripePaymentIntentId: paymentIntent.id,
    status: paymentIntent.status,
    meta,
  });

  return {
    paymentDoc,
    paymentIntent,
    clientSecret: paymentIntent.client_secret,
  };
}

// ============================================================================
// Inverse Session Checkout (frontend "fast checkout" for inverse bookings)
// ============================================================================

function getSessionUnitPrice(session) {
  if (!Array.isArray(session?.accessType)) return 0;
  return session.accessType.reduce((sum, item) => {
    const p = Number(item?.price);
    return p > 0 ? sum + p : sum;
  }, 0);
}

// POST /api/billing/inverse-session/payment-intent
// Body: { sessionId, talentId, currency?, fanRequestId? }
// Returns: { clientSecret, paymentIntentId, amount, amountInMinor, currency }
export const createInverseSessionPaymentIntent = async (req, res, next) => {
  try {
    assert(req.user?._id, "Unauthorized", 401);

    const { sessionId, talentId, currency: cIn, fanRequestId } = req.body || {};
    assert(sessionId, "Missing sessionId");
    assert(talentId, "Missing talentId");
    assert(mongoose.Types.ObjectId.isValid(sessionId), "Invalid sessionId");
    assert(mongoose.Types.ObjectId.isValid(talentId), "Invalid talentId");

    const session = await Session.findById(sessionId).lean();
    assert(session, "Session not found", 404);
    assert(session.isActive !== false, "Session is not active", 400);

    const talent = await User.findById(talentId).lean();
    assert(talent, "Talent not found", 404);

    const currency = String(cIn || session.currency || "usd").toLowerCase();
    const unitPrice = getSessionUnitPrice(session);
    assert(unitPrice > 0, "Session has no priced access types", 400);

    const amount = Number(unitPrice.toFixed(2));
    const amountInMinor = toMinorUnits(amount, currency);
    assert(amountInMinor >= 50, "Amount too small", 400);

    const customerId = await ensureStripeCustomer(
      await User.findById(req.user._id)
    );

    const pi = await stripe.paymentIntents.create({
      amount: amountInMinor,
      currency,
      customer: customerId,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      metadata: {
        type: "inverse_session",
        kind: "inverse_session",
        userId: String(req.user._id),
        sessionId: String(session._id),
        talentId: String(talent._id),
        ...(fanRequestId ? { fanRequestId: String(fanRequestId) } : {}),
      },
    });

    await Payment.findOneAndUpdate(
      { stripePaymentIntentId: pi.id },
      {
        $setOnInsert: {
          userId: req.user._id,
          sessionId: session._id,
          type: "session",
          quantity: 1,
          currency,
          unitPrice,
          amount,
          amountInMinor,
          stripePaymentIntentId: pi.id,
        },
        $set: {
          status: pi.status,
          meta: {
            kind: "inverse_session",
            sessionId: String(session._id),
            talentId: String(talent._id),
            ...(fanRequestId ? { fanRequestId: String(fanRequestId) } : {}),
          },
        },
      },
      { upsert: true, new: true }
    );

    return res.json({
      success: true,
      paymentIntentId: pi.id,
      clientSecret: pi.client_secret,
      status: pi.status,
      amount,
      amountInMinor,
      currency,
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ success: false, message: e.message });
    next(e);
  }
};

// POST /api/billing/inverse-session/confirm
// Body: { paymentIntentId, sessionId, talentId, date, time, location?, paymentMethod? }
// Verifies PI succeeded, idempotently creates a FanInverseRequest, returns booking.
export const confirmInverseSessionPayment = async (req, res, next) => {
  try {
    assert(req.user?._id, "Unauthorized", 401);

    const {
      paymentIntentId,
      sessionId,
      talentId,
      date,
      time,
      location,
      paymentMethod,
    } = req.body || {};

    assert(paymentIntentId, "Missing paymentIntentId");

    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    assert(pi, "PaymentIntent not found", 404);

    if (String(pi.metadata?.userId || "") !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: "PaymentIntent does not belong to this user" });
    }
    if (pi.metadata?.type !== "inverse_session" && pi.metadata?.kind !== "inverse_session") {
      return res.status(400).json({ success: false, message: "PaymentIntent is not an inverse session" });
    }
    if (pi.status !== "succeeded") {
      return res.status(400).json({
        success: false,
        message: `PaymentIntent not yet succeeded (status: ${pi.status})`,
        status: pi.status,
      });
    }

    const finalSessionId = sessionId || pi.metadata?.sessionId;
    const finalTalentId = talentId || pi.metadata?.talentId;
    assert(finalSessionId, "Missing sessionId");
    assert(finalTalentId, "Missing talentId");

    // Reflect PI status on Payment doc
    const payment = await Payment.findOneAndUpdate(
      { stripePaymentIntentId: pi.id },
      { $set: { status: pi.status, paidAt: new Date() } },
      { new: true }
    );

    // Idempotency: if a FanInverseRequest already linked to this Payment, return it.
    if (payment?._id) {
      const existing = await FanInverseRequest.findOne({ paymentId: payment._id }).lean();
      if (existing) {
        return res.json({
          success: true,
          already_confirmed: true,
          fanRequest: existing,
          payment,
        });
      }
    }

    const session = await Session.findById(finalSessionId).lean();
    assert(session, "Session not found", 404);

    const talent = await User.findById(finalTalentId).lean();
    assert(talent, "Talent not found", 404);

    let bookingDate = date ? new Date(date) : null;
    if (!bookingDate || Number.isNaN(bookingDate.getTime())) {
      // Fall back to session's own date/time if not provided
      bookingDate = session.sessionDate ? new Date(session.sessionDate) : new Date();
    }
    const bookingTime = time || session.sessionTime || "00:00";
    const pm = paymentMethod === "Debit Card" ? "Debit Card" : "Credit Card";

    const fanRequest = await FanInverseRequest.create({
      talentName: talent.stage_name || talent.full_name || talent.name || "Talent",
      talentId: talent._id,
      fanId: req.user._id,
      date: bookingDate,
      time: bookingTime,
      location: location || session.where || "",
      paymentMethod: pm,
      ispaid: true,
      paymentStatus: "succeeded",
      status: "accepted",
      sessionId: session._id,
      paymentId: payment?._id,
    });

    // Best-effort talent-revenue logging (feeds the quarterly dividend pool
    // calculation, services/dividendScheduler.js) — only when this booked
    // User also has a real, tradeable Talent doc. A booking-only talent
    // with no Talent doc has nowhere to attribute the revenue to; skip
    // rather than error the payment.
    try {
      const tradeableTalent = await Talent.findOne({ userId: talent._id }).lean();
      if (tradeableTalent && payment?.amount) {
        await logTalentRevenue({
          talent_id: tradeableTalent._id,
          talent_name: tradeableTalent.name,
          revenue_type: "appearance_fees",
          amount: payment.amount,
          source_id: fanRequest._id,
          source_description: `Inverse session booking (${session.sessionLength || ""}min)`.trim(),
        });
      }
    } catch (err) {
      console.error("logTalentRevenue (appearance_fees) failed (non-fatal):", err.message);
    }

    // Best-effort notifications (do not fail the request if notifications fail)
    try {
      await Notification.create({
        userId: talent._id,
        category: "payment",
        description: `New paid inverse session booking from ${req.user?.name || "a fan"}.`,
        referenceModel: "FanInverseRequest",
        referenceId: fanRequest._id,
      });
      await Notification.create({
        userId: req.user._id,
        category: "payment",
        description: `Your inverse session booking is confirmed.`,
        referenceModel: "FanInverseRequest",
        referenceId: fanRequest._id,
      });
    } catch (nerr) {
      console.warn("Inverse confirm notification error:", nerr.message);
    }

    return res.json({
      success: true,
      already_confirmed: false,
      fanRequest,
      payment,
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ success: false, message: e.message });
    next(e);
  }
};

// GET /api/billing/inverse-session/quote?sessionId=...
export const getInverseSessionQuote = async (req, res, next) => {
  try {
    const { sessionId, currency: cIn = "usd" } = req.query;
    assert(sessionId, "Missing sessionId");
    assert(mongoose.Types.ObjectId.isValid(sessionId), "Invalid sessionId");

    const session = await Session.findById(sessionId).lean();
    assert(session, "Session not found", 404);

    const currency = String(cIn || "usd").toLowerCase();
    const unitPrice = getSessionUnitPrice(session);
    const amountInMinor = toMinorUnits(unitPrice, currency);

    return res.json({
      success: true,
      sessionId,
      currency,
      unitPrice,
      amount: unitPrice,
      amountInMinor,
      sessionLength: session.sessionLength,
      accessType: session.accessType,
      where: session.where,
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ success: false, message: e.message });
    next(e);
  }
};

const ALLOWED_STATUSES = new Set([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "processing",
  "succeeded",
  "canceled",
  "payment_failed",
]);

function toObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : null;
}

function parseQuery(req) {
  const {
    status,
    eventId,
    currency,
    created_from,
    created_to,
    min_amount, // major units (e.g., 10.5)
    max_amount,
    include = "", // "event,user" (optional populate hints)
    sort_by = "createdAt",
    order = "desc",
    page = "1",
    limit = "20",
    q, // free text: pi id
  } = req.query;

  const match = {};
  if (status) {
    const s = String(status).toLowerCase().trim();
    if (ALLOWED_STATUSES.has(s)) match.status = s;
  }

  if (eventId) {
    const oid = toObjectId(eventId);
    if (oid) match.eventId = oid;
  }

  if (currency) match.currency = String(currency).toLowerCase();

  // Date range
  if (created_from || created_to) {
    match.createdAt = {};
    if (created_from) match.createdAt.$gte = new Date(created_from);
    if (created_to) match.createdAt.$lte = new Date(created_to);
  }

  // Amount range (major units → minor)
  const toMinor = (v) => Math.round(Number(v) * 100);
  if (min_amount)
    match.amountInMinor = {
      ...(match.amountInMinor || {}),
      $gte: toMinor(min_amount),
    };
  if (max_amount)
    match.amountInMinor = {
      ...(match.amountInMinor || {}),
      $lte: toMinor(max_amount),
    };

  // Simple search by PI id prefix
  if (q) match.stripePaymentIntentId = new RegExp(`^${String(q).trim()}`, "i");

  const sort = { [sort_by]: order === "asc" ? 1 : -1 };

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const skip = (pageNum - 1) * limitNum;

  const populateEvent = include
    .split(",")
    .map((s) => s.trim())
    .includes("event");
  const populateUser = include
    .split(",")
    .map((s) => s.trim())
    .includes("user");

  return { match, sort, skip, limitNum, pageNum, populateEvent, populateUser };
}

async function listCore({
  match,
  sort,
  skip,
  limitNum,
  pageNum,
  populateEvent,
  populateUser,
}) {
  // Main list
  const query = Payment.find(match)
    .sort(sort)
    .skip(skip)
    .limit(limitNum)
    .select({
      userId: 1,
      eventId: 1,
      quantity: 1,
      currency: 1,
      unitPrice: 1,
      amount: 1,
      amountInMinor: 1,
      stripePaymentIntentId: 1,
      status: 1,
      createdAt: 1,
      meta: 1,
      //  meta.description: 1,""
    })
    .lean();

  if (populateEvent) {
    query.populate({
      path: "eventId",
      select:
        "title datetime price details talent category location address website logo event_cover event_images event_coordinates totalSoldTickets",
      populate: { path: "talent", select: "name images" },
    });
  }
  if (populateUser) {
    query.populate({
      path: "userId",
      select: "name email phone images",
    });
  }

  const [items, totalCount, sums] = await Promise.all([
    query.exec(),
    Payment.countDocuments(match),
    Payment.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          grossMinor: { $sum: "$amountInMinor" },
        },
      },
    ]),
  ]);

  const byStatus = Object.fromEntries(
    sums.map((s) => [
      s._id,
      {
        count: s.count,
        gross: Number((s.grossMinor / 100).toFixed(2)),
        grossInMinor: s.grossMinor,
      },
    ])
  );

  const totalPages = Math.ceil(totalCount / limitNum) || 1;
  const summary = {
    totalCount,
    byStatus,
    pageInfo: {
      page: pageNum,
      limit: limitNum,
      totalPages,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1,
    },
  };

  return { items, summary };
}

/**
 * GET /api/billing/transactions  (platform-wide)
 * Query:
 *  - status, eventId, currency, created_from, created_to, min_amount, max_amount
 *  - q (search by PI id prefix)
 *  - include=event,user
 *  - sort_by (default createdAt), order (asc|desc), page, limit
 */
export const listPlatformTransactions = async (req, res, next) => {
  try {
    const parsed = parseQuery(req);
    const data = await listCore(parsed);
    res.json({ success: true, ...data });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/billing/users/:userId/transactions  (user-specific)
 * Same query params as platform endpoint.
 */
export const listUserTransactions = async (req, res, next) => {
  try {
    const parsed = parseQuery(req);
    const uid = toObjectId(req.params.userId);
    if (!uid)
      return res.status(400).json({ success: false, error: "Invalid userId" });

    parsed.match.userId = uid;

    if (String(req.user?._id) !== String(uid) && !req.user?.isAdmin) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    const data = await listCore(parsed);
    res.json({ success: true, ...data });
  } catch (err) {
    next(err);
  }
};

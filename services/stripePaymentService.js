// services/stripePaymentService.js
import Stripe from "stripe";
import Payment from "../models/paymentModel.js";
import FanInverseRequest from "../models/fanInverseRequestModel.js";
import Notification from "../models/notificationModel.js";
import Session from "../models/sessionModel.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

/**
 * POST /stripe/webhook   (unsafe dev handler; no signature verification)
 * Accepts either:
 *  - { "paymentIntentId": "pi_..." }  (Postman-friendly), OR
 *  - a Stripe-like event with data.object = payment_intent
 */
export async function handleStripeWebhook(req, res) {
  try {
    // normalize body for both express.json() and express.raw()
    const body = Buffer.isBuffer(req.body)
      ? JSON.parse(req.body.toString("utf8"))
      : req.body;

    let pi = null;

    if (body?.paymentIntentId) {
      // Minimal Postman body — fetch PI from Stripe
      pi = await stripe.paymentIntents.retrieve(body.paymentIntentId);
    } else if (
      body?.data?.object?.object === "payment_intent" &&
      body?.data?.object?.id
    ) {
      // Full Stripe-like payload
      pi = body.data.object;
    }

    if (!pi) {
      return res.status(400).json({
        ok: false,
        message:
          "No payment_intent in payload. Send either { paymentIntentId } OR a Stripe event with data.object=payment_intent.",
      });
    }

    const { payment, fanRequest } = await applyPaymentIntentStatus(pi);

    return res.json({
      ok: true,
      eventType: `payment_intent.${pi.status}`,
      paymentIntentId: pi.id,
      payment,
      fanRequest,
    });
  } catch (err) {
    console.error("Webhook processing error:", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
}

/**
 * Ensure a Payment exists for this PI, then update status & side-effects.
 */
export async function applyPaymentIntentStatus(pi) {
  const payment = await upsertPaymentFromStripePI(pi);
  if (!payment) return { payment: null, fanRequest: null };
  console.log(pi);
  // ---- side effects for session payments
  let fanRequest = null;

  if (String(payment.type) === "session") {
    const meta = payment.meta || {};
    const fanRequestId = meta.fanRequestId;
    const fan = await FanInverseRequest.findById(fanRequestId).lean();
    console.log("Fan Request in webhook:", fanRequestId, meta);
    const session = await Session.findById(meta.sessionId).lean();
    if (fanRequestId) {
      console.log("in");
      if (pi.status === "succeeded") {
        console.log("in succeeded");
        fanRequest = await FanInverseRequest.findByIdAndUpdate(
          fanRequestId,
          {
            $set: {
              paymentStatus: "succeeded",
              status: "confirmed", // or 'pending_talent_confirm'
              paymentId: payment._id,
            },
          },
          { new: true }
        ).lean();
        console.log("in before notifysucceeded");

        if (meta.talentId) {
          console.log("in  notifysucceeded");
          await Notification.create({
            userId: meta.talentId,
            category: "payment",
            description: `Payment received for request from ${fan.name} on ${session.sessionDate} ${session.sessionTime} and accessType is ${session.accessType} ${session.where}.`,
            referenceModel: "Payment",
            referenceId: payment._id,
          });
        }

        await Notification.create({
          userId: payment.userId,
          category: "payment",
          description: `Your payment for the request has succeeded.`,
          referenceModel: "Payment",
          referenceId: payment._id,
        });
      } else if (pi.status === "payment_failed") {
        fanRequest = await FanInverseRequest.findByIdAndUpdate(
          fanRequestId,
          { $set: { paymentStatus: "payment_failed" } },
          { new: true }
        ).lean();

        await Notification.create({
          userId: payment.userId,
          category: "payment",
          description: `Your request payment failed.`,
          referenceModel: "Payment",
          referenceId: payment._id,
        });
      } else if (pi.status === "canceled") {
        fanRequest = await FanInverseRequest.findByIdAndUpdate(
          fanRequestId,
          { $set: { paymentStatus: "canceled" } },
          { new: true }
        ).lean();

        await Notification.create({
          userId: payment.userId,
          category: "payment",
          description: `Your request payment was canceled.`,
          referenceModel: "Payment",
          referenceId: payment._id,
        });
      } else if (pi.status === "processing") {
        fanRequest = await FanInverseRequest.findByIdAndUpdate(
          fanRequestId,
          { $set: { paymentStatus: "processing" } },
          { new: true }
        ).lean();
      }
    }
  }

  // TODO: add parallel "event" branch when you wire event payments

  return { payment, fanRequest };
}

/**
 * Upsert Payment from Stripe PI WITHOUT conflicting operators.
 *  - $setOnInsert: ONLY one-time fields
 *  - $set: fields updated every time (status/meta/paidAt)
 */
async function upsertPaymentFromStripePI(pi) {
  const meta = pi.metadata || {};
  const currency = String(pi.currency || "usd").toLowerCase();
  const amountInMinor = Number(pi.amount || 0);
  const amount = amountInMinor / 100;

  // infer type if not explicit
  const inferredType =
    meta.type ||
    (meta.sessionId ? "session" : meta.eventId ? "event" : undefined);

  // --- one-time fields (NO status/meta/paidAt here)
  const setOnInsert = {
    userId: meta.userId || undefined,
    sessionId: meta.sessionId || undefined,
    eventId: meta.eventId || undefined,
    type: inferredType, // "session" | "event"
    quantity: Number(meta.quantity || 1),
    currency,
    unitPrice: Number(meta.unitPrice || amount),
    amount,
    amountInMinor,
    provider: "stripe",
    stripePaymentIntentId: pi.id,
  };

  // --- always-updated fields
  const setEveryTime = {
    status: pi.status,
    meta, // keep latest metadata from Stripe
    ...(pi.status === "succeeded" ? { paidAt: new Date() } : {}),
  };

  // IMPORTANT: don't put the same keys in both operators
  const updated = await Payment.findOneAndUpdate(
    { stripePaymentIntentId: pi.id },
    { $setOnInsert: setOnInsert, $set: setEveryTime },
    { new: true, upsert: true }
  ).lean();

  return updated;
}

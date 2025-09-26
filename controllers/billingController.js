// controllers/billingController.js
import Stripe from "stripe";
import dotenv from "dotenv";
import mongoose from "mongoose";
import Event from "../models/eventModel.js";
import Payment from "../models/paymentModel.js";
import Ticket from "../models/ticketModel.js";
import {
  calcUnitPriceFromEvent,
  safeTotal,
  toMinorUnits,
} from "../utils/money.js";

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function assert(v, msg, code = 400) {
  if (!v) {
    const err = new Error(msg);
    err.status = code;
    throw err;
  }
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
      no_of_persons,
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

    const unitPrice = calcUnitPriceFromEvent(event);
    const amount = safeTotal(unitPrice, admitCount);
    const amountInMinor = toMinorUnits(amount, currency);
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
      console.log(evtAfter);

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

    // Unsafe fallback for local testing without signature
    event = req.body;

    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.id;

        // idempotency guard: if we already finalized, bail
        const payment = await Payment.findOneAndUpdate(
          { stripePaymentIntentId: pi.id },
          { status: "succeeded" },
          { new: true }
        );
        if (!payment) break; // unknown payment, ignore (or log)
        if (payment.meta?.finalized) break; // already issued tickets before

        // finalize in a transaction
        const session = await mongoose.startSession();
        await session.withTransaction(async () => {
          // Re-read the Event inside the txn
          const evt = await Event.findById(payment.eventId).session(session);
          if (!evt) throw new Error("Event not found");

          // hard checks at finalize time
          if (evt.status !== "active") {
            throw new Error("Event not active");
          }
          if (new Date(evt.datetime) < new Date()) {
            throw new Error("Event already in the past");
          }
          const metaAttendees = Array.isArray(payment.meta?.attendees)
            ? payment.meta.attendees
            : [];
          const qty = payment.quantity || 1;
          const metaPersons = Number(payment.meta?.no_of_persons) || qty;
          const remaining = evt.no_of_persons - evt.totalSoldTickets;
          if (qty > remaining) {
            // not enough seats → mark payment as failed/refund later
            await Payment.updateOne(
              { _id: payment._id },
              { status: "failed", "meta.failReason": "capacity_exceeded" },
              { session }
            );
            // throw new Error("Not enough seats available");
          }

          // 1) Increment sold seats atomically
          await Event.updateOne(
            { _id: evt._id },
            { $inc: { totalSoldTickets: metaPersons } },
            { session }
          );

          // 2) Issue tickets
          await Ticket.create(
            [
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
            ],
            { session }
          );

          // 3) mark finalized so repeated webhooks don't double-issue
          await Payment.updateOne(
            { _id: payment._id },
            { "meta.finalized": true },
            { session }
          );
        });

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

    // Optional: enforce "self or admin" here (replace with your real auth)
    // if (String(req.user?._id) !== String(uid) && req.user?.role !== "ADMIN") {
    //   return res.status(403).json({ success: false, error: "Forbidden" });
    // }

    const data = await listCore(parsed);
    res.json({ success: true, ...data });
  } catch (err) {
    next(err);
  }
};

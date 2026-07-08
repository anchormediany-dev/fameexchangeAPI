import mongoose from "mongoose";
import Talent from "../models/talentModel.js";
import FuturesPledge from "../models/futuresPledgeModel.js";
import { createPledgeIntent, confirmPledge } from "../services/futuresPledgeService.js";
import { appendLedgerEntry } from "../services/ledgerService.js";
import {
  PLEDGE_DEADLINE_DAYS,
  PLEDGE_BONUS_RATE,
  MIN_PLEDGE_AMOUNT,
  MAX_PLEDGE_AMOUNT,
} from "../config/futuresConfig.js";

const d = (v) => parseFloat(v?.toString?.() ?? v ?? 0);
const D128 = (v) => mongoose.Types.Decimal128.fromString(String(v));

// GET /api/futures — public list of open futures-tier talents
export const listFuturesTalents = async (req, res) => {
  try {
    const talents = await Talent.find({ tier: "futures", futures_closed: false })
      .sort({ fame_score: -1 })
      .lean();

    const items = talents.map((t) => {
      const deadline = t.futures_started_at
        ? new Date(new Date(t.futures_started_at).getTime() + PLEDGE_DEADLINE_DAYS * 86400000)
        : null;
      const daysRemaining = deadline
        ? Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / 86400000))
        : null;

      return {
        _id: t._id,
        name: t.name,
        slug: t.slug,
        symbol: t.symbol,
        image: t.image,
        fame_score: t.fame_score,
        projected_price: d(t.current_price),
        total_pledged: d(t.total_pledged),
        days_remaining: daysRemaining,
      };
    });

    res.json({ success: true, talents: items });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/futures/:talentId/pledge-intent
export const startPledge = async (req, res) => {
  try {
    const { amount, currency } = req.body || {};
    const result = await createPledgeIntent(req.user._id, req.params.talentId, amount, currency);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// POST /api/futures/pledge-confirm
export const finishPledge = async (req, res) => {
  try {
    const { paymentIntentId } = req.body || {};
    const result = await confirmPledge(req.user._id, paymentIntentId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// POST /api/admin/futures/:talentId/simulate-pledge (admin only, no Stripe)
// Body: { userId, amount }
// Test/demo equivalent of the real pledge-intent + pledge-confirm round trip,
// for exercising the pledge -> graduation flow without real payment
// credentials configured — mirrors the existing walletController.depositFunds
// "for testing / admin" pattern.
export const simulatePledge = async (req, res) => {
  try {
    const { userId, amount } = req.body || {};
    const amt = Number(amount);
    if (!userId) return res.status(400).json({ success: false, message: "userId is required" });
    if (!amt || amt <= 0) return res.status(400).json({ success: false, message: "Amount must be positive" });
    if (amt < MIN_PLEDGE_AMOUNT) return res.status(400).json({ success: false, message: `Minimum pledge is $${MIN_PLEDGE_AMOUNT}` });
    if (amt > MAX_PLEDGE_AMOUNT) return res.status(400).json({ success: false, message: `Maximum single pledge is $${MAX_PLEDGE_AMOUNT}` });

    const talent = await Talent.findById(req.params.talentId);
    if (!talent) return res.status(404).json({ success: false, message: "Talent not found" });
    if (talent.tier !== "futures") return res.status(400).json({ success: false, message: "Talent is not in the Futures tier" });
    if (talent.futures_closed) return res.status(400).json({ success: false, message: "This futures campaign has closed" });

    const pledge = await FuturesPledge.create({
      talent_id: talent._id,
      user_id: userId,
      amount: D128(amt),
      bonus_rate: PLEDGE_BONUS_RATE,
      status: "pending",
      pledged_at: new Date(),
      // no stripe_payment_intent_id — this is the simulated/no-payment path
    });

    await Talent.updateOne({ _id: talent._id }, { $inc: { total_pledged: D128(amt) } });
    talent.total_pledged = D128(d(talent.total_pledged) + amt); // reflect it in this response only

    await appendLedgerEntry("futures_pledge", pledge._id, pledge.toObject());

    res.json({ success: true, pledge, talent: talent.toDisplay() });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// GET /api/admin/futures/:talentId/pledges (admin only)
export const listPledgesForTalent = async (req, res) => {
  try {
    const pledges = await FuturesPledge.find({ talent_id: req.params.talentId })
      .populate("user_id", "name email")
      .sort({ pledged_at: -1 })
      .lean();

    res.json({
      success: true,
      pledges: pledges.map((p) => ({
        ...p,
        amount: d(p.amount),
        awarded_units: p.awarded_units ? d(p.awarded_units) : null,
        awarded_entry_price: p.awarded_entry_price ? d(p.awarded_entry_price) : null,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/futures/my-pledges — auth required, a fan's own pledge history
export const listMyPledges = async (req, res) => {
  try {
    const pledges = await FuturesPledge.find({ user_id: req.user._id })
      .populate("talent_id", "name slug symbol image")
      .sort({ pledged_at: -1 })
      .lean();

    res.json({
      success: true,
      pledges: pledges.map((p) => ({
        ...p,
        amount: d(p.amount),
        awarded_units: p.awarded_units ? d(p.awarded_units) : null,
        awarded_entry_price: p.awarded_entry_price ? d(p.awarded_entry_price) : null,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

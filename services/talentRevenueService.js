import mongoose from "mongoose";
import TalentRevenueSource from "../models/talentRevenueSourceModel.js";
import { appendLedgerEntry } from "./ledgerService.js";
import { quarterString } from "../utils/quarter.js";

const D128 = (v) => mongoose.Types.Decimal128.fromString(String(v));

/**
 * Feeds the quarterly dividend pool calculation (services/dividendScheduler.js
 * sums these per talent per quarter). Only wired into 2 real revenue flows
 * today — controllers/billingController.js (booking/appearance fees) and
 * controllers/productController.js (merchandise) — both real, working
 * Stripe payment flows. Fan subscriptions, crowdfunding fees, brand deal
 * fees, and exclusive content don't exist as real payment flows in this
 * codebase and are NOT wired in — no stub calls, no faked revenue.
 */
export async function logTalentRevenue({ talent_id, talent_name, revenue_type, amount, source_id = null, source_description = null }) {
  const entry = await TalentRevenueSource.create({
    talent_id,
    talent_name,
    revenue_type,
    amount: D128(amount),
    source_id,
    source_description,
    quarter: quarterString(),
    date_recorded: new Date(),
  });
  await appendLedgerEntry("talent_revenue_source", entry._id, entry.toObject());
  return entry;
}

import mongoose from "mongoose";
import Talent from "../models/talentModel.js";
import TalentPriceHistory from "../models/talentPriceHistoryModel.js";
import Notification from "../models/notificationModel.js";
import { previewValuation } from "./famescoreService.js";
import { calcBidAsk } from "./tradingService.js";
import { appendLedgerEntry } from "./ledgerService.js";
import { MIN_FAMESCORE_TRADEABLE } from "../config/futuresConfig.js";
import { FRONTEND_PUBLIC_URL } from "../config/socialAuthConfig.js";

const D128 = (v) => mongoose.Types.Decimal128.fromString(String(v));

const FAMEFUTURES_URL = process.env.FAMEFUTURES_PUBLIC_URL || "https://famefutures.com";

function slugify(input) {
  return String(input)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40) || "talent";
}

function symbolize(input) {
  const letters = String(input).toUpperCase().replace(/[^A-Z]/g, "");
  return (letters.slice(0, 5) || "TLNT");
}

async function uniqueSlug(base) {
  let candidate = base;
  let suffix = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await Talent.exists({ slug: candidate })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

async function uniqueSymbol(base) {
  let candidate = base;
  let suffix = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await Talent.exists({ symbol: candidate })) {
    candidate = `${base.slice(0, 4)}${suffix}`;
    suffix += 1;
  }
  return candidate;
}

/**
 * Self-serve "Apply to be a Talent" flow — the user-facing counterpart to the
 * admin createTalent endpoint. Runs the same FameScore engine, but instead of
 * an admin choosing the tier, the user gets routed automatically: qualifying
 * straight to the live tradeable market, or recognized as a "Future" with a
 * congratulations message and a link out to the Futures section.
 *
 * Idempotent: a user can only apply once. Calling this again just returns
 * their existing application/result.
 */
export async function applyToBeTalent(user) {
  const existing = await Talent.findOne({ userId: user._id });
  if (existing) {
    return buildResult(existing, { alreadyApplied: true });
  }

  const minPrice = 1.0;
  const maxPrice = 100000;
  const preview = await previewValuation(user._id, minPrice, maxPrice);

  const baseSlug = slugify(user.name || user.email || "talent");
  const slug = await uniqueSlug(baseSlug);
  const baseSymbol = symbolize(user.name || "TLNT");
  const symbol = await uniqueSymbol(baseSymbol);

  const tier = preview.fameScore >= MIN_FAMESCORE_TRADEABLE ? "tradeable" : "futures";
  const { bid, ask } = calcBidAsk(preview.suggestedPrice, 0.5);

  const talent = await Talent.create({
    userId: user._id,
    name: user.name,
    slug,
    symbol,
    current_price: D128(preview.suggestedPrice),
    bid_price: D128(bid),
    ask_price: D128(ask),
    previous_close_price: D128(preview.suggestedPrice),
    min_price: D128(minPrice),
    max_price: D128(maxPrice),
    fame_score: preview.fameScore,
    fame_score_breakdown: preview.breakdown,
    fame_score_updated_at: new Date(),
    tier,
    futures_started_at: tier === "futures" ? new Date() : null,
  });

  const priceHistoryEntry = await TalentPriceHistory.create({
    talent_id: talent._id,
    price: D128(preview.suggestedPrice),
    bid_price: D128(bid),
    ask_price: D128(ask),
    volume: D128(0),
    source_type: "system",
    recorded_at: new Date(),
  });
  await appendLedgerEntry("talent_price_history", priceHistoryEntry._id, priceHistoryEntry.toObject());

  return buildResult(talent, { alreadyApplied: false });
}

async function buildResult(talent, { alreadyApplied }) {
  const isTradeable = talent.tier === "tradeable";
  const message = isTradeable
    ? `Congratulations! Your FameScore (${talent.fame_score}) qualifies you as a tradeable Branded Talent Share on Fame Exchange. Fans can now buy and sell shares of your value.`
    : `Congratulations! You've been recognized as a Future on Fame Exchange — your current social reach (FameScore ${talent.fame_score}) is on its way, and early supporters can now back you before you go fully tradeable.`;

  const redirectUrl = isTradeable
    ? `${FRONTEND_PUBLIC_URL}/talent-profile/${talent._id}`
    : FAMEFUTURES_URL;

  if (!alreadyApplied) {
    await Notification.create({
      userId: talent.userId,
      category: "talent_application",
      description: message,
      referenceModel: "Talent",
      referenceId: talent._id,
      link: redirectUrl,
    });
  }

  return {
    already_applied: alreadyApplied,
    tier: talent.tier,
    fame_score: talent.fame_score,
    talent: talent.toDisplay(),
    message,
    redirect_url: redirectUrl,
  };
}

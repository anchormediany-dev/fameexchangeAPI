// services/talentResolver.js
import mongoose from "mongoose";
import Talent from "../models/talentModel.js";
import TalentPriceHistory from "../models/talentPriceHistoryModel.js";
import User from "../models/user.js";

const D128 = (v) => mongoose.Types.Decimal128.fromString(String(v));

const TALENT_ROLES = new Set(["TALENT", "ATHLETE", "INFLUENCER"]);

function slugify(input, fallback) {
  const base = String(input || fallback || "talent")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `talent-${Date.now()}`;
}

function symbolFor(input, fallback) {
  const cleaned = String(input || fallback || "TLNT")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
  return cleaned || `T${Date.now().toString().slice(-6)}`;
}

async function uniqueSlug(base) {
  let slug = base;
  let i = 1;
  // try a few times to avoid collisions
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const exists = await Talent.exists({ slug });
    if (!exists) return slug;
    slug = `${base}-${i++}`;
    if (i > 50) return `${base}-${Date.now()}`;
  }
}

async function uniqueSymbol(base) {
  let sym = base;
  let i = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const exists = await Talent.exists({ symbol: sym });
    if (!exists) return sym;
    const suffix = String(i++);
    sym = (base.slice(0, Math.max(1, 8 - suffix.length)) + suffix).toUpperCase();
    if (i > 50) return `T${Date.now().toString().slice(-6)}`;
  }
}

/**
 * Auto-create a Talent doc backed by a User (typically TALENT/ATHLETE/INFLUENCER).
 */
export async function autoCreateTalentForUser(user) {
  const initialPrice = 100;
  const spread = 0.5;
  const baseSlug = slugify(user.stage_name || user.full_name || user.name, String(user._id));
  const baseSymbol = symbolFor(
    user.stage_name || user.brand_name || user.name,
    String(user._id).slice(-6)
  );

  const slug = await uniqueSlug(baseSlug);
  const symbol = await uniqueSymbol(baseSymbol);

  const image = Array.isArray(user.images) && user.images[0]?.fileUrl ? user.images[0].fileUrl : null;

  const talent = await Talent.create({
    userId: user._id,
    name: user.stage_name || user.full_name || user.name,
    slug,
    symbol,
    status: "active",
    current_price: D128(initialPrice),
    bid_price: D128(initialPrice - spread / 2),
    ask_price: D128(initialPrice + spread / 2),
    spread: D128(spread),
    liquidity_factor: D128(50000),
    volatility_multiplier: D128(1.0),
    min_price: D128(1.0),
    max_price: D128(100000),
    max_move_per_trade: D128(5.0),
    min_order_amount: D128(10),
    max_order_amount: D128(100000),
    previous_close_price: D128(initialPrice),
    image,
    description: user.biography || "",
  });

  await TalentPriceHistory.create({
    talent_id: talent._id,
    price: D128(initialPrice),
    bid_price: D128(initialPrice - spread / 2),
    ask_price: D128(initialPrice + spread / 2),
    volume: D128(0),
    source_type: "system",
    recorded_at: new Date(),
  });

  return talent;
}

/**
 * Resolve a Talent by either Talent._id or User._id. Auto-creates a Talent doc
 * for talent-role users that don't have one yet so the trading system "just works"
 * across user IDs returned by /user/getusers.
 */
export async function resolveTalent(idOrUserId) {
  if (!idOrUserId || !mongoose.Types.ObjectId.isValid(idOrUserId)) return null;

  // 1) direct talent _id
  let talent = await Talent.findById(idOrUserId);
  if (talent) return talent;

  // 2) talent linked to user
  talent = await Talent.findOne({ userId: idOrUserId });
  if (talent) return talent;

  // 3) auto-create if user qualifies
  const user = await User.findById(idOrUserId);
  if (!user) return null;
  if (!TALENT_ROLES.has(String(user.role || "").toUpperCase())) return null;

  try {
    return await autoCreateTalentForUser(user);
  } catch (err) {
    // Race condition (another req created it) — refetch
    const existing = await Talent.findOne({ userId: user._id });
    if (existing) return existing;
    throw err;
  }
}

export default resolveTalent;

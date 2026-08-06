import stripe from "./stripeClient.js";

// Real pricing from Base44's live membership page (famefutures.com/membership,
// screenshot confirmed 2026-08-05) — not derivable from the entity schema, so
// hardcoded here rather than guessed. Stripe Price objects are immutable, so
// each plan's Price is created once (idempotently, via lookup_key) and reused
// forever — changing a price means creating a new one and updating the map.
export const PLATFORM_PLANS = {
  starter: { amount: 2900, label: "Starter" },
  pro: { amount: 7900, label: "Pro" },
  elite: { amount: 19900, label: "Elite" },
};

const priceIdCache = new Map();

// Idempotent: looks up the Price by lookup_key first, only creates it the
// very first time a given plan is ever subscribed to.
export async function getOrCreatePlatformPriceId(plan) {
  const def = PLATFORM_PLANS[plan];
  if (!def) throw new Error(`Unknown platform plan: ${plan}`);

  if (priceIdCache.has(plan)) return priceIdCache.get(plan);

  const lookupKey = `futures_membership_${plan}`;
  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
  if (existing.data[0]) {
    priceIdCache.set(plan, existing.data[0].id);
    return existing.data[0].id;
  }

  const price = await stripe.prices.create({
    currency: "usd",
    unit_amount: def.amount,
    recurring: { interval: "month" },
    lookup_key: lookupKey,
    product_data: { name: `Fame Futures ${def.label} Membership` },
  });
  priceIdCache.set(plan, price.id);
  return price.id;
}

// Fan membership tiers are talent-defined (arbitrary name/price), so unlike
// platform plans there's no fixed catalog to pre-create — the Price is made
// lazily the first time anyone subscribes to a given tier, then cached on the
// tier document itself (tier.stripePriceId) so it's only ever created once.
export async function getOrCreateFanTierPriceId(tier) {
  if (tier.stripePriceId) return tier.stripePriceId;

  const price = await stripe.prices.create({
    currency: "usd",
    unit_amount: Math.round(Number(tier.price) * 100),
    recurring: { interval: "month" },
    product_data: { name: `${tier.name} — Fan Membership` },
    metadata: { talentId: String(tier.talentId), tierId: String(tier._id) },
  });

  tier.stripePriceId = price.id;
  await tier.save();
  return price.id;
}

// Stripe subscription statuses -> this codebase's local status enum
// (pending/active/canceled/expired), shared by both FuturesMembership and
// FuturesFanSubscription.
export function mapSubscriptionStatus(stripeStatus) {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "active";
    case "canceled":
      return "canceled";
    case "incomplete":
    case "incomplete_expired":
    case "past_due":
    case "unpaid":
      return "expired";
    default:
      return "pending";
  }
}

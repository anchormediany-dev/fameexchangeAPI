import mongoose from "mongoose";

const talentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    symbol: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ["active", "suspended", "delisted"],
      default: "active",
    },
    current_price: { type: mongoose.Schema.Types.Decimal128, required: true },
    bid_price: { type: mongoose.Schema.Types.Decimal128, required: true },
    ask_price: { type: mongoose.Schema.Types.Decimal128, required: true },
    spread: { type: mongoose.Schema.Types.Decimal128, default: 0.5 },

    // ── Discrete share model + liquidity pool ────────────────────────
    // Fixed supply, set exactly once at the moment this talent becomes
    // tradeable (see services/shareAllocationService.js). null until then —
    // a futures-tier talent has no shares yet. shares_in_circulation starts
    // at 0 and grows as pledges convert to positions and/or the market buys
    // pull shares out of the pool; shares_available_in_pool is the market
    // maker's live remaining inventory (shares_in_liquidity_pool minus
    // whatever's currently out via open positions).
    total_shares: { type: Number, default: null },
    shares_in_liquidity_pool: { type: Number, default: null },
    shares_available_in_pool: { type: Number, default: null },
    shares_in_circulation: { type: Number, default: 0 },
    initial_share_price: { type: mongoose.Schema.Types.Decimal128, default: null },

    // liquidity_factor/volatility_multiplier fed the old synthetic (non-
    // pool-based) price-impact model. No longer used by tradingService.js's
    // live trade path once shares_in_liquidity_pool is set, but left
    // declared (not removed) as a rollback path during the transition.
    liquidity_factor: { type: mongoose.Schema.Types.Decimal128, default: 50000 },
    volatility_multiplier: { type: mongoose.Schema.Types.Decimal128, default: 1.0 },
    min_price: { type: mongoose.Schema.Types.Decimal128, default: 1.0 },
    max_price: { type: mongoose.Schema.Types.Decimal128, default: 100000 },
    max_daily_move_percent: { type: Number, default: 20 },
    max_move_per_trade: { type: mongoose.Schema.Types.Decimal128, default: 5.0 },
    min_order_amount: { type: mongoose.Schema.Types.Decimal128, default: 10 },
    max_order_amount: { type: mongoose.Schema.Types.Decimal128, default: 100000 },
    previous_close_price: { type: mongoose.Schema.Types.Decimal128, default: 0 },
    last_trade_at: { type: Date, default: null },
    image: { type: String, default: null },
    description: { type: String, default: "" },
    // Admin-controlled flag to surface this talent in the Inverse section
    // of the home page. Sorted by `inverse_order` ascending.
    featured_in_inverse: { type: Boolean, default: false, index: true },
    inverse_order: { type: Number, default: 0 },
    priority: { type: Number, default: 0 },

    // Admin-curated single-talent spotlight (home page "Featured Talent"
    // section + full bio page) — distinct from featured_in_inverse above.
    // Only one talent should have this true at a time; enforced in
    // controllers/talentController.js's setSpotlightFeatured, not at the
    // schema level.
    is_featured_spotlight: { type: Boolean, default: false, index: true },
    highlight_reel_url: { type: String, default: null },
    highlight_reel_thumbnail_url: { type: String, default: null },

    // ── Proprietary FameScore valuation ──────────────────────────────
    // When true, scheduled/triggered valuation recalculation is allowed to
    // nudge current_price toward the FameScore-derived fundamental value.
    // Admins can disable this per-talent to fully hand-manage a price.
    auto_price_enabled: { type: Boolean, default: true },
    // 0-100 scale (v2 algorithm — was 0-1000 under the earlier log-scaled
    // follower-count algorithm this replaced).
    fame_score: { type: Number, default: null, min: 0, max: 100 },
    fame_score_breakdown: { type: mongoose.Schema.Types.Mixed, default: null },
    fame_score_updated_at: { type: Date, default: null },
    // Directly-queryable qualification fields (kept out of the schema-less
    // fame_score_breakdown Mixed field so the admin dashboard can sort/filter
    // on them without scanning breakdown JSON).
    qualified: { type: Boolean, default: null },
    qualification_reason: { type: String, default: null },
    // True when a talent's FameScore qualifies them as tradeable but the KYC
    // gate (config/kycConfig.js) is blocking the tier flip — distinct from
    // "qualified: false" (genuinely below threshold) so the frontend can show
    // different copy ("complete KYC to go live" vs. "here's what it takes").
    qualified_pending_kyc: { type: Boolean, default: false },
    estimated_monetization_value: { type: mongoose.Schema.Types.Decimal128, default: null },
    // Notional brand-equity valuation (services/valuationService.js) — a
    // separate, correctly-scaled figure from estimated_monetization_value
    // above, which keeps its original (score-internal, not user-facing)
    // meaning. This is what actually sizes shares/listing fees going
    // forward — see shareAllocationService.js / feeConfig.js callers.
    valuation: { type: mongoose.Schema.Types.Decimal128, default: null },
    valuation_breakdown: { type: mongoose.Schema.Types.Mixed, default: null },
    next_re_evaluation_at: { type: Date, default: null },
    // Set the first time a TRADEABLE talent's recalculation shows them no
    // longer qualified. Cleared if they requalify before the grace period
    // elapses; if not, status flips to "suspended" (see famescoreService.js).
    qualification_grace_started_at: { type: Date, default: null },

    // ── Futures tier (pre-tradeable showcase + crowdfunding) ─────────
    // "tradeable": listed on the live market, can be bought/sold normally.
    // "futures": below the FameScore threshold — visible/pledge-able only.
    tier: { type: String, enum: ["futures", "tradeable"], default: "tradeable", index: true },
    futures_started_at: { type: Date, default: null },
    // True once the futures campaign has concluded, either by graduating to
    // tradeable OR by hitting the pledge deadline unfulfilled. Stops new
    // pledges either way.
    futures_closed: { type: Boolean, default: false },
    total_pledged: { type: mongoose.Schema.Types.Decimal128, default: 0 },
    graduated_at: { type: Date, default: null },
  },
  { timestamps: true }
);

talentSchema.methods.toDisplay = function () {
  const obj = this.toObject();
  const decimalFields = [
    "current_price", "bid_price", "ask_price", "spread",
    "liquidity_factor", "volatility_multiplier", "min_price", "max_price",
    "max_move_per_trade", "min_order_amount", "max_order_amount", "previous_close_price",
    "total_pledged", "estimated_monetization_value", "valuation", "initial_share_price",
  ];
  for (const field of decimalFields) {
    if (obj[field]) obj[field] = parseFloat(obj[field].toString());
  }
  return obj;
};

talentSchema.index({ status: 1 });
talentSchema.index({ slug: 1 });
talentSchema.index({ symbol: 1 });

const Talent = mongoose.model("Talent", talentSchema);
export default Talent;

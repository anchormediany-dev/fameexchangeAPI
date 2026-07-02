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

    // ── Proprietary FameScore valuation ──────────────────────────────
    // When true, scheduled/triggered valuation recalculation is allowed to
    // nudge current_price toward the FameScore-derived fundamental value.
    // Admins can disable this per-talent to fully hand-manage a price.
    auto_price_enabled: { type: Boolean, default: true },
    fame_score: { type: Number, default: null, min: 0, max: 1000 },
    fame_score_breakdown: { type: mongoose.Schema.Types.Mixed, default: null },
    fame_score_updated_at: { type: Date, default: null },

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
    "total_pledged",
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

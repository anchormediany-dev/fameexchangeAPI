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
  },
  { timestamps: true }
);

talentSchema.methods.toDisplay = function () {
  const obj = this.toObject();
  const decimalFields = [
    "current_price", "bid_price", "ask_price", "spread",
    "liquidity_factor", "volatility_multiplier", "min_price", "max_price",
    "max_move_per_trade", "min_order_amount", "max_order_amount", "previous_close_price",
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

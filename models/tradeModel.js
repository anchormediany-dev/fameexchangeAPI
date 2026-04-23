import mongoose from "mongoose";
import crypto from "crypto";

const tradeSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    talent_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Talent",
      required: true,
    },
    position_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Position",
      default: null,
    },
    side: {
      type: String,
      enum: ["buy", "sell"],
      required: true,
    },
    trade_type: {
      type: String,
      enum: ["open", "close"],
      required: true,
    },
    price: { type: mongoose.Schema.Types.Decimal128, required: true },
    units: { type: mongoose.Schema.Types.Decimal128, required: true },
    amount: { type: mongoose.Schema.Types.Decimal128, required: true },
    fees: { type: mongoose.Schema.Types.Decimal128, default: 0 },
    pnl: { type: mongoose.Schema.Types.Decimal128, default: null },
    wallet_balance_after: { type: mongoose.Schema.Types.Decimal128, required: true },
    reference_no: { type: String, unique: true },
    idempotency_key: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

tradeSchema.pre("save", function (next) {
  if (!this.reference_no) {
    this.reference_no = `TRD-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  }
  next();
});

tradeSchema.index({ user_id: 1, createdAt: -1 });
tradeSchema.index({ talent_id: 1, createdAt: -1 });
tradeSchema.index({ idempotency_key: 1 });

const Trade = mongoose.model("Trade", tradeSchema);
export default Trade;

import mongoose from "mongoose";

const positionSchema = new mongoose.Schema(
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
    side: {
      type: String,
      enum: ["buy", "sell"],
      required: true,
    },
    entry_price: { type: mongoose.Schema.Types.Decimal128, required: true },
    current_price_snapshot: { type: mongoose.Schema.Types.Decimal128, required: true },
    // Whole shares only (discrete share model) — was a continuous Decimal128
    // fraction (amount / entry_price) before the share-model rebuild.
    units: { type: Number, required: true },
    invested_amount: { type: mongoose.Schema.Types.Decimal128, required: true },
    status: {
      type: String,
      enum: ["open", "closed", "liquidated"],
      default: "open",
    },
    opened_at: { type: Date, default: Date.now },
    closed_at: { type: Date, default: null },
  },
  { timestamps: true }
);

positionSchema.index({ user_id: 1, status: 1 });
positionSchema.index({ talent_id: 1, status: 1 });

const Position = mongoose.model("Position", positionSchema);
export default Position;

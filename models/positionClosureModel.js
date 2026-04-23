import mongoose from "mongoose";

const positionClosureSchema = new mongoose.Schema(
  {
    position_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Position",
      required: true,
    },
    exit_price: { type: mongoose.Schema.Types.Decimal128, required: true },
    realized_pnl: { type: mongoose.Schema.Types.Decimal128, required: true },
    fees: { type: mongoose.Schema.Types.Decimal128, default: 0 },
    closed_at: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

positionClosureSchema.index({ position_id: 1 });

const PositionClosure = mongoose.model("PositionClosure", positionClosureSchema);
export default PositionClosure;

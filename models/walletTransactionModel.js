import mongoose from "mongoose";

const walletTransactionSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["deposit", "withdrawal", "trade_open", "trade_close", "fee", "adjustment"],
      required: true,
    },
    amount: { type: mongoose.Schema.Types.Decimal128, required: true },
    balance_before: { type: mongoose.Schema.Types.Decimal128, required: true },
    balance_after: { type: mongoose.Schema.Types.Decimal128, required: true },
    reference_id: { type: mongoose.Schema.Types.ObjectId, default: null },
    reference_type: {
      type: String,
      enum: ["trade", "position", "deposit", "withdrawal", "adjustment"],
      default: null,
    },
  },
  { timestamps: true }
);

walletTransactionSchema.index({ user_id: 1, createdAt: -1 });

const WalletTransaction = mongoose.model("WalletTransaction", walletTransactionSchema);
export default WalletTransaction;

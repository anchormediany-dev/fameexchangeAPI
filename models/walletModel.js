import mongoose from "mongoose";

const walletSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    available_balance: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
    },
    locked_balance: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
    },
    currency: {
      type: String,
      default: "USD",
    },
  },
  { timestamps: true }
);

walletSchema.methods.toDisplay = function () {
  return {
    _id: this._id,
    userId: this.userId,
    available_balance: parseFloat(this.available_balance.toString()),
    locked_balance: parseFloat(this.locked_balance.toString()),
    currency: this.currency,
    updatedAt: this.updatedAt,
  };
};

const Wallet = mongoose.model("Wallet", walletSchema);
export default Wallet;

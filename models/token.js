import mongoose from "mongoose";

const tokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    userType: {
      type: String,
      enum: ["admin", "regular", "institutional", "influencer"],
      required: true,
    },
    tokenName: {
      type: String,
      required: true,
    },
    tokenSymbol: {
      type: String,
      required: true,
    },
    priceUSD: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
    },
    priceFC: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
    },
    rateFCtoUSD: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
    },
    lastPrice: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
    },
    oneDayChange: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
    },
    oneDayVolume: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
    },
    oneDayMarketCap: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

const Token = mongoose.model("Token", tokenSchema);
export default Token;

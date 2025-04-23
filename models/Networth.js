import mongoose from "mongoose";

const networthSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
  fullName: String,
  tokenBrand: {
    brandName: String,
    tokenName: String,
  },
  socialMedia: {
    youtube: { url: String, subscribers: Number },
    twitter: { url: String, followers: Number },
    instagram: { url: String, followers: Number },
    facebook: { url: String, followers: Number },
    tiktok: { url: String, followers: Number },
    snapchat: { url: String, subscribers: Number },
  },
  totalFollowers: Number,
  netWorth: Number,
  currency: { type: String, default: "USD" },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Networth", networthSchema);

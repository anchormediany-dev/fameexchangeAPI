import mongoose from "mongoose";

// Migrated from Base44's FanReferral entity.
const futuresFanReferralSchema = new mongoose.Schema(
  {
    referrerFanId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    referredUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    talentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    xp_bonus: { type: Number, default: 0 },
    status: { type: String, enum: ["pending", "completed"], default: "pending" },
  },
  { timestamps: true }
);

futuresFanReferralSchema.index({ referredUserId: 1 }, { unique: true });

export default mongoose.model("FuturesFanReferral", futuresFanReferralSchema);

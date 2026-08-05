import mongoose from "mongoose";
import crypto from "crypto";

// Migrated from Base44's ExpertInvite entity — a talent invites an outside
// expert via a tokenized public link to record a VideoLesson.
const futuresExpertInviteSchema = new mongoose.Schema(
  {
    talentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    webinar_id: { type: String, default: null },
    expert_name: { type: String, required: true },
    expert_email: { type: String, default: "" },
    expert_title: { type: String, default: "" },
    advisor_key: { type: String, default: null },
    token: { type: String, required: true, unique: true },
    status: { type: String, enum: ["pending", "accepted", "expired"], default: "pending" },
    message: { type: String, default: "" },
  },
  { timestamps: true }
);

futuresExpertInviteSchema.pre("validate", function (next) {
  if (!this.token) this.token = crypto.randomBytes(24).toString("hex");
  next();
});

export default mongoose.model("FuturesExpertInvite", futuresExpertInviteSchema);

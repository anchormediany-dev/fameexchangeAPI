import mongoose from "mongoose";

// Migrated from Base44's CollabRequest entity — a talent-to-talent
// "looking for a collaborator" board post.
const futuresCollabRequestSchema = new mongoose.Schema(
  {
    talentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    talent_name: { type: String, required: true },
    niche: { type: String, default: "" },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    looking_for: { type: String, default: "" },
    status: { type: String, enum: ["open", "closed"], default: "open" },
  },
  { timestamps: true }
);

export default mongoose.model("FuturesCollabRequest", futuresCollabRequestSchema);

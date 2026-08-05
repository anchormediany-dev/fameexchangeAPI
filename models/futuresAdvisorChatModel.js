import mongoose from "mongoose";

// Migrated from Base44's AdvisorChat entity — one document per message in a
// talent's conversation with a given AI advisor persona. advisor_key selects
// which system prompt services/anthropicAdvisorService.js uses (Phase 4).
const futuresAdvisorChatSchema = new mongoose.Schema(
  {
    talentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    advisor_key: { type: String, required: true }, // e.g. "vision_coach", "growth_architect"
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true },
  },
  { timestamps: true }
);

futuresAdvisorChatSchema.index({ talentId: 1, advisor_key: 1, createdAt: 1 });

export default mongoose.model("FuturesAdvisorChat", futuresAdvisorChatSchema);

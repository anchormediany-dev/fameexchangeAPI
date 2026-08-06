import mongoose from "mongoose";

// Migrated from Base44's TalentProfile entity. One per FameExchange User who
// has been admitted into the Fame Futures creator-development program — a
// distinct concept from the pre-IPO share-pledging "futures" tier already
// modeled in models/talentModel.js/futuresPledgeModel.js. Qualification to
// create one of these is checked directly against that existing Talent
// record (tier/fame_score/qualified), not stored redundantly here.
const platformSchema = new mongoose.Schema(
  {
    platform: { type: String, required: true },
    handle: { type: String, default: "" },
    followers: { type: Number, default: 0 },
  },
  { _id: false }
);

const futuresTalentProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    stage_name: { type: String, required: true, trim: true },
    niche: { type: String, trim: true, default: "" },
    bio: { type: String, default: "" },
    platforms: { type: [platformSchema], default: [] },
    total_followers: { type: Number, default: 0 },
    current_position: { type: String, default: "" },
    next_milestone: { type: String, default: "" },
    xp: { type: Number, default: 0 },
    highlight_media: { type: [String], default: [] },
    messaging_enabled: { type: Boolean, default: false },
    // Starter-plan members choose 5 bonus AI advisors from the non-free
    // roster (see services/futuresAdvisorPersonas.js) — meaningless on
    // Pro/Elite, which unlock all of them automatically.
    selected_advisors: { type: [String], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model("FuturesTalentProfile", futuresTalentProfileSchema);

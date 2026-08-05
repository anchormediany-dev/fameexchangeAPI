import mongoose from "mongoose";

// Migrated from Base44's FanProfile entity.
const futuresFanProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    // The talent this fan primarily supports — optional at signup, set once
    // they pick one. References the User the same way
    // FuturesTalentProfile.userId does, not the profile document itself.
    talentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    display_name: { type: String, required: true, trim: true },
    xp: { type: Number, default: 0 },
    badge: { type: String, default: null },
    avatar_url: { type: String, default: null },
    messaging_terms_accepted: { type: Boolean, default: false },
    flagged: { type: Boolean, default: false },
    flag_reason: { type: String, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("FuturesFanProfile", futuresFanProfileSchema);

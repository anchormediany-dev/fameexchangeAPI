import mongoose from "mongoose";

// Migrated from Base44's Mission entity — talent-facing growth tasks.
// Completing one awards xp_reward and fires a Notification
// (see models/notificationModel.js, category: "mission_completed").
const futuresMissionSchema = new mongoose.Schema(
  {
    talentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    type: { type: String, default: "general" }, // e.g. "comment", "post", "engagement"
    xp_reward: { type: Number, default: 0 },
    verification: { type: String, enum: ["manual", "automatic"], default: "manual" },
    start_date: { type: String, default: null },
    end_date: { type: String, default: null },
    status: { type: String, enum: ["active", "completed", "expired"], default: "active" },
    completed_at: { type: Date, default: null },
  },
  { timestamps: true }
);

futuresMissionSchema.index({ talentId: 1, status: 1 });

export default mongoose.model("FuturesMission", futuresMissionSchema);

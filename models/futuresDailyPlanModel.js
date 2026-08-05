import mongoose from "mongoose";

// Migrated from Base44's DailyPlan entity — one per talent per date.
const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: "" },
    completed: { type: Boolean, default: false },
  },
  { _id: true }
);

const futuresDailyPlanSchema = new mongoose.Schema(
  {
    talentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: String, required: true }, // YYYY-MM-DD, matches Base44's string date field
    tasks: { type: [taskSchema], default: [] },
  },
  { timestamps: true }
);

futuresDailyPlanSchema.index({ talentId: 1, date: 1 }, { unique: true });

export default mongoose.model("FuturesDailyPlan", futuresDailyPlanSchema);

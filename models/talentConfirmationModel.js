import mongoose from "mongoose";

const talentConfirmationSchema = new mongoose.Schema(
  {
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FanInverseRequest",
      required: true,
    },
    talentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    confirmedDate: { type: Date, required: true },
    time: { type: String, required: true },
    location: { type: String, required: true },
    fanName: { type: String, required: true },
    status: { type: String, enum: ["accepted", "rescheduled"], required: true },
  },
  { timestamps: true }
);

export default mongoose.model("TalentConfirmation", talentConfirmationSchema);

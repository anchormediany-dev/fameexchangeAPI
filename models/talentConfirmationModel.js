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
    confirmedDate: { type: Date },
    time: { type: String },
    location: { type: String },
    fanName: { type: String },
    accessType: { type: String },
    status: {
      type: String,
      enum: ["accepted", "decline", "rescheduled"],
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("TalentConfirmation", talentConfirmationSchema);

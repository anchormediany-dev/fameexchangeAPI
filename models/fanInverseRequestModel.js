import mongoose from "mongoose";

const fanInverseRequestSchema = new mongoose.Schema(
  {
    talentName: { type: String, required: true },
    talentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    fanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    date: { type: Date, required: true },
    time: { type: String, required: true },
    location: { type: String },
    paymentMethod: {
      type: String,
      enum: ["Debit Card", "Credit Card"],
      required: true,
    },
    rescheduledStatus: {
      type: String,
      default: "",
    },
    rescheduled: {
      type: Boolean,
      default: false,
    },
    ispaid: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined", "rescheduled"],
      default: "pending",
    },
    telentConfirmationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TalentConfirmation",
    },
  },
  { timestamps: true }
);

export default mongoose.models.FanInverseRequest ||
  mongoose.model("FanInverseRequest", fanInverseRequestSchema);

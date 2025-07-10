import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      // enum: ['account', 'others'],
      // default: 'others',
    },
    datetime: {
      type: Date,
      default: Date.now,
    },
    referenceModel: {
      type: String,
      required: false,
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
    },
  },
  { timestamps: true }
);

const Notification = mongoose.model("Notification", notificationSchema);
export default Notification;

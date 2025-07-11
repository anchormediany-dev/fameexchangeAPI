import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    customerName: {
      type: String,
      required: true,
    },
    starsRating: {
      type: Number,
      min: 1,
      max: 10,
      required: true,
    },
    reviewDetail: {
      type: String,
      required: true,
    },
    datetime: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["approved", "pending", "rejected"],
      default: "pending",
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

const Review = mongoose.model("Review", reviewSchema);
export default Review;

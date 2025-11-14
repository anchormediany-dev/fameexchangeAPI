import mongoose from "mongoose";

const { Schema } = mongoose;

const FaqSchema = new Schema(
  {
    question: {
      type: String,
      required: [true, "Question is required"],
      trim: true,
      minlength: [3, "Question must be at least 3 characters"],
      maxlength: [500, "Question must be at most 500 characters"],
    },
    type: {
      type: String,
    },
    answer: {
      type: String,
      required: [true, "Answer is required"],
      trim: true,
      minlength: [3, "Answer must be at least 3 characters"],
    },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

export default mongoose.model("Faq", FaqSchema);

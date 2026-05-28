// models/TeamMember.js
import mongoose from "mongoose";

const teamMemberSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    bio: { type: String, trim: true },
    imageUrl: { type: String, trim: true },
    isVisible: { type: Boolean, default: true },
    order: { type: Number, default: 0, index: true },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

teamMemberSchema.index({ isVisible: 1, order: 1 });

export default mongoose.model("TeamMember", teamMemberSchema);

import mongoose from "mongoose";

const { Schema, Types } = mongoose;

const sponsorshipSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    sponsoredId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    occurredAt: { type: Date, required: true, index: true }, // your “date time”
    notes: { type: String }, // optional, remove if not needed
  },
  { timestamps: true }
);

// Helpful compound index for common lookups
sponsorshipSchema.index({ userId: 1, sponsoredById: 1, occurredAt: -1 });

export default mongoose.model("Sponsorship", sponsorshipSchema);

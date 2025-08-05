import mongoose from "mongoose";

const eventSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    users: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    ],
    datetime: { type: Date, required: true },
    addedBy: { type: String },

    title: { type: String, required: true },
    short_summary: { type: String },
    details: { type: String },

    event_type: { type: String, enum: ["live", "virtual"], required: true },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    category: { type: String },

    location: { type: String },
    address: { type: String },
    phone: { type: String },
    website: { type: String },
    prefrence: { type: String },
    organizer_name: { type: String },
    logo: { type: String }, // image URL or path
    event_cover: { type: String }, // image URL or path
    event_images: [{ type: String }], // array of image URLs

    is_featured: { type: Boolean, default: false },

    regular_price: { type: Number },
    discount_percent: { type: Number },
    discount_codes: [{ type: String }],

    event_coordinates: {
      lat: { type: Number },
      long: { type: Number },
    },
  },
  { timestamps: true }
);

export default mongoose.model("Event", eventSchema);

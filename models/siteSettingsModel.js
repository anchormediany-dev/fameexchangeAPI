// models/siteSettingsModel.js
// Singleton document that controls site-wide presentation choices:
//   - which navbar/footer links are visible
//   - how many talents to show in the home "Inverse" section
//   - which talents are featured in that section (with order)
import mongoose from "mongoose";

const menuItemSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    path: { type: String, required: true },
    visible: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const footerItemSchema = new mongoose.Schema(
  {
    section: { type: String, required: true }, // e.g. "services", "about"
    key: { type: String, required: true },
    label: { type: String, required: true },
    path: { type: String, required: true },
    visible: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const siteSettingsSchema = new mongoose.Schema(
  {
    // Used to enforce singleton: only one doc with singleton:"main"
    singleton: {
      type: String,
      default: "main",
      unique: true,
      enum: ["main"],
    },
    menuItems: { type: [menuItemSchema], default: [] },
    footerItems: { type: [footerItemSchema], default: [] },
    inverseDisplayCount: { type: Number, default: 8, min: 0, max: 100 },
    featuredTalentIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Talent" },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("SiteSettings", siteSettingsSchema);

// models/TeamMember.js
import mongoose from "mongoose";

const teamMemberSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, trim: true, unique: true, sparse: true },
    title: { type: String, required: true, trim: true },
    bio: { type: String, trim: true },
    imageUrl: { type: String, trim: true },
    linkedinUrl: { type: String, trim: true },
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

// Auto-derive a URL slug from the name for new members that don't set one
// explicitly (matches models/talentModel.js's slug convention) — powers
// each member's individual bio page route (/team/:slug).
teamMemberSchema.pre("save", async function (next) {
  if (this.slug || !this.isModified("name")) return next();
  const base = String(this.name || "member")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "member";
  let slug = base;
  let i = 1;
  const Model = this.constructor;
  // eslint-disable-next-line no-await-in-loop
  while (await Model.exists({ slug, _id: { $ne: this._id } })) {
    slug = `${base}-${i++}`;
  }
  this.slug = slug;
  next();
});

export default mongoose.model("TeamMember", teamMemberSchema);

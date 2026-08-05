// controllers/teamController.js
import mongoose from "mongoose";
import TeamMember from "../models/teamMember.js";
import { keyFromPublicUrl, deleteS3Object } from "../config/s3Config.js";

// PUBLIC: visible only
export const listPublicTeam = async (_req, res) => {
  try {
    const data = await TeamMember.find({ isVisible: true })
      .sort({ order: 1, createdAt: -1 })
      .lean();
    res.json({ success: true, count: data.length, data });
  } catch (e) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ADMIN: list all
export const listTeam = async (_req, res) => {
  try {
    const data = await TeamMember.find()
      .sort({ order: 1, createdAt: -1 })
      .lean();
    res.json({ success: true, count: data.length, data });
  } catch (e) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ADMIN: create
export const createTeam = async (req, res) => {
  try {
    const {
      name,
      title,
      bio,
      imageUrl,
      linkedinUrl,
      isVisible = true,
      featuredOnHome = false,
      order = 0,
    } = req.body;

    const userId = req?.user?._id;
    if (!name || !title) {
      return res
        .status(400)
        .json({ success: false, message: "Name and title are required" });
    }

    // Prefer uploaded file over imageUrl string — multer-s3 sets
    // req.file.location to the full public S3/CDN URL directly.
    const finalImageUrl = req.file ? req.file.location : imageUrl || "";

    const created = await TeamMember.create({
      name,
      title,
      bio,
      imageUrl: finalImageUrl,
      linkedinUrl,
      isVisible,
      featuredOnHome,
      order,
      addedBy: userId ? userId : "",
    });
    res.status(201).json({ success: true, message: "Created", data: created });
  } catch (e) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ADMIN: update
export const updateTeam = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ success: false, message: "Invalid id" });

    const allowed = ["name", "slug", "title", "bio", "imageUrl", "linkedinUrl", "isVisible", "featuredOnHome", "order"];
    const updates = {};
    for (const k of allowed) if (k in req.body) updates[k] = req.body[k];

    const existing = await TeamMember.findById(id);
    if (!existing)
      return res.status(404).json({ success: false, message: "Not found" });

    // If a new file is uploaded, use it and later delete the old image (if different)
    let oldImageUrl = existing.imageUrl || "";
    if (req.file) {
      updates.imageUrl = req.file.location;
    }

    const updated = await TeamMember.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    // Delete previous image if we replaced it. keyFromPublicUrl returns null
    // for anything that isn't one of our own S3/CDN URLs (e.g. a legacy
    // local "/uploads/..." path from before the S3 migration) — deletion is
    // just skipped for those rather than erroring.
    if (req.file && oldImageUrl && oldImageUrl !== updated.imageUrl) {
      await deleteS3Object(keyFromPublicUrl(oldImageUrl));
    }

    res.json({ success: true, message: "Updated", data: updated });
  } catch (e) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ADMIN: delete
export const deleteTeam = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ success: false, message: "Invalid id" });

    const del = await TeamMember.findByIdAndDelete(id);
    if (!del)
      return res.status(404).json({ success: false, message: "Not found" });

    res.json({ success: true, message: "Deleted" });
  } catch (e) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// controllers/teamController.js
import mongoose from "mongoose";
import TeamMember from "../models/teamMember.js";

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
      isVisible = true,
      order = 0,
    } = req.body;

    const userId = req?.user?._id;
    if (!name || !title) {
      return res
        .status(400)
        .json({ success: false, message: "Name and title are required" });
    }
    const created = await TeamMember.create({
      name,
      title,
      bio,
      imageUrl,
      isVisible,
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

    const allowed = ["name", "title", "bio", "imageUrl", "isVisible", "order"];
    const updates = {};
    for (const k of allowed) if (k in req.body) updates[k] = req.body[k];

    const updated = await TeamMember.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });
    if (!updated)
      return res.status(404).json({ success: false, message: "Not found" });

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

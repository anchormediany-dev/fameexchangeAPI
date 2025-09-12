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

const toPublicUrl = (filename) => `/uploads/team/${filename}`;
const toAbsPath = (publicUrl) => {
  // publicUrl like: /uploads/team/xxx.png  -> absolute path on disk
  const rel = publicUrl.startsWith("/") ? publicUrl.slice(1) : publicUrl;
  return path.join(process.cwd(), rel);
};

const parseBool = (v, fallback = true) => {
  if (typeof v === "boolean") return v;
  if (typeof v === "string")
    return ["true", "1", "yes", "on"].includes(v.toLowerCase());
  return fallback;
};
const parseNum = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
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

    console.log(req.file);
    // Prefer uploaded file over imageUrl string
    const finalImageUrl = req.file
      ? toPublicUrl(req.file.path)
      : imageUrl || "";

    const created = await TeamMember.create({
      name,
      title,
      bio,
      imageUrl: finalImageUrl,
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

    const existing = await TeamMember.findById(id);
    if (!existing)
      return res.status(404).json({ success: false, message: "Not found" });

    // If a new file is uploaded, use it and later delete the old image (if different)
    let oldImageUrl = existing.imageUrl || "";
    if (req.file) {
      updates.imageUrl = toPublicUrl(req.file.filename);
    }

    const updated = await TeamMember.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    // Delete previous image if we replaced it
    if (req.file && oldImageUrl && oldImageUrl !== updated.imageUrl) {
      try {
        await fs.unlink(toAbsPath(oldImageUrl));
      } catch {
        // ignore missing file or unlink errors
      }
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

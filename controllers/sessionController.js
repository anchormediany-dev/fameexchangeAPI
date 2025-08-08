import mongoose from "mongoose";
import Session from "../models/sessionModel.js";
import User from "../models/user.js";

// @desc Create a new session
export const createSession = async (req, res) => {
  try {
    const {
      sessionLength,
      price,
      sessionDate,
      sessionTime,
      bufferTime,
      timeZone,
      accessType,
    } = req.body;

    const session = new Session({
      sessionLength,
      price,
      sessionDate,
      sessionTime,
      bufferTime,
      timeZone,
      accessType,
      createdBy: req.user._id, // comes from authMiddleware
    });

    await session.save();
    res.status(201).json({ success: true, session });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc Get all sessions for the logged-in user
export const getAllSessions = async (req, res) => {
  try {
    const sessions = await Session.find({ createdBy: req.user._id }).sort({
      createdAt: -1,
    });
    res.status(200).json({ success: true, sessions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getSessionsByUserId = async (req, res) => {
  try {
    const userId = req.user._id;

    const userData = await User.findById({ _id: userId });
    console.log("userData", userData);

    const sessions = await Session.find({ createdBy: userId }).sort({
      createdAt: -1,
    });
    if (userData.role !== "TALENT") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    if (!sessions || sessions.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No sessions found for this user" });
    }

    res.status(200).json({ success: true, sessions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

//Get all availability dates
export const getUpcomingSessions = async (req, res) => {
  try {
    const now = new Date();

    // 1st and last day of the current month
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Because sessionDate is stored as "YYYY-MM-DD" (string)
    const startISO = start.toISOString().slice(0, 10); // e.g. "2025-08-01"
    const endISO = end.toISOString().slice(0, 10); // e.g. "2025-08-31"

    const { talentId } = req.params;

    const filter = {
      sessionDate: { $gte: startISO, $lte: endISO },
    };

    // Optional: filter by a specific talent
    if (talentId && mongoose.Types.ObjectId.isValid(talentId)) {
      filter.createdBy = talentId;
    }

    const sessions = await Session.find(filter).sort({
      sessionDate: 1,
      sessionTime: 1,
    });

    return res.status(200).json({
      success: true,
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      count: sessions.length,
      range: { start: startISO, end: endISO },
      sessions,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc Get single session by ID
export const getSessionById = async (req, res) => {
  try {
    const session = await Session.findOne({
      _id: req.params.id,
      createdBy: req.user._id,
    });

    if (!session)
      return res
        .status(404)
        .json({ success: false, message: "Session not found" });

    res.status(200).json({ success: true, session });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc Toggle session active/inactive
export const updateSessionStatus = async (req, res) => {
  try {
    const { isActive } = req.body;

    const session = await Session.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user._id },
      { isActive },
      { new: true }
    );

    if (!session)
      return res
        .status(404)
        .json({ success: false, message: "Session not found" });

    res.status(200).json({ success: true, session });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc Delete a session
export const deleteSession = async (req, res) => {
  try {
    const deleted = await Session.findOneAndDelete({
      _id: req.params.id,
      createdBy: req.user._id,
    });

    if (!deleted)
      return res
        .status(404)
        .json({ success: false, message: "Session not found" });

    res
      .status(200)
      .json({ success: true, message: "Session deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

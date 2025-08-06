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

import mongoose from "mongoose";
import Friend from "../models/friendModel.js";
import User from "../models/user.js";

// Add Friend
export const addFriend = async (req, res) => {
  try {
    const { friendId, friendName, notes, status } = req.body;
    const userId = req.user._id;
    if (!friendId || !friendName) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    const friendUser = await User.findById(friendId);
    if (!friendUser) {
      return res
        .status(404)
        .json({ success: false, message: "Friend User not found" });
    }
    const existing = await Friend.findOne({ userId, friendId });
    if (existing) {
      return res
        .status(400)
        .json({ success: false, message: "Friend already exists" });
    }

    const newFriend = new Friend({
      userId,
      friendId,
      friendName,
      notes,
      status,
    });
    await newFriend.save();

    res.status(201).json({ success: true, data: newFriend });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Get All Friends for a User
export const getFriendsByUser = async (req, res) => {
  try {
    const { _id: userId } = req.user;
    const friends = await Friend.find({ userId })
      .sort({ dateAdded: -1 })
      .populate("friendId", "images name email phone");
    if (friends.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No friends found" });
    }
    return res.status(200).json({ success: true, data: friends });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Update Friend Info
export const updateFriend = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await Friend.findByIdAndUpdate(id, req.body, { new: true })
      .populate("userId", "name email")
      .populate("friendId", "name email");

    if (!updated) {
      return res
        .status(404)
        .json({ success: false, message: "Friend not found" });
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Delete Friend
export const deleteFriend = async (req, res) => {
  try {
    const userId = req.user._id;

    let { friendIds } = req.body;

    if (!friendIds || !Array.isArray(friendIds) || friendIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide one or more friendIds in an array.",
      });
    }

    // Convert string IDs to ObjectIds
    friendIds = friendIds
      .map((id) => {
        try {
          return new mongoose.Types.ObjectId(id);
        } catch (err) {
          console.error("Invalid friendId:", id);
          return null;
        }
      })
      .filter(Boolean); // remove any nulls due to invalid IDs

    // 🧪 DEBUG: See if matching records exist
    const foundFriends = await Friend.find({
      userId,
      friendId: { $in: friendIds },
    });

    if (foundFriends.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No matching friend entries found for deletion.",
      });
    }

    // Perform delete
    const result = await Friend.deleteMany({
      userId,
      friendId: { $in: friendIds },
    });

    return res.json({
      success: true,
      message: "Friend(s) deleted successfully.",
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

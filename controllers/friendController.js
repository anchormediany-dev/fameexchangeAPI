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
    const friends = await Friend.find({ userId }).sort({ dateAdded: -1 });
    if (friends.length === 0) {
      res.status(404).json({ success: false, message: "No friends found" });
    }
    res.json({ success: true, data: friends });
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
    const { id } = req.params;
    const deleted = await Friend.findByIdAndDelete(id);

    if (!deleted) {
      return res
        .status(404)
        .json({ success: false, message: "Friend not found" });
    }

    res.json({ success: true, message: "Friend deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

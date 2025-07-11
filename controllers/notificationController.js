import Notification from "../models/notificationModel.js";
import User from "../models/user.js";

// Create Notification
export const createNotification = async (req, res) => {
  try {
    const user = await User.findById(req.body.userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    const referenceUser = await User.findById(req.body.referenceId);
    if (!referenceUser) {
      return res
        .status(404)
        .json({ success: false, message: "Reference User not found" });
    }
    const notification = new Notification(req.body);
    await notification.save();
    res.status(201).json({ success: true, data: notification });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get Notifications for User
export const getUserNotifications = async (req, res) => {
  try {
    const { userId } = req.params;
    const notifications = await Notification.find({ userId }).sort({
      datetime: -1,
    });
    if (!notifications.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Notifications not found" });
    }
    res.json({ success: true, data: notifications });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete Notification by ID
export const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findByIdAndDelete(id);
    if (!notification) {
      return res
        .status(404)
        .json({ success: false, message: "Notification not found" });
    }
    res.json({ success: true, message: "Notification deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete All Notifications for User
export const clearUserNotifications = async (req, res) => {
  try {
    const { userId } = req.params;
    await Notification.deleteMany({ userId });
    res.json({ success: true, message: "All notifications cleared" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

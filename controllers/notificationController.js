import Notification from "../models/notificationModel.js";

// Create Notification
export const createNotification = async (req, res) => {
  try {
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
    res.json({ success: true, data: notifications });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete Notification by ID
export const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    await Notification.findByIdAndDelete(id);
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

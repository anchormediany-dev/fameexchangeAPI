import express from "express";
import {
  createNotification,
  getUserNotifications,
  deleteNotification,
  clearUserNotifications,
} from "../controllers/notificationController.js";

const router = express.Router();

router.post("/", createNotification);
router.get("/:userId", getUserNotifications);
router.delete("/:id", deleteNotification);
router.delete("/clear/:userId", clearUserNotifications);

export default router;

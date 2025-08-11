import express from "express";
import {
  createEvent,
  getAllEvents,
  getEventById,
  updateEvent,
  deleteEvent,
  getFeaturedUpcomingEvents,
  getEventUserById,
  getMonthlyEvents,
} from "../controllers/eventController.js";

import auth_token from "../middleware/auth_token.js";
import auth_key_header from "../middleware/auth_key_header.js";
import upload from "../utils/multer_event_images.js";

const router = express.Router();

// Form-data upload fields
const uploadFields = upload.fields([
  { name: "logo", maxCount: 1 },
  { name: "event_cover", maxCount: 1 },
  { name: "event_images", maxCount: 10 },
]);

router.post("/", uploadFields, auth_key_header, auth_token, createEvent);
router.get("/", auth_key_header, auth_token, getAllEvents);
router.get("/user", auth_key_header, auth_token, getEventUserById);
router.get("/featured-upcoming", getFeaturedUpcomingEvents);
// Default month view (current month) OR search by name.
// Examples:
//   GET /api/events/monthly                -> all events this month (e.g., August)
//   GET /api/events/monthly?month=8&year=2025
//   GET /api/events/monthly?q=concert      -> similar-name events (any month)
//   GET /api/events/monthly?q=concert&withinMonth=true&month=8&year=2025
//   GET /api/events/monthly?status=active&featured=true
router.get("/search", getMonthlyEvents);
router.get("/:id", auth_key_header, auth_token, getEventById);
router.put("/:id", uploadFields, auth_key_header, auth_token, updateEvent);
router.delete("/:id", auth_key_header, auth_token, deleteEvent);

export default router;

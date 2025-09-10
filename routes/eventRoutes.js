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
  setEventPreference,
} from "../controllers/eventController.js";

import auth_token from "../middleware/auth_token.js";
import auth_key_header from "../middleware/auth_key_header.js";
import upload from "../utils/multer_event_images.js";
import auth_admin from "../middleware/auth_admin.js";

const router = express.Router();

// Form-data upload fields
const uploadFields = upload.fields([
  { name: "logo", maxCount: 1 },
  { name: "event_cover", maxCount: 1 },
  { name: "event_images", maxCount: 10 },
]);

router.post("/", uploadFields, auth_key_header, auth_admin, createEvent);
router.get("/", auth_key_header, getAllEvents);
router.get("/user", auth_key_header, auth_token, getEventUserById);
router.get("/featured-upcoming", auth_key_header, getFeaturedUpcomingEvents);
// Default month view (current month) OR search by name.
// Examples:
//   GET /api/events/monthly                -> all events this month (e.g., August)
//   GET /api/events/monthly?month=8&year=2025
//   GET /api/events/monthly?q=concert      -> similar-name events (any month)
//   GET /api/events/monthly?q=concert&withinMonth=true&month=8&year=2025
//   GET /api/events/monthly?status=active&featured=true
router.get("/search", auth_key_header, getMonthlyEvents);
// Add/Update a user's preference for an event
router.post(
  "/:eventId/preference",
  auth_token,
  auth_key_header,
  setEventPreference
);
router.get("/:id", auth_key_header, getEventById);
router.put("/:id", uploadFields, auth_key_header, auth_admin, updateEvent);
router.delete("/:id", auth_key_header, auth_admin, deleteEvent);

export default router;

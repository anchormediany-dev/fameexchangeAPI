import express from "express";
import {
  createEvent,
  getAllEvents,
  getEventById,
  updateEvent,
  deleteEvent,
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
router.get("/", getAllEvents);
router.get("/:id", getEventById);
router.put("/:id", updateEvent);
router.delete("/:id", deleteEvent);

export default router;

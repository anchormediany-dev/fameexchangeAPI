import { Router } from "express";
import {
  sendSessionReminder,
  sendTicketReminder,
} from "../controllers/remindersController.js";

const router = Router();

// POST /api/reminders/session   { "to": "user@example.com" }
router.post("/session", sendSessionReminder);

// POST /api/reminders/ticket    { "to": "user@example.com" }
router.post("/ticket", sendTicketReminder);

export default router;

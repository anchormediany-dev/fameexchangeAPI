import express from "express";
import {
  confirmRequest,
  getConfirmations,
  getConfirmationById,
  updateConfirmation,
  deleteConfirmation,
  rescheduleTalentConfirmation,
} from "../controllers/talentConfirmationController.js";
import auth_token from "../middleware/auth_token.js";
import auth_key_header from "../middleware/auth_key_header.js";

const router = express.Router();

router.post("/", auth_token, auth_key_header, confirmRequest);
router.get("/", auth_token, auth_key_header, getConfirmations);
router.get("/:id", auth_token, auth_key_header, getConfirmationById);
router.put("/:id", auth_token, auth_key_header, updateConfirmation);
router.put(
  "/:id/reschedule",
  auth_token,
  auth_key_header,
  rescheduleTalentConfirmation
);
router.delete("/:id", auth_token, auth_key_header, deleteConfirmation);

export default router;

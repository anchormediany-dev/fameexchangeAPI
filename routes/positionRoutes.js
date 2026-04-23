import express from "express";
import auth_key_header from "../middleware/auth_key_header.js";
import auth_token from "../middleware/auth_token.js";
import {
  getOpenPositions,
  getPositionById,
  positionClosePreview,
  positionClose,
} from "../controllers/positionController.js";

const router = express.Router();

// All position endpoints require auth
router.get("/open", auth_key_header, auth_token, getOpenPositions);
router.get("/:id", auth_key_header, auth_token, getPositionById);
router.post("/:id/close-preview", auth_key_header, auth_token, positionClosePreview);
router.post("/:id/close", auth_key_header, auth_token, positionClose);

export default router;

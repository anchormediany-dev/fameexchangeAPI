import express from "express";
import {
  createFanRequest,
  getAllRequests,
  getRequestById,
  updateFanRequest,
  deleteFanRequest,
  rescheduleFanRequest,
  getOverAllRequests,
} from "../controllers/fanRequestController.js";
import auth_token from "../middleware/auth_token.js";
import auth_key_header from "../middleware/auth_key_header.js";

const router = express.Router();

router.post("/", auth_token, auth_key_header, createFanRequest);
router.get("/", auth_token, auth_key_header, getAllRequests);
router.get("/get-all", auth_token, auth_key_header, getOverAllRequests);
router.get("/:id", auth_token, auth_key_header, getRequestById);
router.put("/:id", auth_token, auth_key_header, updateFanRequest);
router.put(
  "/:id/reschedule",
  auth_token,
  auth_key_header,
  rescheduleFanRequest
);
router.delete("/:id", auth_token, auth_key_header, deleteFanRequest);

export default router;

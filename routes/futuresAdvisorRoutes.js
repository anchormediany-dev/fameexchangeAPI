import express from "express";
import auth_key_header from "../middleware/auth_key_header.js";
import auth_token from "../middleware/auth_token.js";
import {
  listAdvisors,
  selectAdvisors,
  getChatHistory,
  sendMessage,
  generateRoadmap,
} from "../controllers/futuresAdvisorController.js";

const router = express.Router();

router.get("/", auth_key_header, auth_token, listAdvisors);
router.post("/select", auth_key_header, auth_token, selectAdvisors);
router.get("/:advisorKey/history", auth_key_header, auth_token, getChatHistory);
router.post("/:advisorKey/message", auth_key_header, auth_token, sendMessage);
router.post("/roadmap", auth_key_header, auth_token, generateRoadmap);

export default router;

import express from "express";
import {
  createFaq,
  getFaqs,
  getFaq,
  updateFaq,
  deleteFaq,
} from "../controllers/faqController.js";
import auth_key_header from "../middleware/auth_key_header.js";
import auth_admin from "../middleware/auth_admin.js";

const router = express.Router();

// Public
router.get("/", getFaqs);
router.get("/:id", getFaq);

// Protected (add auth middleware if needed)
router.post("/", auth_admin, auth_key_header, createFaq);
router.patch("/:id", auth_admin, auth_key_header, updateFaq);
router.delete("/:id", auth_admin, auth_key_header, deleteFaq);

export default router;

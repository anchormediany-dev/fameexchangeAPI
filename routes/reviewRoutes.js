import express from "express";
import {
  createReview,
  getAllReviews,
  updateReview,
  deleteReview,
} from "../controllers/reviewController.js";
import auth_key_header from "../middleware/auth_key_header.js";
import auth_token from "../middleware/auth_token.js";

const router = express.Router();

router.post("/", auth_key_header, auth_token, createReview);
router.get("/", auth_key_header, auth_token, getAllReviews);
router.put("/:id", auth_key_header, auth_token, updateReview);
router.delete("/:id", auth_key_header, auth_token, deleteReview);

export default router;

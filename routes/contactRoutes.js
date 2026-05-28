// routes/contactRoutes.js
import express from "express";
import {
  submitContactQuery,
  getAllContactQueries, // 🆕 import
} from "../controllers/contactController.js";
import authAdmin from "../middleware/auth_admin.js";

const router = express.Router();

router.post("/", submitContactQuery); // POST: Submit a new query
router.get("/", authAdmin, getAllContactQueries); // GET (admin only): Fetch all queries

export default router;

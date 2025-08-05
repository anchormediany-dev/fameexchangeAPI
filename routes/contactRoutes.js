// routes/contactRoutes.js
import express from "express";
import {
  submitContactQuery,
  getAllContactQueries, // 🆕 import
} from "../controllers/contactController.js";

const router = express.Router();

router.post("/", submitContactQuery); // POST: Submit a new query
router.get("/", getAllContactQueries); // GET: Fetch all queries

export default router;

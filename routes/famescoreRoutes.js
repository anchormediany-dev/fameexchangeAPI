import express from "express";
import auth_key_header from "../middleware/auth_key_header.js";
import { getThresholds } from "../controllers/famescoreController.js";

const router = express.Router();

router.get("/thresholds", auth_key_header, getThresholds);

export default router;

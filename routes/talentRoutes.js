import express from "express";
import auth_key_header from "../middleware/auth_key_header.js";
import auth_token from "../middleware/auth_token.js";
import {
  getAllTalents,
  getTopTalents,
  getTalentById,
  getTalentQuote,
  getTalentChartData,
  getTalentStatistics,
} from "../controllers/talentController.js";

const router = express.Router();

// Public talent endpoints (require API key only)
router.get("/", auth_key_header, getAllTalents);
router.get("/top", auth_key_header, getTopTalents);
router.get("/:id", auth_key_header, getTalentById);
router.get("/:id/quote", auth_key_header, getTalentQuote);
router.get("/:id/chart", auth_key_header, getTalentChartData);
router.get("/:id/stats", auth_key_header, getTalentStatistics);

export default router;

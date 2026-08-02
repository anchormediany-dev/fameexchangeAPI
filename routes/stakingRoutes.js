import express from "express";
import auth_key_header from "../middleware/auth_key_header.js";
import auth_token from "../middleware/auth_token.js";
import {
  createStake,
  unstake,
  getMyStakes,
  getTalentStats,
  getMyDividends,
} from "../controllers/stakingController.js";

const router = express.Router();

router.post("/stake", auth_key_header, auth_token, createStake);
router.post("/:id/unstake", auth_key_header, auth_token, unstake);
router.get("/my-stakes", auth_key_header, auth_token, getMyStakes);
router.get("/talent/:talentId/stats", auth_key_header, getTalentStats); // public market data — no user auth needed
router.get("/my-dividends", auth_key_header, auth_token, getMyDividends);

export default router;

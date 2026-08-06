import express from "express";
import auth_key_header from "../middleware/auth_key_header.js";
import auth_token from "../middleware/auth_token.js";
import {
  completeMission,
  redeemReward,
  getMyRedemptions,
  getMyReferralInfo,
  generateDailyPlan,
  completeTask,
} from "../controllers/futuresGamificationController.js";

const router = express.Router();

router.post("/missions/:id/complete", auth_key_header, auth_token, completeMission);

router.post("/xp/redeem", auth_key_header, auth_token, redeemReward);
router.get("/xp/redemptions", auth_key_header, auth_token, getMyRedemptions);

router.get("/referral/me", auth_key_header, auth_token, getMyReferralInfo);

router.post("/daily-plan/generate", auth_key_header, auth_token, generateDailyPlan);
router.post("/daily-plan/:planId/tasks/:taskId/complete", auth_key_header, auth_token, completeTask);

export default router;

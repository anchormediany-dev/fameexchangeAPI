// Fame Futures Phase 5 — gamification: talent growth Missions (manual XP
// award), fan XP redemption against the FuturesXPReward catalog, fan
// referrals, and an AI-generated Daily Plan (Maya/vision_coach — her
// documented role is exactly "keeps you accountable to your daily
// routine," matching the Daily Plan feature).
import mongoose from "mongoose";
import { getAdvisor } from "../services/futuresAdvisorPersonas.js";
import FuturesMission from "../models/futuresMissionModel.js";
import FuturesTalentProfile from "../models/futuresTalentProfileModel.js";
import FuturesFanProfile from "../models/futuresFanProfileModel.js";
import FuturesXPReward from "../models/futuresXPRewardModel.js";
import FuturesXPRedemption from "../models/futuresXPRedemptionModel.js";
import FuturesFanReferral from "../models/futuresFanReferralModel.js";
import FuturesDailyPlan from "../models/futuresDailyPlanModel.js";
import Notification from "../models/notificationModel.js";
import { getClaudeJson } from "../services/anthropicJsonCompletion.js";

// Internal XP currency, not real money — unlike Stripe pricing there's no
// real-dollar risk in picking a reasonable default here, adjustable later.
const REFERRAL_XP_BONUS = 50;

function assert(v, msg, code = 400) {
  if (!v) {
    const err = new Error(msg);
    err.status = code;
    throw err;
  }
}

// ── Missions (talent growth tasks) ──────────────────────────────────────
// POST /api/futures-hub/gamification/missions/:id/complete
export const completeMission = async (req, res, next) => {
  try {
    assert(req.user?._id, "Unauthorized", 401);
    const mission = await FuturesMission.findOne({ _id: req.params.id, talentId: req.user._id });
    assert(mission, "Mission not found", 404);
    assert(mission.status === "active", "Mission already completed or expired", 400);

    mission.status = "completed";
    mission.completed_at = new Date();
    await mission.save();

    const profile = await FuturesTalentProfile.findOneAndUpdate(
      { userId: req.user._id },
      { $inc: { xp: mission.xp_reward || 0 } },
      { new: true }
    );

    await Notification.create({
      userId: req.user._id,
      category: "mission_completed",
      description: `Mission complete: "${mission.title}" (+${mission.xp_reward} XP)`,
      referenceModel: "FuturesMission",
      referenceId: mission._id,
    }).catch(() => {});

    res.json({ success: true, data: { mission, xp: profile?.xp } });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ success: false, message: e.message });
    next(e);
  }
};

// ── XP redemption (fan spends XP from the FuturesXPReward catalog) ─────
// POST /api/futures-hub/gamification/xp/redeem  Body: { rewardId }
export const redeemReward = async (req, res, next) => {
  try {
    assert(req.user?._id, "Unauthorized", 401);
    const { rewardId } = req.body || {};
    assert(mongoose.Types.ObjectId.isValid(rewardId), "Invalid rewardId");

    const reward = await FuturesXPReward.findById(rewardId);
    assert(reward, "Reward not found", 404);
    assert(reward.status === "active", "Reward is not available", 400);
    assert(reward.stock !== 0, "Reward is out of stock", 400);

    const fanProfile = await FuturesFanProfile.findOne({ userId: req.user._id });
    assert(fanProfile, "Create your Fame Futures fan profile first", 403);
    assert(fanProfile.xp >= reward.xp_cost, "Not enough XP", 400);

    fanProfile.xp -= reward.xp_cost;
    await fanProfile.save();

    if (reward.stock > 0) {
      reward.stock -= 1;
      await reward.save();
    }

    const redemption = await FuturesXPRedemption.create({
      fanId: req.user._id,
      talentId: fanProfile.talentId,
      rewardId: reward._id,
      reward_title: reward.title,
      category: reward.category,
      xp_cost: reward.xp_cost,
      status: "pending",
    });

    await Notification.create({
      userId: req.user._id,
      category: "xp_redemption",
      description: `Redeemed "${reward.title}" for ${reward.xp_cost} XP.`,
      referenceModel: "FuturesXPRedemption",
      referenceId: redemption._id,
    }).catch(() => {});

    res.json({ success: true, data: { redemption, remaining_xp: fanProfile.xp } });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ success: false, message: e.message });
    next(e);
  }
};

// GET /api/futures-hub/gamification/xp/redemptions
export const getMyRedemptions = async (req, res, next) => {
  try {
    assert(req.user?._id, "Unauthorized", 401);
    const data = await FuturesXPRedemption.find({ fanId: req.user._id }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

// ── Referrals ────────────────────────────────────────────────────────────
// GET /api/futures-hub/gamification/referral/me
export const getMyReferralInfo = async (req, res, next) => {
  try {
    assert(req.user?._id, "Unauthorized", 401);
    const referrals = await FuturesFanReferral.find({ referrerFanId: req.user._id }).lean();
    res.json({
      success: true,
      data: {
        referralCode: String(req.user._id),
        totalReferred: referrals.length,
        completed: referrals.filter((r) => r.status === "completed").length,
        xpEarned: referrals.reduce((sum, r) => sum + (r.status === "completed" ? r.xp_bonus : 0), 0),
      },
    });
  } catch (e) {
    next(e);
  }
};

// Called internally from futuresFanProfileController.createMyFanProfile
// when a new fan signs up with a referredBy code — not its own route.
export async function completeReferral({ referrerFanId, referredUserId, talentId }) {
  if (!referrerFanId || !mongoose.Types.ObjectId.isValid(referrerFanId)) return null;
  if (String(referrerFanId) === String(referredUserId)) return null; // no self-referral

  const referrerProfile = await FuturesFanProfile.findOne({ userId: referrerFanId });
  if (!referrerProfile) return null; // referral code must belong to a real fan

  const before = await FuturesFanReferral.findOne({ referredUserId }).lean();
  if (before) return before; // already referred (unique index on referredUserId)

  const referral = await FuturesFanReferral.create({
    referrerFanId,
    referredUserId,
    talentId: talentId || null,
    xp_bonus: REFERRAL_XP_BONUS,
    status: "completed",
  });

  referrerProfile.xp += REFERRAL_XP_BONUS;
  await referrerProfile.save();

  await Notification.create({
    userId: referrerFanId,
    category: "referral",
    description: `Your referral joined! +${REFERRAL_XP_BONUS} XP.`,
    referenceModel: "FuturesFanReferral",
    referenceId: referral._id,
  }).catch(() => {});

  return referral;
}

// ── Daily Plan (AI-generated via Maya, the Vision Coach) ────────────────
// POST /api/futures-hub/gamification/daily-plan/generate
export const generateDailyPlan = async (req, res, next) => {
  try {
    assert(req.user?._id, "Unauthorized", 401);
    const talentProfile = await FuturesTalentProfile.findOne({ userId: req.user._id }).lean();
    assert(talentProfile, "Create your Fame Futures creator profile first", 403);

    const maya = getAdvisor("vision_coach");
    const today = new Date().toISOString().slice(0, 10);

    const parsed = await getClaudeJson({
      system:
        `${maya.systemPrompt}\n\n` +
        "Respond with STRICT JSON only (no prose, no markdown fences), matching this shape " +
        'exactly: {"tasks": [{"title": string, "description": string}]}. Give 3-5 concrete, ' +
        "specific tasks this creator can realistically finish today.",
      messages: [
        {
          role: "user",
          content: `Stage name: ${talentProfile.stage_name}\nNiche: ${talentProfile.niche || "unspecified"}\nBio: ${talentProfile.bio || "unspecified"}`,
        },
      ],
    });

    const tasks = (Array.isArray(parsed.tasks) ? parsed.tasks : []).map((t) => ({
      title: String(t.title || ""),
      description: String(t.description || ""),
      completed: false,
    }));

    const plan = await FuturesDailyPlan.findOneAndUpdate(
      { talentId: req.user._id, date: today },
      { $set: { tasks } },
      { new: true, upsert: true }
    );

    res.json({ success: true, data: plan });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ success: false, message: e.message });
    next(e);
  }
};

// POST /api/futures-hub/gamification/daily-plan/:planId/tasks/:taskId/complete
export const completeTask = async (req, res, next) => {
  try {
    assert(req.user?._id, "Unauthorized", 401);
    const { planId, taskId } = req.params;
    const plan = await FuturesDailyPlan.findOne({ _id: planId, talentId: req.user._id });
    assert(plan, "Plan not found", 404);
    const task = plan.tasks.id(taskId);
    assert(task, "Task not found", 404);
    task.completed = true;
    await plan.save();
    res.json({ success: true, data: plan });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ success: false, message: e.message });
    next(e);
  }
};

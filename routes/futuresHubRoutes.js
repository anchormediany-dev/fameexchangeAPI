// Fame Futures creator-development entities — separate namespace from the
// existing pre-IPO pledge-campaign API (routes/futuresRoutes.js, mounted at
// /api/futures). This is the migration target for what was built on Base44;
// see /Users/victorramos/.claude/plans/soft-wiggling-tiger.md for the full
// phased plan. Entities with real business logic (qualification gates,
// Stripe, Claude, XP rules) get their own dedicated routers as their phase
// lands — everything here is straightforward ownership-scoped CRUD via
// utils/futuresCrudFactory.js.
import express from "express";
import auth_key_header from "../middleware/auth_key_header.js";
import auth_token from "../middleware/auth_token.js";
import { makeFuturesCrud } from "../utils/futuresCrudFactory.js";

import FuturesCollabRequest from "../models/futuresCollabRequestModel.js";
import FuturesVideoLesson from "../models/futuresVideoLessonModel.js";
import FuturesXPReward from "../models/futuresXPRewardModel.js";
import FuturesExpertInvite from "../models/futuresExpertInviteModel.js";
import FuturesFanReferral from "../models/futuresFanReferralModel.js";
import FuturesExclusiveContent from "../models/futuresExclusiveContentModel.js";
import FuturesProject from "../models/futuresProjectModel.js";
import FuturesCareerRoadmap from "../models/futuresCareerRoadmapModel.js";
import FuturesDailyPlan from "../models/futuresDailyPlanModel.js";
import {
  getMyTalentProfile,
  getTalentProfile,
  createMyTalentProfile,
  updateMyTalentProfile,
} from "../controllers/futuresTalentProfileController.js";
import {
  getMyFanProfile,
  createMyFanProfile,
  updateMyFanProfile,
} from "../controllers/futuresFanProfileController.js";

const router = express.Router();

// Phase 2 — core identity + qualification gate. Bespoke controllers, not the
// generic CRUD factory: profile creation is gated (talent side) or singular
// per-user (both sides), neither of which the factory's ownership-scoped
// list/get/create/update/delete shape fits cleanly.
//
// Route order matters here: the literal "/me" routes must be registered
// BEFORE the "/:userId" param route, or Express would match "me" as a
// userId instead of hitting the intended handler.
router.get("/talent-profile/me", auth_key_header, auth_token, getMyTalentProfile);
router.post("/talent-profile", auth_key_header, auth_token, createMyTalentProfile);
router.put("/talent-profile/me", auth_key_header, auth_token, updateMyTalentProfile);
router.get("/talent-profile/:userId", auth_key_header, getTalentProfile); // public

router.get("/fan-profile/me", auth_key_header, auth_token, getMyFanProfile);
router.post("/fan-profile", auth_key_header, auth_token, createMyFanProfile);
router.put("/fan-profile/me", auth_key_header, auth_token, updateMyFanProfile);

function mountCrud(path, Model, opts) {
  const h = makeFuturesCrud(Model, opts);
  router.get(`/${path}`, auth_key_header, auth_token, h.list);
  router.get(`/${path}/:id`, auth_key_header, auth_token, h.get);
  router.post(`/${path}`, auth_key_header, auth_token, h.create);
  router.put(`/${path}/:id`, auth_key_header, auth_token, h.update);
  router.delete(`/${path}/:id`, auth_key_header, auth_token, h.remove);
}

mountCrud("collab-requests", FuturesCollabRequest, { ownerField: "talentId", publicList: true });
mountCrud("video-lessons", FuturesVideoLesson, { publicList: true, adminWriteOnly: true });
mountCrud("xp-rewards", FuturesXPReward, { publicList: true, adminWriteOnly: true });
mountCrud("expert-invites", FuturesExpertInvite, { ownerField: "talentId" });
mountCrud("fan-referrals", FuturesFanReferral, { ownerField: "referrerFanId" });
mountCrud("exclusive-content", FuturesExclusiveContent, { ownerField: "talentId", publicList: true });
mountCrud("projects", FuturesProject, { ownerField: "talentId", publicList: true });
mountCrud("career-roadmap", FuturesCareerRoadmap, { ownerField: "talentId" });
mountCrud("daily-plans", FuturesDailyPlan, { ownerField: "talentId" });

export default router;

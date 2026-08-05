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

const router = express.Router();

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

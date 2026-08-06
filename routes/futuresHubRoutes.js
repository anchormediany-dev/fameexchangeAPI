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
import FuturesFanMembershipTier from "../models/futuresFanMembershipTierModel.js";
import FuturesCareerRoadmap from "../models/futuresCareerRoadmapModel.js";
import FuturesDailyPlan from "../models/futuresDailyPlanModel.js";
import FuturesMission from "../models/futuresMissionModel.js";
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

// verbs lets a mount skip list/get when a bespoke, tier-gated read path
// replaces them (see futuresContentController.js — the generic factory's
// scopeFilter can't enforce subscription/membership tier access, and for
// entities with no ownerField it can't restrict reads at all regardless of
// publicList, so those reads need to come from the gated endpoint instead).
function mountCrud(path, Model, opts, verbs = ["list", "get", "create", "update", "remove"]) {
  const h = makeFuturesCrud(Model, opts);
  if (verbs.includes("list")) router.get(`/${path}`, auth_key_header, auth_token, h.list);
  if (verbs.includes("get")) router.get(`/${path}/:id`, auth_key_header, auth_token, h.get);
  if (verbs.includes("create")) router.post(`/${path}`, auth_key_header, auth_token, h.create);
  if (verbs.includes("update")) router.put(`/${path}/:id`, auth_key_header, auth_token, h.update);
  if (verbs.includes("remove")) router.delete(`/${path}/:id`, auth_key_header, auth_token, h.remove);
}

mountCrud("collab-requests", FuturesCollabRequest, { ownerField: "talentId", publicList: true });
// Reads come from futuresContentController.getVideoLessons (tier-gated by
// the caller's platform Membership) — no ownerField exists to scope the
// generic list/get by, so those would otherwise leak every lesson's
// video_url to any logged-in user regardless of publicList.
mountCrud(
  "video-lessons",
  FuturesVideoLesson,
  { adminWriteOnly: true },
  ["create", "update", "remove"]
);
mountCrud("xp-rewards", FuturesXPReward, { publicList: true, adminWriteOnly: true });
mountCrud("expert-invites", FuturesExpertInvite, { ownerField: "talentId" });
mountCrud("fan-referrals", FuturesFanReferral, { ownerField: "referrerFanId" });
// Fan-facing reads come from futuresContentController.getTalentExclusiveContent
// (tier-gated by subscription) — no publicList here, so the generic list
// only returns the talent's own content (for their own management view).
mountCrud("exclusive-content", FuturesExclusiveContent, { ownerField: "talentId" });
mountCrud("projects", FuturesProject, { ownerField: "talentId", publicList: true });
mountCrud("career-roadmap", FuturesCareerRoadmap, { ownerField: "talentId" });
mountCrud("daily-plans", FuturesDailyPlan, { ownerField: "talentId" });
// Talent-authored custom fan tiers (Phase 3) — talent owns create/update/
// delete, publicList so fans can see a talent's tiers to subscribe. Stripe
// Price creation happens lazily in futuresBillingController, not here.
mountCrud("fan-tiers", FuturesFanMembershipTier, { ownerField: "talentId", publicList: true });
// Talent growth missions (Phase 5) — list/get/create/update/delete are
// plain owner-scoped CRUD; the XP-award side effect on completion lives in
// futuresGamificationController.completeMission instead (mounted separately
// at /api/futures-hub/gamification).
mountCrud("missions", FuturesMission, { ownerField: "talentId" });

export default router;

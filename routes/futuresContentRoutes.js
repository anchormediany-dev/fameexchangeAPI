import express from "express";
import auth_key_header from "../middleware/auth_key_header.js";
import auth_token from "../middleware/auth_token.js";
import {
  getTalentExclusiveContent,
  getVideoLessons,
  getExpertInviteByToken,
  submitExpertLesson,
} from "../controllers/futuresContentController.js";

const router = express.Router();

router.get("/exclusive/:talentId", auth_key_header, auth_token, getTalentExclusiveContent);
router.get("/video-lessons", auth_key_header, auth_token, getVideoLessons);

// Public — an outside expert has no FameExchange account, just the token
// link the talent shared with them (matches talent-profile's public GET
// precedent: app-level secret key required, no user auth).
router.get("/expert-invite/:token", auth_key_header, getExpertInviteByToken);
router.post("/expert-invite/:token/submit", auth_key_header, submitExpertLesson);

export default router;

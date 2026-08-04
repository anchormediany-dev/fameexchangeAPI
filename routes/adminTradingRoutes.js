import express from "express";
import auth_key_header from "../middleware/auth_key_header.js";
import auth_admin from "../middleware/auth_admin.js";
import uploadProfile from "../utils/profile_images.js";
import uploadVideo from "../utils/multer_video_upload.js";
import {
  createTalent,
  updateTalent,
  adjustTalentPrice,
  getMarketLogs,
  uploadTalentImage,
  updateTalentFeatured,
  previewFameScore,
  recalculateValuation,
  recalculateAllValuations,
  setSpotlightFeatured,
  clearSpotlightFeatured,
  uploadHighlightReel,
  getFuturesQualificationProgress,
  getSpotlightCandidates,
} from "../controllers/talentController.js";
import { listLedgerEntries, verifyLedger } from "../controllers/ledgerController.js";
import { grantBrandAmbassadorBonus } from "../controllers/vestingController.js";
import { simulatePledge, listPledgesForTalent } from "../controllers/futuresPledgeController.js";
import {
  getRevenueSummaryHandler,
  getAssetRevenueHandler,
  getFameScoreDashboard,
} from "../controllers/revenueController.js";

const router = express.Router();

// All admin endpoints require admin auth
router.post("/talents", auth_key_header, auth_admin, createTalent);
router.put("/talents/:id", auth_key_header, auth_admin, updateTalent);
router.post("/talents/:id/adjust-price", auth_key_header, auth_admin, adjustTalentPrice);
router.get("/talents/preview-famescore", auth_key_header, auth_admin, previewFameScore);
router.post("/talents/:id/recalculate-valuation", auth_key_header, auth_admin, recalculateValuation);
router.post(
  "/talents/:id/brand-ambassador-bonus-unlock",
  auth_key_header,
  auth_admin,
  grantBrandAmbassadorBonus
);
router.post("/talents/recalculate-all-valuations", auth_key_header, auth_admin, recalculateAllValuations);
router.put(
  "/talents/:id/image",
  auth_key_header,
  auth_admin,
  uploadProfile.single("image"),
  uploadTalentImage
);
router.put(
  "/talents/:id/featured",
  auth_key_header,
  auth_admin,
  updateTalentFeatured
);
router.put(
  "/talents/:id/spotlight",
  auth_key_header,
  auth_admin,
  setSpotlightFeatured
);
router.put(
  "/talents/:id/unspotlight",
  auth_key_header,
  auth_admin,
  clearSpotlightFeatured
);
router.post(
  "/talents/:id/highlight-reel",
  auth_key_header,
  auth_admin,
  uploadVideo.single("video"),
  uploadHighlightReel
);
router.get(
  "/talents/futures-progress",
  auth_key_header,
  auth_admin,
  getFuturesQualificationProgress
);
router.get(
  "/talents/spotlight-candidates",
  auth_key_header,
  auth_admin,
  getSpotlightCandidates
);
router.get("/market/logs", auth_key_header, auth_admin, getMarketLogs);
router.get("/ledger", auth_key_header, auth_admin, listLedgerEntries);
router.get("/ledger/verify", auth_key_header, auth_admin, verifyLedger);
router.post("/futures/:talentId/simulate-pledge", auth_key_header, auth_admin, simulatePledge);
router.get("/futures/:talentId/pledges", auth_key_header, auth_admin, listPledgesForTalent);
router.get("/revenue/summary", auth_key_header, auth_admin, getRevenueSummaryHandler);
router.get("/revenue/by-asset/:assetId", auth_key_header, auth_admin, getAssetRevenueHandler);
router.get("/famescore/dashboard", auth_key_header, auth_admin, getFameScoreDashboard);

export default router;

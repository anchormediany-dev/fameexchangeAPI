import express from "express";
import auth_key_header from "../middleware/auth_key_header.js";
import auth_admin from "../middleware/auth_admin.js";
import uploadProfile from "../utils/profile_images.js";
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
} from "../controllers/talentController.js";
import { listLedgerEntries, verifyLedger } from "../controllers/ledgerController.js";
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
router.get("/market/logs", auth_key_header, auth_admin, getMarketLogs);
router.get("/ledger", auth_key_header, auth_admin, listLedgerEntries);
router.get("/ledger/verify", auth_key_header, auth_admin, verifyLedger);
router.post("/futures/:talentId/simulate-pledge", auth_key_header, auth_admin, simulatePledge);
router.get("/futures/:talentId/pledges", auth_key_header, auth_admin, listPledgesForTalent);
router.get("/revenue/summary", auth_key_header, auth_admin, getRevenueSummaryHandler);
router.get("/revenue/by-asset/:assetId", auth_key_header, auth_admin, getAssetRevenueHandler);
router.get("/famescore/dashboard", auth_key_header, auth_admin, getFameScoreDashboard);

export default router;

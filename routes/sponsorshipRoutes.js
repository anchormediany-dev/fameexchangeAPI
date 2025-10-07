import { Router } from "express";
import {
  createSponsorship,
  getSponsorshipById,
  listSponsorships,
  updateSponsorship,
  deleteSponsorship,
  allListSponsorships,
} from "../controllers/sponsorshipController.js";

import auth_key_header from "../middleware/auth_key_header.js";
import auth_token from "../middleware/auth_token.js";

const router = Router();

router.get("/", auth_key_header, listSponsorships);
router.get("/all", auth_key_header, allListSponsorships);
router.get("/:id", auth_key_header, auth_token, getSponsorshipById);
router.post("/", auth_key_header, auth_token, createSponsorship);
router.patch("/:id", auth_key_header, auth_token, updateSponsorship);
router.delete("/:id", auth_key_header, auth_token, deleteSponsorship);

export default router;

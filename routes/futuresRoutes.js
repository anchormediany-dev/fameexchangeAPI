import express from "express";
import auth_key_header from "../middleware/auth_key_header.js";
import auth_token from "../middleware/auth_token.js";
import {
  listFuturesTalents,
  startPledge,
  finishPledge,
  listMyPledges,
} from "../controllers/futuresPledgeController.js";

const router = express.Router();

router.get("/", auth_key_header, listFuturesTalents); // public
router.get("/my-pledges", auth_key_header, auth_token, listMyPledges);
router.post("/pledge-confirm", auth_key_header, auth_token, finishPledge);
router.post("/:talentId/pledge-intent", auth_key_header, auth_token, startPledge);

export default router;

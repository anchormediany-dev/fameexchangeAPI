import express from "express";
import {
  createToken,
  getAllTokens,
  getTokenById,
  updateToken,
  deleteToken,
  getFilteredTokens,
} from "../controllers/tokenController.js";

const router = express.Router();

router.post("/add-token", createToken);
router.get("/tokens", getAllTokens);
router.get("/tokens/:id", getTokenById);
router.put("/tokens/:id", updateToken);
router.delete("/tokens/:id", deleteToken);
router.get("/filter", getFilteredTokens);

export default router;

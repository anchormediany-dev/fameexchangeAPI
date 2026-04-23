import express from "express";
import auth_key_header from "../middleware/auth_key_header.js";
import auth_token from "../middleware/auth_token.js";
import {
  tradePreview,
  tradeOpen,
  getTradeHistory,
  getTradeById,
} from "../controllers/tradingController.js";

const router = express.Router();

// All trade endpoints require auth
router.post("/preview", auth_key_header, auth_token, tradePreview);
router.post("/open", auth_key_header, auth_token, tradeOpen);
router.get("/history", auth_key_header, auth_token, getTradeHistory);
router.get("/history/:tradeId", auth_key_header, auth_token, getTradeById);

export default router;

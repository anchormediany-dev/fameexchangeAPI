import express from "express";
import auth_key_header from "../middleware/auth_key_header.js";
import auth_token from "../middleware/auth_token.js";
import {
  getWallet,
  getWalletTransactions,
  createDepositIntent,
  confirmDeposit,
} from "../controllers/walletController.js";

const router = express.Router();

// All wallet endpoints require auth
router.get("/", auth_key_header, auth_token, getWallet);
router.get("/transactions", auth_key_header, auth_token, getWalletTransactions);
router.post("/deposit-intent", auth_key_header, auth_token, createDepositIntent);
router.post("/deposit-confirm", auth_key_header, auth_token, confirmDeposit);

export default router;

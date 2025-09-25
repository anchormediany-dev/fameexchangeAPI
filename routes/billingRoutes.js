// routes/billingRoutes.js
import { Router } from "express";
import {
  getQuote,
  createPaymentIntent,
  confirmPaymentIntent,
  retrievePaymentIntent,
  stripeWebhook,
  listPlatformTransactions,
  listUserTransactions,
} from "../controllers/billingController.js";
import auth_token from "../middleware/auth_token.js";
import auth_key_header from "../middleware/auth_key_header.js";
import auth_admin from "../middleware/auth_admin.js";

const router = Router();

router.get("/quote", auth_key_header, auth_token, getQuote);
router.post(
  "/payment-intents",
  auth_key_header,
  auth_token,
  createPaymentIntent
);
router.post("/confirm", auth_key_header, auth_token, confirmPaymentIntent);
router.get(
  "/transactions",
  auth_admin,
  auth_key_header,
  listPlatformTransactions
);
router.get(
  "/user/:userId/transactions",
  auth_token,
  auth_key_header,
  listUserTransactions
);

router.get(
  "/payment-intents/:id",
  auth_key_header,
  auth_token,
  retrievePaymentIntent
);

// webhook must receive RAW body; mount separately in server.js
router.post("/webhook", stripeWebhook);

export default router;

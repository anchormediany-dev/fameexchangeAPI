import express from "express";
import auth_key_header from "../middleware/auth_key_header.js";
import auth_token from "../middleware/auth_token.js";
import {
  startPlatformMembershipCheckout,
  getMyMembership,
  cancelPlatformMembership,
  startFanSubscriptionCheckout,
  getMyFanSubscriptions,
  getMySubscribers,
  cancelFanSubscription,
  startProjectSupportPaymentIntent,
  futuresStripeWebhook,
} from "../controllers/futuresBillingController.js";

const router = express.Router();

// Note: the raw-body registration for this path lives in app.js (must run
// before express.json(), same requirement as /api/billing/webhook and
// /api/products/webhook) — this route definition is what actually handles it.
router.post("/webhook", futuresStripeWebhook);

router.post("/membership/start", auth_key_header, auth_token, startPlatformMembershipCheckout);
router.get("/membership/me", auth_key_header, auth_token, getMyMembership);
router.post("/membership/cancel", auth_key_header, auth_token, cancelPlatformMembership);

router.post("/fan-subscription/start", auth_key_header, auth_token, startFanSubscriptionCheckout);
router.get("/fan-subscription/me", auth_key_header, auth_token, getMyFanSubscriptions);
router.get("/fan-subscription/my-subscribers", auth_key_header, auth_token, getMySubscribers);
router.post("/fan-subscription/:id/cancel", auth_key_header, auth_token, cancelFanSubscription);

router.post("/project-support/start", auth_key_header, auth_token, startProjectSupportPaymentIntent);

export default router;

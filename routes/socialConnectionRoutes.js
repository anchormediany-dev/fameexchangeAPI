import express from "express";
import {
  startConnect,
  handleCallback,
  listConnections,
  disconnect,
  refreshConnection,
} from "../controllers/socialConnectionController.js";
import auth_key_header from "../middleware/auth_key_header.js";
import auth_token from "../middleware/auth_token.js";

const router = express.Router();

// List all platforms + their status + social_worth for the logged-in user.
router.get("/", auth_key_header, auth_token, listConnections);

// Begin an OAuth connect flow — returns { url } to redirect the browser to.
router.post("/:platform/start", auth_key_header, auth_token, startConnect);

// Re-pull follower count for a connected platform.
router.post("/:platform/refresh", auth_key_header, auth_token, refreshConnection);

// Disconnect a platform.
router.delete("/:platform", auth_key_header, auth_token, disconnect);

// OAuth provider redirect lands here. PUBLIC (no auth header on a redirect) —
// the user is identified via the signed `state` looked up in OAuthState.
router.get("/:platform/callback", handleCallback);

export default router;

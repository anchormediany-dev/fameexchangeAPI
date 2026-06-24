import mongoose from "mongoose";

/**
 * Short-lived record that ties an OAuth `state` value back to the user who
 * started the flow. The OAuth provider redirects to our public callback URL
 * with NO auth header, so we look the user up by this `state` instead.
 *
 * Also stores the PKCE `codeVerifier` (used by X / Twitter) so the callback
 * can complete the token exchange.
 *
 * Auto-expires after 10 minutes via the TTL index on `createdAt`.
 */
const oauthStateSchema = new mongoose.Schema({
  state: { type: String, required: true, unique: true, index: true },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  platform: { type: String, required: true },
  codeVerifier: { type: String }, // PKCE (Twitter)
  returnPath: { type: String, default: null }, // optional frontend path to redirect after OAuth
  createdAt: { type: Date, default: Date.now, expires: 600 }, // TTL: 10 min
});

export default mongoose.model("OAuthState", oauthStateSchema);

/**
 * Central config for social OAuth. All values come from environment variables
 * so nothing secret is committed. See SOCIAL_LOGIN_SETUP.md for how to obtain
 * each credential.
 */

// Public URL of THIS backend, used to build OAuth redirect (callback) URIs.
// Must EXACTLY match the redirect URI you register in each provider console.
// e.g. http://localhost:5006  (dev)   or   https://api.thefameexchange.com (prod)
export const BACKEND_PUBLIC_URL = (
  process.env.BACKEND_PUBLIC_URL ||
  process.env.BASE_URL ||
  "http://localhost:5006"
).replace(/\/$/, "");

// Where to send the user back to (the app) after a connect attempt finishes.
export const FRONTEND_PUBLIC_URL = (
  process.env.FRONTEND_PUBLIC_URL ||
  process.env.APP_BASE_URL ||
  "http://localhost:5174"
).replace(/\/$/, "");

// Build the callback URL for a platform.
export const redirectUri = (platform) =>
  `${BACKEND_PUBLIC_URL}/api/social-connections/${platform}/callback`;

export const providerCredentials = {
  youtube: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  },
  twitter: {
    clientId: process.env.TWITTER_CLIENT_ID,
    clientSecret: process.env.TWITTER_CLIENT_SECRET,
  },
  instagram: {
    clientId: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
  },
};

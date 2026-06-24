import axios from "axios";
import {
  providerCredentials,
  redirectUri,
} from "../../config/socialAuthConfig.js";

/**
 * X (Twitter) via OAuth 2.0 with PKCE.
 *
 * The login/ownership step works on the FREE tier. Reading `followers_count`
 * (GET /2/users/me?user.fields=public_metrics) requires the paid Basic tier or
 * higher. Until that is enabled, fetchAccount degrades gracefully: the account
 * stays connected with followers = 0 and `fetchPending = true`.
 */
const PLATFORM = "twitter";
const SCOPE = "tweet.read users.read offline.access";

const creds = () => providerCredentials.twitter;

export default {
  key: PLATFORM,
  usesPkce: true,

  isConfigured() {
    const { clientId, clientSecret } = creds();
    return Boolean(clientId && clientSecret);
  },

  getAuthUrl({ state, codeChallenge }) {
    const { clientId } = creds();
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri(PLATFORM),
      scope: SCOPE,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    return `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
  },

  async exchangeCode({ code, codeVerifier }) {
    const { clientId, clientSecret } = creds();
    // X requires HTTP Basic auth (client_id:client_secret) for confidential apps.
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const { data } = await axios.post(
      "https://api.twitter.com/2/oauth2/token",
      new URLSearchParams({
        code,
        grant_type: "authorization_code",
        client_id: clientId,
        redirect_uri: redirectUri(PLATFORM),
        code_verifier: codeVerifier,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basic}`,
        },
      }
    );
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      scope: data.scope,
    };
  },

  async fetchAccount({ accessToken }) {
    // Always resolve identity (works on free tier).
    let providerUserId = null;
    let username = null;
    let followers = 0;
    let fetchPending = false;

    try {
      const { data } = await axios.get("https://api.twitter.com/2/users/me", {
        params: { "user.fields": "public_metrics,username,name" },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const u = data?.data;
      providerUserId = u?.id || null;
      username = u?.username || null;
      followers = Number(u?.public_metrics?.followers_count || 0);
    } catch (err) {
      // 403 = endpoint/metrics not available on current API tier.
      const status = err?.response?.status;
      if (status === 403 || status === 429) {
        fetchPending = true;
      } else {
        throw err;
      }
    }

    return {
      providerUserId,
      username,
      profileUrl: username ? `https://x.com/${username}` : null,
      followers,
      fetchPending,
    };
  },
};

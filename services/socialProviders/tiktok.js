import axios from "axios";
import {
  providerCredentials,
  redirectUri,
} from "../../config/socialAuthConfig.js";

/**
 * TikTok via TikTok Login Kit (OAuth 2.0 with mandatory PKCE).
 *
 * `follower_count` requires the `user.info.stats` scope, which (like
 * Instagram/X here) needs TikTok's app review before it returns real data in
 * production — sandbox/test users work without review during development.
 * Until review is approved, fetchAccount degrades gracefully: the account
 * stays connected with followers = 0 and `fetchPending = true`, same pattern
 * as every other provider in this folder.
 *
 * Note TikTok's API uses "client_key" instead of "client_id" — that naming
 * is isolated to the request params below; the rest of this file follows the
 * same shape as every other provider so the generic connect/callback flow in
 * socialConnectionController.js doesn't need to know the difference.
 */
const PLATFORM = "tiktok";
const SCOPE = "user.info.basic,user.info.stats";

const creds = () => providerCredentials.tiktok;

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
      client_key: clientId,
      response_type: "code",
      scope: SCOPE,
      redirect_uri: redirectUri(PLATFORM),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
  },

  async exchangeCode({ code, codeVerifier }) {
    const { clientId, clientSecret } = creds();
    const { data } = await axios.post(
      "https://open.tiktokapis.com/v2/oauth/token/",
      new URLSearchParams({
        client_key: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri(PLATFORM),
        code_verifier: codeVerifier,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Cache-Control": "no-cache",
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
    let providerUserId = null;
    let username = null;
    let followers = 0;
    let fetchPending = false;

    try {
      const { data } = await axios.get(
        "https://open.tiktokapis.com/v2/user/info/",
        {
          params: {
            fields: "open_id,username,display_name,follower_count",
          },
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      const u = data?.data?.user;
      providerUserId = u?.open_id || null;
      username = u?.username || u?.display_name || null;
      followers = Number(u?.follower_count || 0);
      // TikTok returns 200 with an `error.code` field rather than an HTTP
      // error status when a scope wasn't granted/approved yet.
      if (data?.error && data.error.code !== "ok") {
        fetchPending = true;
      }
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        fetchPending = true;
      } else {
        throw err;
      }
    }

    return {
      providerUserId,
      username,
      profileUrl: username ? `https://www.tiktok.com/@${username}` : null,
      followers,
      fetchPending,
    };
  },
};

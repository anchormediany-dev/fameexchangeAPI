import axios from "axios";
import {
  providerCredentials,
  redirectUri,
} from "../../config/socialAuthConfig.js";

/**
 * Instagram via Facebook Login + Instagram Graph API.
 *
 * `followers_count` is only available for Instagram BUSINESS / CREATOR accounts
 * that are linked to a Facebook Page, and the app needs Meta App Review for the
 * `instagram_basic` / `pages_show_list` permissions to work for non-test users.
 *
 * Until that is in place, fetchAccount degrades gracefully: the account stays
 * connected with followers = 0 and `fetchPending = true`.
 *
 * (The old Instagram Basic Display API was shut down Dec 2024, so there is no
 * follower API for personal accounts — this is the only supported path.)
 */
const PLATFORM = "instagram";
const GRAPH = "https://graph.facebook.com/v19.0";
const SCOPE =
  "instagram_basic,pages_show_list,pages_read_engagement,business_management";

const creds = () => providerCredentials.instagram;

export default {
  key: PLATFORM,
  usesPkce: false,

  isConfigured() {
    const { clientId, clientSecret } = creds();
    return Boolean(clientId && clientSecret);
  },

  getAuthUrl({ state }) {
    const { clientId } = creds();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri(PLATFORM),
      response_type: "code",
      scope: SCOPE,
      state,
    });
    return `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
  },

  async exchangeCode({ code }) {
    const { clientId, clientSecret } = creds();
    const { data } = await axios.get(`${GRAPH}/oauth/access_token`, {
      params: {
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri(PLATFORM),
        code,
      },
    });
    return {
      accessToken: data.access_token,
      refreshToken: null,
      expiresIn: data.expires_in,
      scope: SCOPE,
    };
  },

  async fetchAccount({ accessToken }) {
    let providerUserId = null;
    let username = null;
    let followers = 0;
    let fetchPending = false;
    let avatarUrl = null;

    try {
      // 1) Pages the user manages
      const pages = await axios.get(`${GRAPH}/me/accounts`, {
        params: { access_token: accessToken },
      });
      const page = pages?.data?.data?.[0];
      if (!page) {
        return {
          providerUserId: null,
          username: null,
          profileUrl: null,
          followers: 0,
          fetchPending: true,
        };
      }

      // 2) IG business account linked to that page
      const linked = await axios.get(`${GRAPH}/${page.id}`, {
        params: {
          fields: "instagram_business_account",
          access_token: accessToken,
        },
      });
      const igId = linked?.data?.instagram_business_account?.id;
      if (!igId) {
        return {
          providerUserId: null,
          username: null,
          profileUrl: null,
          followers: 0,
          fetchPending: true,
        };
      }

      // 3) Followers + username + avatar
      const ig = await axios.get(`${GRAPH}/${igId}`, {
        params: {
          fields: "username,followers_count,profile_picture_url",
          access_token: accessToken,
        },
      });
      providerUserId = igId;
      username = ig?.data?.username || null;
      followers = Number(ig?.data?.followers_count || 0);
      avatarUrl = ig?.data?.profile_picture_url || null;
    } catch (err) {
      const status = err?.response?.status;
      // Permission / review / non-business-account issues -> pending, not fatal.
      if (status === 400 || status === 403 || status === 200) {
        fetchPending = true;
      } else {
        throw err;
      }
    }

    return {
      providerUserId,
      username,
      profileUrl: username ? `https://instagram.com/${username}` : null,
      avatarUrl,
      followers,
      fetchPending,
    };
  },
};

import axios from "axios";
import {
  providerCredentials,
  redirectUri,
} from "../../config/socialAuthConfig.js";

/**
 * YouTube via Google OAuth 2.0 + YouTube Data API v3.
 * FREE and reliable — works for any Google account that owns a channel.
 * Returns the channel's real `subscriberCount`.
 */
const PLATFORM = "youtube";
const SCOPE = "https://www.googleapis.com/auth/youtube.readonly";

const creds = () => providerCredentials.youtube;

export default {
  key: PLATFORM,
  // PKCE not required for Google's confidential web flow.
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
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "consent",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  },

  async exchangeCode({ code }) {
    const { clientId, clientSecret } = creds();
    const { data } = await axios.post(
      "https://oauth2.googleapis.com/token",
      new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri(PLATFORM),
        grant_type: "authorization_code",
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      scope: data.scope,
    };
  },

  async fetchAccount({ accessToken }) {
    const { data } = await axios.get(
      "https://www.googleapis.com/youtube/v3/channels",
      {
        params: { part: "snippet,statistics", mine: "true" },
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    const channel = data?.items?.[0];
    if (!channel) {
      return {
        providerUserId: null,
        username: null,
        profileUrl: null,
        followers: 0,
      };
    }
    return {
      providerUserId: channel.id,
      username: channel.snippet?.title || null,
      profileUrl: `https://www.youtube.com/channel/${channel.id}`,
      followers: Number(channel.statistics?.subscriberCount || 0),
    };
  },
};

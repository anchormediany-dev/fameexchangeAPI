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
        // contentDetails costs no extra quota bundled into this same call —
        // it's what gives us the uploads playlist ID for engagementMetrics().
        params: { part: "snippet,statistics,contentDetails", mine: "true" },
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

    const engagement = await engagementMetrics(accessToken, channel);

    return {
      providerUserId: channel.id,
      username: channel.snippet?.title || null,
      profileUrl: `https://www.youtube.com/channel/${channel.id}`,
      followers: Number(channel.statistics?.subscriberCount || 0),
      // Lifetime channel totals — already present in the same statistics
      // object above, no extra API call/quota needed. FameScore v2 uses
      // these to price a channel on views as well as subscribers (see
      // services/famescoreService.js's YouTube max(subscriber, views) value).
      totalViews: Number(channel.statistics?.viewCount || 0),
      videoCount: Number(channel.statistics?.videoCount || 0),
      // Real channel creation date — the only platform in this codebase
      // whose API exposes actual account age (used for the new/mature
      // growth-floor distinction in famescoreConfig.js).
      accountCreatedAt: channel.snippet?.publishedAt ? new Date(channel.snippet.publishedAt) : null,
      ...engagement,
    };
  },
};

const RECENT_VIDEOS_SAMPLE_SIZE = 10;

/**
 * Real engagement rate from a channel's most recent uploads — FameScore v2
 * input. Uses contentDetails.relatedPlaylists.uploads (free, already fetched
 * above) -> playlistItems.list for recent video IDs -> videos.list for real
 * like/comment/view counts. Deliberately avoids search.list (100x the quota
 * cost of playlistItems.list for the same result).
 *
 * Best-effort: any failure here (private stats, zero uploads, transient API
 * error) must never break the core follower-count fetch this is bolted onto
 * — returns nulls with no engagementRateSource rather than throwing, so
 * FameScore v2 falls back to its documented platform-default estimate
 * instead of silently fabricating a "measured" number.
 */
async function engagementMetrics(accessToken, channel) {
  try {
    const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) return { engagementRate: null, engagementRateSource: null, avgViewsPerPost: null };

    const { data: playlistData } = await axios.get(
      "https://www.googleapis.com/youtube/v3/playlistItems",
      {
        params: {
          part: "contentDetails",
          playlistId: uploadsPlaylistId,
          maxResults: RECENT_VIDEOS_SAMPLE_SIZE,
        },
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    const videoIds = (playlistData?.items || [])
      .map((item) => item.contentDetails?.videoId)
      .filter(Boolean);
    if (!videoIds.length) return { engagementRate: null, engagementRateSource: null, avgViewsPerPost: null };

    const { data: videosData } = await axios.get(
      "https://www.googleapis.com/youtube/v3/videos",
      {
        params: { part: "statistics", id: videoIds.join(",") },
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    const videos = videosData?.items || [];
    if (!videos.length) return { engagementRate: null, engagementRateSource: null, avgViewsPerPost: null };

    let totalViews = 0;
    let totalEngagements = 0; // likes + comments
    for (const v of videos) {
      const stats = v.statistics || {};
      totalViews += Number(stats.viewCount || 0);
      totalEngagements += Number(stats.likeCount || 0) + Number(stats.commentCount || 0);
    }

    if (totalViews === 0) return { engagementRate: null, engagementRateSource: null, avgViewsPerPost: null };

    return {
      engagementRate: +(totalEngagements / totalViews).toFixed(4),
      engagementRateSource: "measured",
      avgViewsPerPost: Math.round(totalViews / videos.length),
    };
  } catch (err) {
    console.error("YouTube engagementMetrics failed (non-fatal):", err?.response?.data || err.message);
    return { engagementRate: null, engagementRateSource: null, avgViewsPerPost: null };
  }
}

import crypto from "crypto";
import SocialConnection from "../models/socialConnection.js";
import OAuthState from "../models/oauthState.js";
import { getProvider, SUPPORTED_PLATFORMS } from "../services/socialProviders/index.js";
import { recomputeSocialWorth } from "../services/socialWorthService.js";
import { FRONTEND_PUBLIC_URL } from "../config/socialAuthConfig.js";

// ---- PKCE helpers (used by X / Twitter) ---------------------------------
const base64url = (buf) =>
  buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const makePkce = () => {
  const codeVerifier = base64url(crypto.randomBytes(32));
  const codeChallenge = base64url(
    crypto.createHash("sha256").update(codeVerifier).digest()
  );
  return { codeVerifier, codeChallenge };
};

const frontendRedirect = (userId, platform, status, reason, returnPath) => {
  const params = new URLSearchParams({ social: platform, status });
  if (reason) params.set("reason", reason);
  const path = returnPath || `update-profile/${userId}`;
  return `${FRONTEND_PUBLIC_URL}/${path}?${params.toString()}`;
};

/**
 * POST /api/social-connections/:platform/start   (auth required)
 * Returns { url } for the frontend to redirect the user to the provider.
 */
export const startConnect = async (req, res) => {
  try {
    const { platform } = req.params;
    const userId = req.user._id;

    const provider = getProvider(platform);
    if (!provider) {
      return res
        .status(400)
        .json({ success: false, message: `Unsupported platform: ${platform}` });
    }
    if (!provider.isConfigured()) {
      return res.status(400).json({
        success: false,
        configured: false,
        message: `${platform} is not configured yet. Add its API credentials to the server .env.`,
      });
    }

    const state = crypto.randomBytes(24).toString("hex");
    let codeVerifier;
    let codeChallenge;
    if (provider.usesPkce) {
      ({ codeVerifier, codeChallenge } = makePkce());
    }

    const { returnPath } = req.body;
    await OAuthState.create({ state, userId, platform, codeVerifier, returnPath: returnPath || null });

    const url = provider.getAuthUrl({ state, codeChallenge });
    return res.json({ success: true, url });
  } catch (err) {
    console.error("startConnect error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/social-connections/:platform/callback   (public — provider redirect)
 * Completes OAuth, fetches followers, stores the connection, then redirects
 * the user back to the app's profile page.
 */
export const handleCallback = async (req, res) => {
  const { platform } = req.params;
  const { code, state, error: oauthError } = req.query;

  // Look up who started this flow.
  const stateDoc = state ? await OAuthState.findOne({ state }) : null;
  const userId = stateDoc?.userId;

  // Helper to clean up + bounce back to the app.
  const returnPath = stateDoc?.returnPath || null;
  const finish = async (status, reason) => {
    if (stateDoc) await OAuthState.deleteOne({ _id: stateDoc._id });
    // If we never resolved a user (bad/expired state) send them to login.
    const target = userId
      ? frontendRedirect(userId, platform, status, reason, returnPath)
      : `${FRONTEND_PUBLIC_URL}/login?social=${platform}&status=error&reason=${reason || "expired"}`;
    return res.redirect(target);
  };

  try {
    if (oauthError) return finish("error", "denied");
    if (!stateDoc) return finish("error", "expired");
    if (stateDoc.platform !== platform) return finish("error", "mismatch");

    const provider = getProvider(platform);
    if (!provider) return finish("error", "unsupported");

    const tokens = await provider.exchangeCode({
      code,
      codeVerifier: stateDoc.codeVerifier,
    });

    const account = await provider.fetchAccount({
      accessToken: tokens.accessToken,
    });

    const tokenExpiresAt = tokens.expiresIn
      ? new Date(Date.now() + Number(tokens.expiresIn) * 1000)
      : undefined;

    await SocialConnection.findOneAndUpdate(
      { userId, platform },
      {
        $set: {
          providerUserId: account.providerUserId,
          username: account.username,
          profileUrl: account.profileUrl,
          avatarUrl: account.avatarUrl ?? null,
          followers: Number(account.followers) || 0,
          engagementRate: account.engagementRate ?? null,
          engagementRateSource: account.engagementRateSource ?? null,
          avgViewsPerPost: account.avgViewsPerPost ?? null,
          totalViews: account.totalViews ?? null,
          videoCount: account.videoCount ?? null,
          accountCreatedAt: account.accountCreatedAt ?? null,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiresAt,
          scope: tokens.scope,
          status: "connected",
          fetchPending: Boolean(account.fetchPending),
          lastError: null,
          lastSyncedAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await recomputeSocialWorth(userId);

    return finish("connected");
  } catch (err) {
    console.error(`Social callback error (${platform}):`, err?.response?.data || err.message);
    return finish("error", "exchange_failed");
  }
};

/**
 * GET /api/social-connections   (auth required)
 * Returns social_worth + a card for every supported platform (connected or not).
 */
export const listConnections = async (req, res) => {
  try {
    const userId = req.user._id;
    const connections = await SocialConnection.find({ userId }).lean();
    const byPlatform = Object.fromEntries(
      connections.map((c) => [c.platform, c])
    );

    const providers = SUPPORTED_PLATFORMS.map((platform) => {
      const provider = getProvider(platform);
      const conn = byPlatform[platform];
      return {
        platform,
        configured: provider.isConfigured(),
        connected: Boolean(conn && conn.status === "connected"),
        username: conn?.username || null,
        profileUrl: conn?.profileUrl || null,
        followers: conn?.followers || 0,
        fetchPending: conn?.fetchPending || false,
        lastSyncedAt: conn?.lastSyncedAt || null,
      };
    });

    const social_worth = providers
      .filter((p) => p.connected)
      .reduce((sum, p) => sum + (Number(p.followers) || 0), 0);

    return res.json({ success: true, social_worth, providers });
  } catch (err) {
    console.error("listConnections error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * DELETE /api/social-connections/:platform   (auth required)
 */
export const disconnect = async (req, res) => {
  try {
    const { platform } = req.params;
    const userId = req.user._id;

    await SocialConnection.deleteOne({ userId, platform });
    const social_worth = await recomputeSocialWorth(userId);

    return res.json({ success: true, platform, social_worth });
  } catch (err) {
    console.error("disconnect error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/social-connections/:platform/refresh   (auth required)
 * Re-pulls the follower count for an already-connected platform.
 */
export const refreshConnection = async (req, res) => {
  try {
    const { platform } = req.params;
    const userId = req.user._id;

    const provider = getProvider(platform);
    if (!provider) {
      return res.status(400).json({ success: false, message: "Unsupported platform" });
    }

    const conn = await SocialConnection.findOne({ userId, platform }).select(
      "+accessToken +refreshToken"
    );
    if (!conn) {
      return res.status(404).json({ success: false, message: "Not connected" });
    }

    try {
      const account = await provider.fetchAccount({
        accessToken: conn.accessToken,
      });
      conn.followers = Number(account.followers) || 0;
      conn.username = account.username || conn.username;
      conn.profileUrl = account.profileUrl || conn.profileUrl;
      conn.avatarUrl = account.avatarUrl ?? conn.avatarUrl;
      conn.fetchPending = Boolean(account.fetchPending);
      conn.engagementRate = account.engagementRate ?? null;
      conn.engagementRateSource = account.engagementRateSource ?? null;
      conn.avgViewsPerPost = account.avgViewsPerPost ?? null;
      conn.totalViews = account.totalViews ?? null;
      conn.videoCount = account.videoCount ?? null;
      // A channel's creation date never legitimately changes — preserve the
      // existing value if the provider ever omits it on refresh.
      conn.accountCreatedAt = account.accountCreatedAt ?? conn.accountCreatedAt;
      conn.lastError = null;
      conn.lastSyncedAt = new Date();
      await conn.save();
    } catch (err) {
      // Token likely expired — keep the connection but flag it.
      conn.lastError = "refresh_failed";
      conn.fetchPending = true;
      await conn.save();
    }

    const social_worth = await recomputeSocialWorth(userId);
    return res.json({
      success: true,
      platform,
      followers: conn.followers,
      fetchPending: conn.fetchPending,
      social_worth,
    });
  } catch (err) {
    console.error("refreshConnection error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

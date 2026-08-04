import mongoose from "mongoose";

/**
 * A verified ownership link between a Fame Exchange user and one of their
 * social-media accounts, established via OAuth (the user logged in to the
 * platform and granted us read access). This is INDEPENDENT of the legacy
 * scraper-based `Networth` model — it powers `social_worth`.
 *
 * `followers` is the real count pulled from the platform API. For platforms
 * that require a paid tier (X) or app review (Instagram), the connection can
 * exist with followers = 0 until that access is live ("connect now, count later").
 */
const socialConnectionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    platform: {
      type: String,
      required: true,
      enum: ["youtube", "twitter", "instagram", "facebook", "tiktok"],
    },

    // Identity on the platform
    providerUserId: { type: String }, // channel id / user id / ig user id
    username: { type: String }, // handle / channel title
    profileUrl: { type: String },
    // Real avatar/thumbnail URL from the platform — only populated today
    // for YouTube (see services/socialProviders/youtube.js), the only
    // provider whose fetchAccount() already pulls the channel snippet
    // this comes from. Stays null for every other platform.
    avatarUrl: { type: String, default: null },

    // The number that feeds social_worth
    followers: { type: Number, default: 0 },

    // FameScore v2 inputs. Real engagement data is only obtainable today for
    // YouTube (see services/socialProviders/youtube.js) — everywhere else
    // this stays null and FameScore v2 falls back to a documented industry-
    // average estimate (engagementRateSource: "platform_default_estimate").
    // Never silently fabricate a "measured" number for a platform we can't
    // actually measure.
    engagementRate: { type: Number, default: null },
    engagementRateSource: {
      type: String,
      enum: ["measured", "platform_default_estimate", null],
      default: null,
    },
    avgViewsPerPost: { type: Number, default: null },
    // YouTube-only today (see services/socialProviders/youtube.js) — lifetime
    // channel totals and real account-creation date, all pulled from the
    // same API call as followers/engagement, no extra quota cost. Null for
    // every other platform, whose APIs/scrapers don't expose this.
    totalViews: { type: Number, default: null },
    videoCount: { type: Number, default: null },
    accountCreatedAt: { type: Date, default: null },

    // OAuth material. select:false so it is never returned by default queries
    // and never leaks through the API. Needed to refresh follower counts later.
    accessToken: { type: String, select: false },
    refreshToken: { type: String, select: false },
    tokenExpiresAt: { type: Date, select: false },
    scope: { type: String, select: false },

    status: {
      type: String,
      enum: ["connected", "revoked", "error"],
      default: "connected",
    },
    // When followers could not be fetched yet (paid tier / app review pending)
    fetchPending: { type: Boolean, default: false },
    lastError: { type: String },
    lastSyncedAt: { type: Date },
  },
  { timestamps: true }
);

// One connection per platform per user
socialConnectionSchema.index({ userId: 1, platform: 1 }, { unique: true });

export default mongoose.model("SocialConnection", socialConnectionSchema);

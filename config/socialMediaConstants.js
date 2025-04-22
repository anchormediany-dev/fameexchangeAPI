export const PLATFORMS = {
  TWITTER: "twitter",
  FACEBOOK: "facebook",
  INSTAGRAM: "instagram",
  YOUTUBE: "youtube",
  TIKTOK: "tiktok",
  SNAPCHAT: "snapchat",
};

export const ERROR_MESSAGES = {
  INVALID_PLATFORM: "Invalid social media platform",
  MISSING_URL: "Profile URL is required",
  SCRAPING_FAILED: "Failed to scrape follower count",
};

export const TWITTER_CONFIG = {
  enabled: process.env.TWITTER_API_ENABLED === "true",
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_SECRET,
};

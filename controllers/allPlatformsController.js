import { getFacebookFollowers } from "./socialMediaControllers/facebookController.js";
import { getInstagramFollowers } from "./socialMediaControllers/instagramController.js";
import { getSnapchatSubscribers } from "./socialMediaControllers/snapchatController.js";
import { getTiktokFollowers } from "./socialMediaControllers/tiktokController.js";
import gettwitterFollower from "./socialMediaControllers/twitterController.js";
import { getYoutubeSubscribers } from "./socialMediaControllers/youtubeController.js";

const platformHandlers = {
  youtube: { fn: getYoutubeSubscribers, key: "subscribers" },
  twitter: { fn: gettwitterFollower, key: "followers" },
  instagram: { fn: getInstagramFollowers, key: "followers" },
  facebook: { fn: getFacebookFollowers, key: "followers" },
  tiktok: { fn: getTiktokFollowers, key: "followers" },
  snapchat: { fn: getSnapchatSubscribers, key: "subscribers" },
};

export const getAllPlatformsData = async (urls = {}) => {
  // This helper is invoked from the talent / networth flow. It must NEVER throw
  // because we still want to persist the talent's social profile URLs even if
  // every scraper fails. On any error per-platform we default the count to 1
  // so that downstream valuation never sees a zero.
  const DEFAULT_COUNT = 1;
  try {
    const requests = Object.entries(platformHandlers)
      .filter(([platform]) => urls[platform])
      .map(async ([platform, { fn, key }]) => {
        let responseData;
        try {
          // Create mock res
          const mockRes = {
            json: (data) => {
              responseData = data;
            },
            status: () => ({
              json: (data) => {
                responseData = data;
              },
            }),
          };

          const mockReq = {
            body: { url: urls[platform] },
            params:
              platform === "twitter"
                ? { username: String(urls[platform]).split("/").filter(Boolean).pop() }
                : {},
          };

          await fn(mockReq, mockRes);

          // Try multiple shapes that the various scrapers may return.
          let raw =
            responseData?.[key] ??
            responseData?.followers ??
            responseData?.subscribers ??
            responseData?.formattedCount ??
            0;

          // Some scrapers return a string like "1.2M" – best-effort to a number.
          if (typeof raw === "string") {
            const cleaned = raw.replace(/,/g, "").trim();
            const num = parseFloat(cleaned);
            if (Number.isFinite(num)) {
              if (/m$/i.test(cleaned)) raw = Math.round(num * 1_000_000);
              else if (/k$/i.test(cleaned)) raw = Math.round(num * 1_000);
              else raw = Math.round(num);
            } else {
              raw = 0;
            }
          }

          const count =
            Number.isFinite(Number(raw)) && Number(raw) > 0
              ? Number(raw)
              : DEFAULT_COUNT;

          return {
            platform,
            url: urls[platform],
            status: "success",
            [key]: count,
          };
        } catch (error) {
          // Scraper crashed – keep the URL and fall back to the default count.
          return {
            platform,
            url: urls[platform],
            status: "failed",
            error: error?.message || "scrape_failed",
            [key]: DEFAULT_COUNT,
          };
        }
      });

    const results = await Promise.all(requests);

    const totalFollowers = results.reduce((sum, p) => {
      const followers = p.followers || p.subscribers || 0;
      return sum + followers;
    }, 0);

    return {
      totalFollowers: totalFollowers > 0 ? totalFollowers : DEFAULT_COUNT,
      netWorth: totalFollowers > 0 ? totalFollowers : DEFAULT_COUNT,
      platforms: results,
    };
  } catch (error) {
    // Catch-all so the caller can still persist the social profile URLs.
    console.error("getAllPlatformsData fatal error:", error?.message || error);
    return {
      totalFollowers: DEFAULT_COUNT,
      netWorth: DEFAULT_COUNT,
      platforms: Object.entries(urls)
        .filter(([, v]) => !!v)
        .map(([platform, url]) => ({
          platform,
          url,
          status: "failed",
          error: "fatal_scrape_error",
        })),
    };
  }
};

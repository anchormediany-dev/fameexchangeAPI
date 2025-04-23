import { getFacebookFollowers } from "./socialMediaControllers/facebookController.js";
import { getInstagramFollowers } from "./socialMediaControllers/instagramController.js";
import { getSnapchatSubscribers } from "./socialMediaControllers/snapchatController.js";
import { getTiktokFollowers } from "./socialMediaControllers/tiktokController.js";
import gettwitterFollower from "./socialMediaControllers/twitterController.js";
import { getYoutubeSubscribers } from "./socialMediaControllers/youtubeController.js";

const platformHandlers = {
  youtube: { fn: getYoutubeSubscribers, key: "subscribers" },
  // twitter: { fn: gettwitterFollower, key: "followers" },
  instagram: { fn: getInstagramFollowers, key: "followers" },
  facebook: { fn: getFacebookFollowers, key: "followers" },
  tiktok: { fn: getTiktokFollowers, key: "followers" },
  snapchat: { fn: getSnapchatSubscribers, key: "subscribers" },
};

export const getAllPlatformsData = async (urls) => {
  try {
    const requests = Object.entries(platformHandlers)
      .filter(([platform]) => urls[platform])
      .map(async ([platform, { fn, key }]) => {
        try {
          let responseData;

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
                ? { username: urls[platform].split("/").pop() }
                : {},
          };

          await fn(mockReq, mockRes);

          return {
            platform,
            url: urls[platform],
            status: "success",
            [key]: responseData?.[key] || responseData?.formattedCount || 0,
          };
        } catch (error) {
          return {
            platform,
            url: urls[platform],
            status: "failed",
            error: error.message,
          };
        }
      });

    const results = await Promise.all(requests);

    const totalFollowers = results.reduce((sum, platform) => {
      const followers = platform.followers || platform.subscribers || 0;
      return sum + followers;
    }, 0);

    return {
      totalFollowers,
      netWorth: totalFollowers, // customize multiplier if needed
      platforms: results,
    };
  } catch (error) {
    throw new Error(`getAllPlatformsData failed: ${error.message}`);
  }
};

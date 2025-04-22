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

export const getAllPlatformsData = async (req, res) => {
  try {
    const { urls } = req.body;

    if (!urls || typeof urls !== "object") {
      return res.status(400).json({ error: "URLs object required" });
    }

    // Platform configuration
    const platformConfig = {
      youtube: {
        fn: getYoutubeSubscribers,
        key: "subscribers",
        validate: (url) => url.includes("youtube.com"),
      },
      // twitter: {
      //   fn: getTwitterFollowers,
      //   key: 'followers',
      //   validate: url => url.includes('twitter.com')
      // },
      instagram: {
        fn: getInstagramFollowers,
        key: "followers",
        validate: (url) => url.includes("instagram.com"),
      },
      facebook: {
        fn: getFacebookFollowers,
        key: "followers",
        validate: (url) => url.includes("facebook.com"),
      },
      tiktok: {
        fn: getTiktokFollowers,
        key: "followers",
        validate: (url) => url.includes("tiktok.com"),
      },
      snapchat: {
        fn: getSnapchatSubscribers,
        key: "subscribers",
        validate: (url) => url.includes("snapchat.com/add/"),
      },
    };

    // Prepare requests
    const requests = Object.entries(platformConfig)
      .filter(([platform, _]) => urls[platform])
      .map(async ([platform, config]) => {
        try {
          // Create mock Express objects
          const mockReq = {
            body: { url: urls[platform] },
            params:
              platform === "twitter"
                ? { username: urls[platform].split("/").pop() }
                : {},
          };

          let responseData;
          const mockRes = {
            json: (data) => {
              responseData = data;
            },
            status: () => mockRes,
          };

          // Execute the controller function
          await config.fn(mockReq, mockRes);

          return {
            platform,
            url: urls[platform],
            status: "success",
            [config.key]:
              responseData[config.key] || responseData.formattedCount || 0,
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
    console.log("results", results);
    const totalFollowers = results.reduce(
      (sum, result) =>
        result.status === "success"
          ? sum + (result[platformConfig[result.platform].key] || 0)
          : sum,
      0
    );

    res.json({
      success: true,
      totalFollowers,
      netWorth: totalFollowers,
      currency: "USD",
      platforms: results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

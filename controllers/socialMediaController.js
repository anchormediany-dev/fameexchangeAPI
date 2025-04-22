import { PLATFORMS, ERROR_MESSAGES } from "../config/socialMediaConstants.js";
import SocialMediaService from "../services/socialMediaService.js";

export const getFollowers = async (req, res) => {
  try {
    const { platform } = req.params;
    const { url } = req.query;

    if (!Object.values(PLATFORMS).includes(platform.toLowerCase())) {
      return res.status(400).json({ error: ERROR_MESSAGES.INVALID_PLATFORM });
    }

    if (!url) {
      return res.status(400).json({ error: ERROR_MESSAGES.MISSING_URL });
    }

    const followers = await SocialMediaService.getFollowers(platform, url);
    res.json({ platform, url, followers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getBatchFollowers = async (req, res) => {
  try {
    const { profiles } = req.body;

    if (!Array.isArray(profiles)) {
      return res.status(400).json({ error: "Profiles array is required" });
    }

    const results = await Promise.all(
      profiles.map(async ({ platform, url }) => {
        try {
          const followers = await SocialMediaService.getFollowers(
            platform,
            url
          );
          return { platform, url, followers, success: true };
        } catch (error) {
          return { platform, url, error: error.message, success: false };
        }
      })
    );

    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

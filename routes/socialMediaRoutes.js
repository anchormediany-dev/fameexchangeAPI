import express from "express";
import {
  getFollowers,
  getBatchFollowers,
} from "../controllers/socialMediaController.js";
import { getYoutubeSubscribers } from "../controllers/socialMediaControllers/youtubeController.js";
import { getTiktokFollowers } from "../controllers/socialMediaControllers/tiktokController.js";
import { getInstagramFollowers } from "../controllers/socialMediaControllers/instagramController.js";
import { getSnapchatSubscribers } from "../controllers/socialMediaControllers/snapchatController.js";
import { getFacebookFollowers } from "../controllers/socialMediaControllers/facebookController.js";
import gettwitterFollower from "../controllers/socialMediaControllers/twitterController.js";
import { getAllPlatformsData } from "../controllers/allPlatformsController.js";

// import getYoutubeSubscribers from "../scrapers/youtube.js";
const router = express.Router();

// Get followers for a specific platform
router.get("/:platform/followers", getFollowers);

// Get followers for all platforms at once
router.post("/followers/batch", getBatchFollowers);

router.post("/youtube/subscribers", getYoutubeSubscribers);
router.post("/tiktok/subscribers", getTiktokFollowers);
router.post("/instagram/subscribers", getInstagramFollowers);
router.post("/snapchat/subscribers", getSnapchatSubscribers);
router.post("/facebook/subscribers", getFacebookFollowers);
router.post("/twitter/:username", gettwitterFollower);

router.post("/all", getAllPlatformsData);

export default router;

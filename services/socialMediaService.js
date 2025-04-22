import { PLATFORMS } from "../config/socialMediaConstants.js";
// import TwitterService from "./twitterService.js";
import FacebookService from "./facebookService.js";
import InstagramService from "./instagramService.js";
import YoutubeService from "./youtubeService.js";
import TiktokService from "./tiktokService.js";
import SnapchatService from "./snapchatService.js";

export default class SocialMediaService {
  static async getFollowers(platform, url) {
    switch (platform.toLowerCase()) {
      //   case PLATFORMS.TWITTER:
      //     return TwitterService.getFollowers(url);
      case PLATFORMS.FACEBOOK:
        return FacebookService.getFollowers(url);
      case PLATFORMS.INSTAGRAM:
        return InstagramService.getFollowers(url);
      case PLATFORMS.YOUTUBE:
        return YoutubeService.getFollowers(url);
      case PLATFORMS.TIKTOK:
        return TiktokService.getFollowers(url);
      case PLATFORMS.SNAPCHAT:
        return SnapchatService.getFollowers(url);
      default:
        throw new Error("Unsupported platform");
    }
  }
}

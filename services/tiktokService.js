import { scrapeFollowers } from "../utils/scraper.js";

export default class TiktokService {
  static async getFollowers(url) {
    try {
      return await scrapeFollowers("tiktok", url);
    } catch (error) {
      throw new Error(`TikTok: ${error.message}`);
    }
  }
}

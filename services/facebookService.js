import { scrapeFollowers } from "../utils/scraper.js";

export default class FacebookService {
  static async getFollowers(url) {
    try {
      return await scrapeFollowers("facebook", url);
    } catch (error) {
      throw new Error(`Facebook: ${error.message}`);
    }
  }
}

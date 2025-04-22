import { scrapeFollowers } from "../utils/scraper.js";

export default class SnapchatService {
  static async getFollowers(url) {
    try {
      return await scrapeFollowers("snapchat", url);
    } catch (error) {
      throw new Error(`Snapchat: ${error.message}`);
    }
  }
}

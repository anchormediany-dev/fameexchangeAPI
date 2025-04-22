import { scrapeFollowers } from "../utils/scraper.js";

export default class InstagramService {
  static async getFollowers(url) {
    try {
      return await scrapeFollowers("instagram", url);
    } catch (error) {
      throw new Error(`Instagram: ${error.message}`);
    }
  }
}

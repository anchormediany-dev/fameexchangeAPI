import { scrapeFollowers } from "../utils/scraper.js";

export default class YoutubeService {
  static async getFollowers(url) {
    try {
      // Always use scraping for YouTube
      return await scrapeFollowers("youtube", url);
    } catch (error) {
      throw new Error(`YouTube: ${error.message}`);
    }
  }
}

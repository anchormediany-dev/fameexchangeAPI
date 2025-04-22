// import { TwitterApi } from "twitter-api-v2";
// import { extractUsername } from "../utils/helpers.js";
// import { scrapeFollowers } from "../utils/scraper.js";
// import twitterConfig from "../config/twitter-config.js";

// export default class TwitterService {
//   static async getFollowers(url) {
//     try {
//       // Try API first
//       if (twitterConfig.enabled) {
//         const client = new TwitterApi(twitterConfig);
//         const username = extractUsername(url);
//         const user = await client.v2.userByUsername(username, {
//           "user.fields": ["public_metrics"],
//         });
//         return user.data.public_metrics.followers_count;
//       }

//       // Fallback to scraping
//       return await scrapeFollowers("twitter", url);
//     } catch (error) {
//       throw new Error(`Twitter: ${error.message}`);
//     }
//   }
// }

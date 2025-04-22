import axios from "axios";
import * as cheerio from "cheerio";

export const scrapeInstagramProfile = async (profileUrl) => {
  try {
    const { data } = await axios.get(profileUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    const $ = cheerio.load(data);
    const script = $('script[type="application/ld+json"]').html();

    if (!script) {
      throw new Error("Profile metadata not found");
    }

    const metadata = JSON.parse(script);

    return {
      username: profileUrl.split("/").filter(Boolean).pop(),
      name: metadata.name,
      bio: metadata.description,
      profilePicture: metadata.image,
      followersCount:
        metadata.mainEntityofPage.interactionStatistic.userInteractionCount,
    };
  } catch (error) {
    console.error("Scraping error:", error.message);
    throw error;
  }
};

// =====================================================================================

// export default async function scrapeInstagram(page, url) {
//   try {
//     await page.goto(url, {
//       waitUntil: "networkidle2",
//       timeout: 30000,
//     });

//     // Wait for the list of stats to load
//     await page.waitForSelector("ul li", { timeout: 10000 });

//     const followers = await page.evaluate(() => {
//       const listItems = document.querySelectorAll("ul li");
//       if (listItems.length >= 2) {
//         const followersSpan = listItems[1].querySelector("span");
//         return (
//           followersSpan?.getAttribute("title") ||
//           followersSpan?.textContent ||
//           null
//         );
//       }
//       return null;
//     });

//     return {
//       platform: "Instagram",
//       url,
//       followers: followers || "Not found",
//     };
//   } catch (err) {
//     return {
//       platform: "Instagram",
//       url,
//       error: err.message,
//     };
//   }
// }

// export default async function scrapeInstagram(page, url) {
//   try {
//     await page.goto(url, {
//       waitUntil: "networkidle2",
//       timeout: 30000,
//     });

//     // Wait for followers count to be visible
//     await page.waitForSelector("ul li span", { timeout: 10000 });

//     const followers = await page.evaluate(() => {
//       const spans = document.querySelectorAll("ul li span");
//       if (spans.length > 0) {
//         return spans[0].getAttribute("title") || spans[0].textContent;
//       }
//       return null;
//     });

//     return {
//       platform: "Instagram",
//       url,
//       followers: followers || "Not found",
//     };
//   } catch (err) {
//     return {
//       platform: "Instagram",
//       url,
//       error: err.message,
//     };
//   }
// }

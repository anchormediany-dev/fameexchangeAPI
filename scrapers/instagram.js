import axios from "axios";
import * as cheerio from "cheerio";

// export const scrapeInstagramProfile = async (profileUrl) => {
//   try {
//     const { data } = await axios.get(profileUrl, {
//       headers: {
//         "User-Agent": "Mozilla/5.0",
//       },
//     });

//     const $ = cheerio.load(data);
//     const script = $('script[type="application/ld+json"]').html();

//     if (!script) {
//       throw new Error("Profile metadata not found");
//     }

//     const metadata = JSON.parse(script);

//     return {
//       username: profileUrl.split("/").filter(Boolean).pop(),
//       name: metadata.name,
//       bio: metadata.description,
//       profilePicture: metadata.image,
//       followersCount:
//         metadata.mainEntityofPage.interactionStatistic.userInteractionCount,
//     };
//   } catch (error) {
//     console.error("Scraping error:", error.message);
//     throw error;
//   }
// };

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

export default async function scrapeInstagram(page, url) {
  try {
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    // Wait for the profile header to load
    await page.waitForSelector("header section", { timeout: 15000 });

    // Extract follower count (supports "M", "K", etc.)
    const followersText = await page.evaluate(() => {
      // Try meta tag first (more reliable)
      const metaElement = document.querySelector(
        'meta[property="og:description"]'
      );
      if (metaElement) {
        const content = metaElement.getAttribute("content");
        const followersMatch = content.match(/([\d,.]+[MK]?)\s+Followers/);
        if (followersMatch) return followersMatch[1];
      }

      // Fallback to direct selector
      const followerElements = document.querySelectorAll(
        "header section ul li"
      );
      if (followerElements.length >= 3) {
        const followerElement = followerElements[1]; // Followers is usually the 2nd <li>
        const followerText =
          followerElement.querySelector("a span")?.textContent ||
          followerElement.querySelector("span")?.textContent;
        return followerText?.trim();
      }
      return null;
    });

    // Convert "652M" → 652000000, "1.2K" → 1200, etc.
    const parseFollowers = (text) => {
      if (!text) return null;

      // Remove commas (e.g., "1,000" → "1000")
      const cleaned = text.replace(/,/g, "");

      // Check for "M" (millions), "K" (thousands)
      if (cleaned.includes("M")) {
        return Math.round(parseFloat(cleaned) * 1000000);
      } else if (cleaned.includes("K")) {
        return Math.round(parseFloat(cleaned) * 1000);
      } else if (!isNaN(parseFloat(cleaned))) {
        return parseFloat(cleaned);
      }
      return null;
    };

    const followers = parseFollowers(followersText);

    return {
      platform: "Instagram",
      url,
      followers: followers || "Not found",
    };
  } catch (err) {
    return {
      platform: "Instagram",
      url,
      error: err.message,
    };
  }
}

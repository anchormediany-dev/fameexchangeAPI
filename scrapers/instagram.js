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
    // Make IG serve English text ("followers") and look like a real browser
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });

    await page.goto(url, {
      waitUntil: ["domcontentloaded", "networkidle2"],
      timeout: 45000,
    });

    // Helper to normalize and parse counts like "293M", "1.2K", "293,742,640"
    const parseCount = (numStr, suffix = "") => {
      if (!numStr) return null;
      // Remove commas, NBSP, middle dots, thin spaces, etc.
      let s = String(numStr)
        .replace(/[\u00A0\u202F\u2009·\s]/g, "")
        .replace(/,/g, "");
      // If there are multiple dots (likely thousand separators), strip them
      if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, "");
      const n = parseFloat(s);
      if (isNaN(n)) return null;
      const p = String(suffix).toLowerCase();
      if (p === "k") return Math.round(n * 1e3);
      if (p === "m") return Math.round(n * 1e6);
      if (p === "b") return Math.round(n * 1e9);
      return Math.round(n);
    };

    // Try a few times — IG often hydrates late
    async function tryGetFollowersOnce() {
      return await page.evaluate(() => {
        function convert(num, suf) {
          // Same logic as parseCount but inline for the page context
          if (!num) return null;
          let s = String(num)
            .replace(/[\u00A0\u202F\u2009·\s]/g, "")
            .replace(/,/g, "");
          if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, "");
          const n = parseFloat(s);
          if (isNaN(n)) return null;
          const p = String(suf || "").toLowerCase();
          if (p === "k") return Math.round(n * 1e3);
          if (p === "m") return Math.round(n * 1e6);
          if (p === "b") return Math.round(n * 1e9);
          return Math.round(n);
        }

        // 1) Prefer header text: find the node that contains "followers"
        const candidates = Array.from(
          document.querySelectorAll(
            "header section ul li, header li, header a, header span"
          )
        );
        const li = candidates.find((el) =>
          /followers/i.test(el.textContent || "")
        );
        if (li) {
          // Prefer the precise number in a [title] attribute if present
          const titlePrecise = li
            .querySelector("[title]")
            ?.getAttribute("title");
          if (titlePrecise) {
            const digits = titlePrecise.replace(/[^\d]/g, "");
            if (digits) return Number(digits);
          }

          // Otherwise parse something like "293M followers"
          const text = (li.textContent || "").trim();
          const m = text.match(/([\d.,]+)\s*([kmb])?\s*followers/i);
          if (m) return convert(m[1], m[2]);

          // Or just parse the nearest number inside spans
          const inner = (li.querySelector("span")?.textContent || "").trim();
          const m2 = inner.match(/([\d.,]+)\s*([kmb])?/i);
          if (m2) return convert(m2[1], m2[2]);
        }

        // 2) Fallback: meta og:description ("293M Followers, 123 Following …")
        const meta = document
          .querySelector('meta[property="og:description"]')
          ?.getAttribute("content");
        if (meta) {
          const mm = meta.match(/([\d.,]+)\s*([kmb])?\s+followers/i);
          if (mm) return convert(mm[1], mm[2]);
        }

        return null;
      });
    }

    let followers = null;
    const deadline = Date.now() + 15000; // up to 15s of gentle retry
    while (!followers && Date.now() < deadline) {
      followers = await tryGetFollowersOnce();
      if (followers) break;
      await page.waitForTimeout(800);
    }

    // 3) Last-resort: internal web profile API (works if logged-in cookies are present)
    if (!followers) {
      const username = new URL(page.url()).pathname
        .split("/")
        .filter(Boolean)[0];
      if (username) {
        try {
          const apiCount = await page.evaluate(async (u) => {
            try {
              const r = await fetch(
                `/api/v1/users/web_profile_info/?username=${encodeURIComponent(
                  u
                )}`,
                {
                  credentials: "include",
                }
              );
              if (!r.ok) return null;
              const j = await r.json();
              return j?.data?.user?.edge_followed_by?.count ?? null;
            } catch {
              return null;
            }
          }, username);
          if (apiCount) followers = apiCount;
        } catch {
          // ignore
        }
      }
    }

    if (!followers && followers !== 0) {
      return { platform: "Instagram", url, followers: "Not found" };
    }

    return { platform: "Instagram", url, followers };
  } catch (err) {
    return { platform: "Instagram", url, error: err?.message || String(err) };
  }
}

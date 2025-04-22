import puppeteer from "puppeteer";
import fs from "fs";
export default async function getTwitterFollowerCount(username) {
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();

  try {
    // Configure browser
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    );
    await page.setViewport({ width: 1280, height: 800 });

    console.log(`Navigating to @${username}'s profile...`);
    await page.goto(`https://twitter.com/${username}`, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    // Debug: Save full HTML for inspection
    const html = await page.content();
    fs.writeFileSync(`${username}_debug.html`, html);
    console.log(`Saved full HTML to ${username}_debug.html`);

    // Wait for profile to load
    await page.waitForSelector('div[data-testid="UserName"]', {
      timeout: 15000,
    });

    // Debug: Find all potential follower count elements
    const debugInfo = await page.evaluate(() => {
      // Find all links containing "followers"
      const allLinks = Array.from(
        document.querySelectorAll('a[href*="followers"], a[role="link"]')
      );

      // Find elements with follower count classes
      const countSpans = Array.from(
        document.querySelectorAll(
          "span.css-1jxf684.r-bcqeeo.r-1ttztb7.r-qvutc0.r-poiln3"
        )
      );

      return {
        allLinks: allLinks.map((link) => ({
          href: link.href,
          text: link.textContent.trim(),
          classes: Array.from(link.classList),
          outerHTML: link.outerHTML.substring(0, 200) + "...",
        })),
        countSpans: countSpans.map((span) => ({
          text: span.textContent.trim(),
          classes: Array.from(span.classList),
          parentHTML: span.parentElement?.outerHTML.substring(0, 200) + "...",
        })),
      };
    });

    console.log("DEBUG INFORMATION:");
    console.log("All potential follower links:", debugInfo.allLinks);
    console.log("All count span elements:", debugInfo.countSpans);

    // Try to extract follower count
    const followerCount = await page.evaluate(() => {
      // Method 1: Direct span with number
      const directCount = document.querySelector(
        "span.css-1jxf684.r-bcqeeo.r-1ttztb7.r-qvutc0.r-poiln3"
      );
      if (directCount && directCount.textContent.match(/[\d.,]+[KMB]?/)) {
        return {
          source: "direct_span",
          value: directCount.textContent.trim(),
        };
      }

      // Method 2: Link with followers
      const followersLink = Array.from(
        document.querySelectorAll('a[href*="/followers"]')
      ).find((a) => a.textContent.includes("Followers"));
      if (followersLink) {
        const spans = followersLink.querySelectorAll("span");
        for (const span of spans) {
          if (
            span.textContent.match(/[\d.,]+[KMB]?/) &&
            !span.textContent.includes("Followers")
          ) {
            return {
              source: "link_span",
              value: span.textContent.trim(),
              parentHTML: followersLink.outerHTML.substring(0, 200) + "...",
            };
          }
        }
      }

      // Method 3: Profile stats section
      const statsSection = document.querySelector(
        'div[data-testid="UserName"]'
      )?.parentElement;
      if (statsSection) {
        const spans = statsSection.querySelectorAll("span");
        for (const span of spans) {
          if (
            span.textContent.match(/[\d.,]+[KMB]?/) &&
            span.nextElementSibling?.textContent.includes("Followers")
          ) {
            return {
              source: "stats_section",
              value: span.textContent.trim(),
            };
          }
        }
      }

      return null;
    });

    console.log("FOLLOWER COUNT EXTRACTION RESULT:");
    console.dir(followerCount, { depth: null, colors: true });

    if (!followerCount?.value) {
      await page.screenshot({ path: `${username}_debug.png` });
      throw new Error("Follower count element not found");
    }

    console.log(`@${username} has ${followerCount.value} followers`);
    const sanitizedCount = followerCount.value
      ? convertInstagramFollowerCount(followerCount.value)
      : null;
    return {
      username: username,
      followerCount: sanitizedCount,
    };
  } catch (error) {
    console.error("Error:", error.message);
    return {
      username: username,
      followerCount: null,
      error: error.message,
      debugFiles: [`${username}_debug.html`, `${username}_debug.png`],
    };
  } finally {
    await browser.close();
  }
}

function convertInstagramFollowerCount(text) {
  // Case 1: Already clean number (from meta tag)
  if (/^\d+$/.test(text)) {
    return parseInt(text.replace(/,/g, ""), 10);
  }

  // Case 2: Formatted text (e.g., "12,345 followers", "12.3M", etc.)
  const match = text.match(/([\d,.]+)([MK]?)/);
  if (!match) return null;

  const num = parseFloat(match[1].replace(/,/g, ""));
  const unit = match[2];

  switch (unit) {
    case "M":
      return Math.round(num * 1000000);
    case "K":
      return Math.round(num * 1000);
    default:
      return Math.round(num);
  }
}

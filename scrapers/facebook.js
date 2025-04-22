export default async function scrapeFacebookFollowers(page, url) {
  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

    // Wait for the followers element to load
    await page.waitForSelector('[href*="followers"]', { timeout: 15000 });

    const followerText = await page.evaluate(() => {
      // Method 1: Try to find the followers link text
      const followersLink = document.querySelector('[href*="followers"]');
      if (followersLink) {
        return followersLink.textContent.trim();
      }

      // Method 2: Search all spans for follower text
      const spans = Array.from(document.querySelectorAll("span"));
      for (const span of spans) {
        if (
          span.textContent &&
          /[\d.]+[MK]?\s*followers/i.test(span.textContent)
        ) {
          return span.textContent.trim();
        }
      }
      return null;
    });

    // Sanitize and convert the follower count
    const sanitizedCount = followerText
      ? convertFollowerCount(followerText)
      : null;

    return {
      platform: "Facebook",
      url,
      followers: sanitizedCount,
      rawText: followerText, // Keep original for reference
    };
  } catch (err) {
    return {
      platform: "Facebook",
      url,
      error: err.message,
      followers: null,
    };
  }
}

// Helper function to convert follower text to number
function convertFollowerCount(text) {
  // Extract the numeric part with K/M suffix
  const match = text.match(/([\d.,]+)([MK]?)/);
  if (!match) return null;

  // Remove commas and convert to number
  const num = parseFloat(match[1].replace(/,/g, ""));
  const unit = match[2];

  // Convert based on unit
  switch (unit) {
    case "M":
      return Math.round(num * 1000000);
    case "K":
      return Math.round(num * 1000);
    default:
      return Math.round(num);
  }
}

export default async function scrapeTiktok(page, url) {
  try {
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 100000,
    });

    await page.waitForSelector('strong[data-e2e="followers-count"]', {
      timeout: 10000,
    });

    const followers = await page.evaluate(() => {
      const el = document.querySelector('strong[data-e2e="followers-count"]');
      return el ? el.textContent.trim() : null;
    });

    const sanitizedCount = followers
      ? convertInstagramFollowerCount(followers)
      : null;

    return {
      platform: "TikTok",
      url,
      followers: sanitizedCount || "Not found",
    };
  } catch (err) {
    return {
      platform: "TikTok",
      url,
      error: err.message,
    };
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

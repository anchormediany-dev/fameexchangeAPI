export default async function scrapeYoutube(page, url) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Wait for the subscriber count element
    await page.waitForSelector(
      "span.yt-content-metadata-view-model-wiz__metadata-text",
      { timeout: 15000 }
    );

    const subscriberText = await page.evaluate(() => {
      const elements = document.querySelectorAll(
        "span.yt-content-metadata-view-model-wiz__metadata-text"
      );
      for (let el of elements) {
        if (el.textContent.includes("subscribers")) {
          return el.textContent.trim();
        }
      }
      return null;
    });

    // Sanitize and convert the subscriber count
    const sanitizedCount = subscriberText
      ? convertSubscriberCount(subscriberText)
      : null;

    return {
      platform: "YouTube",
      url,
      subscribers: sanitizedCount,
      rawText: subscriberText, // Keep original for reference
    };
  } catch (err) {
    return {
      platform: "YouTube",
      url,
      error: err.message,
      subscribers: null,
    };
  }
}

// Helper function to convert subscriber text to number
function convertSubscriberCount(text) {
  // Remove commas and trim whitespace
  const cleanText = text.replace(/,/g, "").trim();

  // Extract the numeric value and unit
  const match = cleanText.match(/^([\d.]+)([MK]?)/);
  if (!match) return null;

  const num = parseFloat(match[1]);
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

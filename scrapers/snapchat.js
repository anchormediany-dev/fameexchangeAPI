export default async function scrapeSnapchat(page, url) {
  try {
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    // Wait for profile elements to load
    await page.waitForSelector("h1, h2", { timeout: 10000 });

    const data = await page.evaluate(() => {
      const name = document.querySelector("h1")?.textContent || null;
      const username = document.querySelector("h2")?.textContent || null;

      // Look for any text mentioning followers or subscribers
      let subscribers = null;
      const spans = Array.from(document.querySelectorAll("span"));
      for (const span of spans) {
        const text = span.textContent?.toLowerCase();
        if (
          text &&
          (text.includes("subscriber") || text.includes("followers"))
        ) {
          subscribers = span.textContent;
          break;
        }
      }

      return {
        name,
        subscribers: subscribers || "Not visible",
      };
    });

    return {
      platform: "Snapchat",
      url,
      ...data,
    };
  } catch (err) {
    return {
      platform: "Snapchat",
      url,
      error: err.message,
    };
  }
}

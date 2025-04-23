export default async function scrapeSnapchat(page, url) {
  try {
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 100000,
    });

    // Wait for profile elements to load
    await page.waitForSelector("h1, h2", { timeout: 10000 });

    const data = await page.evaluate(() => {
      const name = document.querySelector("h1")?.textContent || null;
      const username = document.querySelector("h2")?.textContent || null;

      // Function to convert strings like "1.2M", "15K", "3,000" into numbers
      const parseSubscribers = (text) => {
        if (!text) return null;
        const lower = text.toLowerCase().replace(/,/g, "").trim();
        let match = lower.match(/([\d.]+)\s*(k|m|b)?/);
        if (!match) return null;

        let [, num, suffix] = match;
        num = parseFloat(num);

        switch (suffix) {
          case "k":
            return Math.round(num * 1000);
          case "m":
            return Math.round(num * 1000000);
          case "b":
            return Math.round(num * 1000000000);
          default:
            return Math.round(num);
        }
      };

      // Look for any text mentioning followers or subscribers
      let rawSubscribers = null;
      const spans = Array.from(document.querySelectorAll("span"));
      for (const span of spans) {
        const text = span.textContent?.toLowerCase();
        if (
          text &&
          (text.includes("subscriber") || text.includes("followers"))
        ) {
          rawSubscribers = span.textContent;
          break;
        }
      }

      const subscribers = parseSubscribers(rawSubscribers);

      return {
        name,
        subscribers: subscribers !== null ? subscribers : "Not visible",
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

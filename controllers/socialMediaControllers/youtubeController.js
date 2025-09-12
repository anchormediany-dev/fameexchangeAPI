// controllers/getYoutubeSubscribers.js
import puppeteer from "puppeteer";
import scrapeYoutube from "../../scrapers/youtube.js";

export const getYoutubeSubscribers = async (req, res) => {
  const { url } = req.body;

  // Validate the YouTube URL
  if (
    !url ||
    !/^https?:\/\/(www\.)?(youtube\.com|m\.youtube\.com)\/.+/.test(url)
  ) {
    return res
      .status(400)
      .json({ error: "A valid YouTube channel URL is required" });
  }

  let browser;
  try {
    // Launch Puppeteer — still used (as fallback and to keep your signature),
    // but we'll block heavy resources to keep it light.
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
      defaultViewport: { width: 1280, height: 800 },
    });

    const page = await browser.newPage();

    // Block images/CSS/fonts for speed
    await page.setRequestInterception(true);
    page.on("request", (reqInt) => {
      const type = reqInt.resourceType();
      if (["image", "stylesheet", "font"].includes(type)) return reqInt.abort();
      reqInt.continue();
    });

    // Scrape (uses optimized HTTP-first internally, then page fallback)
    const result = await scrapeYoutube(page, url);

    return res.json({ success: true, ...result });
  } catch (err) {
    console.error("YouTube scrape error:", err);
    return res
      .status(500)
      .json({
        success: false,
        error: "Failed to fetch YouTube subscribers",
        details: err.message,
      });
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
  }
};

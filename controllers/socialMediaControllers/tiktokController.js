import puppeteer from "puppeteer";
import scrapeTiktok from "../../scrapers/tiktok.js";

export const getTiktokFollowers = async (req, res) => {
  const { url } = req.body;
  // console.log("url tiktok", url);
  if (!url || !url.includes("tiktok.com")) {
    return res.status(400).json({ error: "Valid TikTok URL is required" });
  }

  try {
    const browser = await puppeteer.launch({
      headless: false, // You can turn this off later if it works
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    // Set a realistic user agent to avoid blocks
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
    );

    const result = await scrapeTiktok(page, url);
    console.log("tiktok result", result);
    await browser.close();

    res.json(result);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to scrape TikTok", details: err.message });
  }
};

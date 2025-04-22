import puppeteer from "puppeteer";
import scrapeSnapchat from "../../scrapers/snapchat.js";

export const getSnapchatSubscribers = async (req, res) => {
  const { url } = req.body;
  //   console.log("url snapchat", url);
  if (!url || !url.includes("snapchat.com/add/")) {
    return res.status(400).json({ error: "Valid Snapchat URL is required" });
  }

  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    const result = await scrapeSnapchat(page, url);

    await browser.close();
    console.log("snapchat result", result);

    res.json(result);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to scrape Snapchat", details: err.message });
  }
};

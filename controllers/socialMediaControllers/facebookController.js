import puppeteer from "puppeteer";
import scrapeFacebookFollowers from "../../scrapers/facebook.js";

export const getFacebookFollowers = async (req, res) => {
  const { url } = req.body;
  // console.log("url facebook", url);

  if (!url || !url.includes("facebook.com")) {
    return res.status(400).json({ error: "A valid Facebook URL is required" });
  }

  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    const result = await scrapeFacebookFollowers(page, url);
    await browser.close();
    console.log("facebook result", result);

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

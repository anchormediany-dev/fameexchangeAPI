import { scrapeInstagramProfile } from "../../scrapers/instagram.js";

export const getInstagramFollowers = async (req, res) => {
  const { url } = req.body;

  if (!url || !url.includes("instagram.com")) {
    return res
      .status(400)
      .json({ error: "Invalid or missing Instagram profile URL" });
  }

  try {
    const profileData = await scrapeInstagramProfile(url);
    res.json(profileData);
  } catch (err) {
    console.log(err);
    res
      .status(500)
      .json({ error: "Failed to scrape profile", message: err.message });
  }
};

// ===========================================================================
// import puppeteer from "puppeteer";
// import scrapeInstagram from "../../scrapers/instagram.js";

// export const getInstagramFollowers = async (req, res) => {
//   const { url } = req.body;

//   if (!url || !url.includes("instagram.com")) {
//     return res.status(400).json({ error: "Valid Instagram URL is required" });
//   }

//   try {
//     const browser = await puppeteer.launch({
//       headless: false, // Use false during testing
//       args: ["--no-sandbox", "--disable-setuid-sandbox"],
//     });

//     const page = await browser.newPage();

//     // Avoid bot detection
//     await page.setUserAgent(
//       "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
//     );

//     await page.setViewport({ width: 1280, height: 800 });

//     const result = await scrapeInstagram(page, url);
//     await browser.close();

//     res.json(result);
//   } catch (err) {
//     res
//       .status(500)
//       .json({ error: "Failed to scrape Instagram", details: err.message });
//   }
// };

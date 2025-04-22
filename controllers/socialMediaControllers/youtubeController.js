import puppeteer from "puppeteer";
import scrapeYoutube from "../../scrapers/youtube.js";

export const getYoutubeSubscribers = async (req, res) => {
  const { url } = req.body;

  console.log("url youtube", url);
  // Validate the YouTube URL
  if (!url || !url.includes("youtube.com")) {
    return res.status(400).json({ error: "Valid YouTube URL is required" });
  }

  try {
    // Launch Puppeteer browser in non-headless mode (this opens the browser window for debugging)
    const browser = await puppeteer.launch({ headless: false }); // <-- headless: false for visual debugging
    const page = await browser.newPage();

    // Call the scraping function
    const result = await scrapeYoutube(page, url);

    // Close the browser after scraping
    await browser.close();

    // Send the result back to the client
    res.json(result);
  } catch (err) {
    // Handle any errors
    res
      .status(500)
      .json({ error: "Failed to scrape YouTube", details: err.message });
  }
};

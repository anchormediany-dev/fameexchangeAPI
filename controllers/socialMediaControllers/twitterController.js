import getTwitterFollowerCount from "../../scrapers/twitterScraper.js";

export default async function gettwitterFollower(req, res) {
  const username = req.params.username;

  console.log("username twitter", username);
  if (!username) {
    return res.status(400).json({ error: "Username is required" });
  }

  try {
    const rawCount = await getTwitterFollowerCount(username);
    // console.log("raw count", rawCount);
    //   const count = convertToNumber(rawCount);
    return res.status(200).json({
      username,
      // followerCount: count,
      formattedCount: rawCount.followerCount,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to scrape follower count",
      details: error.message,
    });
  }
}

// Optional: convert shorthand like "181.2M" to full number
// function convertToNumber(text) {
//   if (!text) return null;
//   const num = parseFloat(text.replace(/[^\d\.]/g, ""));
//   if (text.includes("M")) return Math.round(num * 1_000_000);
//   if (text.includes("K")) return Math.round(num * 1_000);
//   return parseInt(text.replace(/,/g, ""), 10);
// }

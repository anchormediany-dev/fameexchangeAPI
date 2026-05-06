import Networth from "../models/networth.js";
import User from "../models/user.js";
import { getAllPlatformsData } from "./allPlatformsController.js";

export const saveNetworthData = async (req, res) => {
  try {
    const {
      fullName,
      tokenBrandName,
      tokenName,
      youtube,
      twitter,
      instagram,
      facebook,
      tiktok,
      snapchat,
    } = req.body;

    const userId = req.user._id;
    if (!userId || !fullName) {
      return res
        .status(400)
        .json({ error: "User ID and Full Name are required" });
    }

    const urls = { youtube, twitter, instagram, facebook, tiktok, snapchat };

    // Always update user social media links FIRST – this must succeed
    // regardless of whether the scrapers below work, so the talent always
    // owns their profile data.
    await User.findByIdAndUpdate(
      userId,
      {
        social_youtube: youtube,
        social_twitter: twitter,
        social_insta: instagram,
        social_facebook: facebook,
        social_tiktok: tiktok,
        social_snap: snapchat,
        ...(tokenBrandName ? { token_brand_name: tokenBrandName } : {}),
        ...(tokenName ? { token_name: tokenName } : {}),
      },
      { new: true }
    );

    // Best-effort valuation. If anything goes wrong we still save the record
    // so the talent can see/update their profile later.
    let totalFollowers = 1;
    let netWorth = 1;
    let platforms = [];
    try {
      const result = await getAllPlatformsData(urls);
      totalFollowers = Number(result?.totalFollowers) > 0 ? result.totalFollowers : 1;
      netWorth = Number(result?.netWorth) > 0 ? result.netWorth : 1;
      platforms = Array.isArray(result?.platforms) ? result.platforms : [];
    } catch (scrapeErr) {
      console.error("Networth scrape skipped:", scrapeErr?.message || scrapeErr);
    }

    const socialMedia = {};
    platforms.forEach(({ platform, url, status, error, ...rest }) => {
      // Make sure every requested platform has a count of at least 1.
      const followers =
        rest.followers && rest.followers > 0 ? rest.followers : 1;
      const subscribers =
        rest.subscribers && rest.subscribers > 0 ? rest.subscribers : 1;
      socialMedia[platform] = {
        url,
        ...(["youtube", "snapchat"].includes(platform)
          ? { subscribers }
          : { followers }),
      };
    });

    // Ensure every URL the user provided ends up in the stored map even
    // if the scraper returned nothing.
    Object.entries(urls).forEach(([platform, url]) => {
      if (url && !socialMedia[platform]) {
        socialMedia[platform] = ["youtube", "snapchat"].includes(platform)
          ? { url, subscribers: 1 }
          : { url, followers: 1 };
      }
    });

    // 🔑 Check if net worth already exists for this user
    let existingEntry = await Networth.findOne({ userId });

    if (existingEntry) {
      // Update existing entry
      existingEntry.fullName = fullName;
      existingEntry.tokenBrand = { brandName: tokenBrandName, tokenName };
      existingEntry.socialMedia = socialMedia;
      existingEntry.totalFollowers = totalFollowers;
      existingEntry.netWorth = netWorth;

      await existingEntry.save();
      return res.status(200).json({ success: true, data: existingEntry });
    }

    // Otherwise create a new entry
    const newEntry = new Networth({
      userId,
      fullName,
      tokenBrand: { brandName: tokenBrandName, tokenName },
      socialMedia,
      totalFollowers,
      netWorth,
    });

    await newEntry.save();

    res.status(201).json({ success: true, data: newEntry });
  } catch (error) {
    console.error("Networth Save Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getNetwothData = async (req, res) => {
  const userId = req.user._id;
  try {
    const data = await Networth.findOne({ userId });
    res.status(201).json({ success: true, data });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, error: error.message });
  }
};
export const getAllNetwothData = async (req, res) => {
  try {
    const data = await Networth.find().populate(
      "userId",
      "email name image role is_rep_have talent token_brand_name representation biography datetime rep_type"
    );
    res.status(201).json({ success: true, data });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, error: error.message });
  }
};

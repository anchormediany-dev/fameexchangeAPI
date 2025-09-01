import Networth from "../models/Networth.js";
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

    const userSocialMediaData = await User.findByIdAndUpdate(
      userId,
      {
        social_youtube: youtube,
        social_twitter: twitter,
        social_insta: instagram,
        social_facebook: facebook,
        social_tiktok: tiktok,
        social_snap: snapchat,
      },
      { new: true }
    );
    const { totalFollowers, netWorth, platforms } = await getAllPlatformsData(
      urls
    );

    const socialMedia = {};
    platforms.forEach(({ platform, url, ...rest }) => {
      socialMedia[platform] = { url, ...rest };
    });

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

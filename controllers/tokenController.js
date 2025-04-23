import Token from "../models/Token.js";
import User from "../models/user.js";

// Create new token
export const createToken = async (req, res) => {
  try {
    const token = new Token(req.body);
    await token.save();
    res.status(201).json({ success: true, token });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// Get all tokens
export const getAllTokens = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1; // default to page 1
    const limit = 20;
    const skip = (page - 1) * limit;

    const tokens = await Token.find()
      .skip(skip)
      .limit(limit)
      .populate("userId", "userId")
      .sort({ createdAt: -1 }); // optional: sort by recent

    const total = await Token.countDocuments();

    res.json({
      success: true,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      tokens,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Get token by ID
export const getTokenById = async (req, res) => {
  try {
    const token = await Token.findById(req.params.id).populate("userId");
    if (!token)
      return res
        .status(404)
        .json({ success: false, message: "Token not found" });
    res.json({ success: true, token });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Update token
export const updateToken = async (req, res) => {
  try {
    const token = await Token.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    if (!token)
      return res
        .status(404)
        .json({ success: false, message: "Token not found" });
    res.json({ success: true, token });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// Delete token
export const deleteToken = async (req, res) => {
  try {
    const token = await Token.findByIdAndDelete(req.params.id);
    if (!token)
      return res
        .status(404)
        .json({ success: false, message: "Token not found" });
    res.json({ success: true, message: "Token deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// get token by usertype influencer
export const getFilteredTokens = async (req, res) => {
  try {
    const { filter = "all", page = 1 } = req.query;
    const limit = 20;
    const skip = (parseInt(page) - 1) * limit;

    let query = {};
    let tokens = [];
    let total = 0;

    if (filter === "top20") {
      // Get top 20 tokens by oneDayMarketCap
      tokens = await Token.find()
        .sort({ oneDayMarketCap: -1 })
        .limit(20)
        .populate("userId", " role _id"); // populate minimal fields

      return res.json({
        success: true,
        filter: "top20",
        tokens,
      });
    }

    if (filter === "influencers") {
      // Find users with role = INFLUENCER
      const influencers = await User.find({ role: "INFLUENCER" }).select("_id");
      const influencerIds = influencers.map((user) => user._id);

      query.userId = { $in: influencerIds };
    }

    // For "all" or "influencers"
    tokens = await Token.find(query)
      .skip(skip)
      .limit(limit)
      .populate("userId", "_id role token_name");

    total = await Token.countDocuments(query);

    res.json({
      success: true,
      filter,
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      tokens,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

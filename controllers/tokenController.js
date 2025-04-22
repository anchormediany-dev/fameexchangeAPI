import Token from "../models/Token.js";

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
      .populate("userId")
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

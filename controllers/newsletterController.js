// controllers/newsletterController.js
import crypto from "crypto";
import Newsletter from "../models/Newsletter.js";
import User from "../models/user.js";

const isValidEmail = (email = "") =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).toLowerCase());

// POST /api/newsletter/subscribe
export const subscribe = async (req, res) => {
  try {
    let { email, name, source } = req.body || {};
    email = String(email || "")
      .toLowerCase()
      .trim();

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ success: false, message: "Invalid email" });
    }

    // 1) Check if exists in User
    const existingUser = await User.findOne({ email }).select("_id email");
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Email already exists in users",
        where: "user",
      });
    }

    // 2) Check if already in Newsletter
    const existingSub = await Newsletter.findOne({ email }).select(
      "_id email status"
    );
    if (existingSub) {
      return res.status(409).json({
        success: false,
        message: "Email already subscribed in newsletter",
        where: "newsletter",
      });
    }

    const unsubscribeToken = crypto.randomBytes(24).toString("hex");
    const doc = await Newsletter.create({
      email,
      name,
      source,
      unsubscribeToken,
      status: "subscribed",
    });

    return res.status(201).json({
      success: true,
      message: "Subscribed successfully",
      data: { _id: doc._id, email: doc.email, status: doc.status },
    });
  } catch (err) {
    // Handle duplicate key race (unique index)
    if (err?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Email already subscribed in newsletter",
        where: "newsletter",
      });
    }
    console.error("Subscribe error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// POST /api/newsletter/unsubscribe
// Accepts either email or token. Token is preferred (link-friendly).
export const unsubscribe = async (req, res) => {
  try {
    let { email, token } = req.body || {};
    if (!email && !token) {
      return res.status(400).json({
        success: false,
        message: "Provide email or token to unsubscribe",
      });
    }

    const filter = token
      ? { unsubscribeToken: token }
      : {
          email: String(email || "")
            .toLowerCase()
            .trim(),
        };

    const sub = await Newsletter.findOne(filter);
    if (!sub) {
      return res
        .status(404)
        .json({ success: false, message: "Subscription not found" });
    }

    if (sub.status === "unsubscribed") {
      return res.status(200).json({
        success: true,
        message: "Already unsubscribed",
      });
    }

    sub.status = "unsubscribed";
    await sub.save();

    return res
      .status(200)
      .json({ success: true, message: "Unsubscribed successfully" });
  } catch (err) {
    console.error("Unsubscribe error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// GET /api/newsletter
export const list = async (req, res) => {
  try {
    const { status, q, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (q) filter.email = { $regex: q, $options: "i" };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [data, total] = await Promise.all([
      Newsletter.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Newsletter.countDocuments(filter),
    ]);

    res.json({
      success: true,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      data,
    });
  } catch (err) {
    console.error("List newsletter error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// DELETE /api/newsletter/:id
export const remove = async (req, res) => {
  try {
    const { id } = req.params;
    const del = await Newsletter.findByIdAndDelete(id);
    if (!del)
      return res
        .status(404)
        .json({ success: false, message: "Subscription not found" });

    return res.json({ success: true, message: "Deleted" });
  } catch (err) {
    console.error("Delete newsletter error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

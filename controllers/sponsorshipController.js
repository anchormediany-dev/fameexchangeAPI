import Sponsorship from "../models/sponsorshipModel.js";
import mongoose from "mongoose";
import User from "../models/user.js";

export const createSponsorship = async (req, res) => {
  try {
    const data = req.body; // from validateBody
    const userId = await User.findById({ _id: data.userId });
    if (!userId) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const sponsoredId = await User.findById({ _id: data.sponsoredId });
    if (!sponsoredId) {
      return res
        .status(404)
        .json({ success: false, error: "Sponsered User not found" });
    }

    const doc = await Sponsorship.create(data);
    return res.status(201).json({ success: true, data: doc });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
};

export const getSponsorshipById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: "Invalid id" });
    }
    const doc = await Sponsorship.findById(id)
      .populate("userId", "name email _id")
      .populate("sponsoredId", "name email _id");
    if (!doc)
      return res.status(404).json({ success: false, error: "Not found" });
    return res.json({ success: true, data: doc });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
};

export const listSponsorships = async (req, res) => {
  try {
    const { page, limit, userId, sponsoredId, from, to, sort, mine } =
      req.validatedQuery || {};

    const filter = {};

    // If logged-in user is a FAN, force only their sponsored records
    // (ignores any sponsoredById passed in the query).
    if (req.user?.userRole === "fan") {
      filter.sponsoredId = req.user._id;
    } else {
      // Otherwise respect incoming filters (admin/staff/others)
      if (sponsoredId) filter.sponsoredId = sponsoredId;
      if (userId) filter.userId = userId;
    }

    // Optional: allow any role to say "only my sponsored records"
    if (mine === "true" && req.user?._id) {
      filter.sponsoredId = req.user._id;
    }

    // Date range
    if (from || to) {
      filter.occurredAt = {};
      if (from) filter.occurredAt.$gte = from;
      if (to) filter.occurredAt.$lte = to;
    }

    // Sort
    const sortObj =
      sort === "oldest"
        ? { occurredAt: 1, _id: 1 }
        : { occurredAt: -1, _id: -1 }; // default recent

    const [items, total] = await Promise.all([
      Sponsorship.find(filter)
        .sort(sortObj)
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("userId", "name email _id images token_brand_name")
        .populate("sponsoredId", "name email _id images token_brand_name"),
      Sponsorship.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
};

export const updateSponsorship = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: "Invalid id" });
    }
    const updates = req.body; // from validateBody
    const userId = await User.findById({ _id: updates.userId });
    if (!userId) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const sponsoredById = await User.findById({ _id: updates.sponsoredById });
    if (!sponsoredById) {
      return res
        .status(404)
        .json({ success: false, error: "Sponsered User not found" });
    }
    const doc = await Sponsorship.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });
    if (!doc)
      return res.status(404).json({ success: false, error: "Not found" });
    return res.json({ success: true, data: doc });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
};

export const deleteSponsorship = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: "Invalid id" });
    }
    const doc = await Sponsorship.findByIdAndDelete(id);
    if (!doc)
      return res.status(404).json({ success: false, error: "Not found" });
    return res.json({ success: true, message: "Deleted", data: doc });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
};

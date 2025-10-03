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
    // ---- Authorize: FAN only ----
    const role = (req.user?.userRole || req.user?.role || "")
      .toString()
      .toUpperCase();
    if (role !== "FAN") {
      return res
        .status(403)
        .json({ success: false, error: "Forbidden: FAN only." });
    }

    // ---- Inputs (page + date only) ----
    const {
      page: qPage,
      limit: qLimit, // optional; defaults to 10
      from, // e.g. 2025-01-01
      to, // e.g. 2025-10-02
      sort, // optional: "oldest" | anything else -> recent
    } = req.validatedQuery || {};

    // ---- Safe pagination ----
    let page = parseInt(qPage, 10);
    let limit = parseInt(qLimit, 10);
    if (!Number.isFinite(page) || page < 1) page = 1;
    if (!Number.isFinite(limit) || limit <= 0) limit = 10; // default 10 per page
    const MAX_LIMIT = 100;
    if (limit > MAX_LIMIT) limit = MAX_LIMIT;

    const skipRaw = (page - 1) * limit;
    const skip = Number.isFinite(skipRaw) && skipRaw >= 0 ? skipRaw : 0;

    // ---- Filters (LOCKED to this FAN only) ----
    const filter = { userId: req.user._id };

    // Date range (optional)
    if (from || to) {
      filter.occurredAt = {};
      if (from) filter.occurredAt.$gte = new Date(from);
      if (to) filter.occurredAt.$lte = new Date(to);
    }

    // ---- Sort ----
    const sortObj =
      sort === "oldest"
        ? { occurredAt: 1, _id: 1 }
        : { occurredAt: -1, _id: -1 };

    // ---- Query ----
    const [items, total] = await Promise.all([
      Sponsorship.find(filter)
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        // userId is the FAN (caller); sponsoredId is the talent
        .populate("userId", "name email _id images token_brand_name role")
        .populate("sponsoredId", "name email _id images token_brand_name role"),
      Sponsorship.countDocuments(filter),
    ]);

    // ---- Response ----
    return res.json({
      success: true,
      data: items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
};

export const allListSponsorships = async (req, res) => {
  try {
    // --- Pagination (fixed 10 per page) ---
    let page = parseInt(req?.validatedQuery?.page, 10);
    if (Number.isNaN(page) || page < 1) page = 1;
    const limit = 10; // <= as requested: per page 10 records

    // --- Filters ---
    const {
      from,
      to,
      sort,
      mine,
      talentsScope = "filtered", // "filtered" | "page"
    } = req.validatedQuery || {};

    const filter = {};

    // Date range
    if (from || to) {
      filter.occurredAt = {};
      if (from) filter.occurredAt.$gte = new Date(from);
      if (to) filter.occurredAt.$lte = new Date(to);
    }

    // Sort
    const sortObj =
      sort === "oldest"
        ? { occurredAt: 1, _id: 1 }
        : { occurredAt: -1, _id: -1 };

    // --- Query paginated data + total ---
    const [items, total] = await Promise.all([
      Sponsorship.find(filter)
        .sort(sortObj)
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("userId", "name email _id images token_brand_name role")
        .populate("sponsoredId", "name email _id images token_brand_name role"),
      Sponsorship.countDocuments(filter),
    ]);

    // --- Build sponsoredTalents ---
    let sponsoredTalents = [];
    if (talentsScope === "filtered") {
      const counts = await Sponsorship.aggregate([
        { $match: filter },
        {
          $group: {
            _id: "$sponsoredId",
            count: { $sum: 1 },
            latestAt: { $max: "$occurredAt" },
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "user",
          },
        },
        { $unwind: "$user" },
        { $match: { "user.role": { $in: ["TALENT", "talent"] } } },
        {
          $project: {
            _id: 0,
            sponsoredId: "$user._id",
            name: "$user.name",
            email: "$user.email",
            images: "$user.images",
            token_brand_name: "$user.token_brand_name",
            role: "$user.role",
            count: 1,
            latestAt: 1,
          },
        },
        { $sort: { count: -1, latestAt: -1 } },
      ]);
      sponsoredTalents = counts;
    } else {
      // talentsScope === "page"
      const pageTalentIds = [
        ...new Set(
          items
            .map((it) =>
              typeof it.sponsoredId === "object" && it.sponsoredId
                ? it.sponsoredId._id?.toString()
                : it.sponsoredId?.toString()
            )
            .filter(Boolean)
        ),
      ];
      const pageCounts = items.reduce((acc, it) => {
        const key =
          (typeof it.sponsoredId === "object" &&
            it.sponsoredId?._id?.toString()) ||
          it.sponsoredId?.toString();
        if (!key) return acc;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      const talentUsers = await User.find({
        _id: { $in: pageTalentIds },
        role: { $in: ["TALENT", "talent"] },
      }).select("name email _id images token_brand_name role");

      sponsoredTalents = talentUsers
        .map((u) => ({
          sponsoredId: u._id,
          name: u.name,
          email: u.email,
          images: u.images,
          token_brand_name: u.token_brand_name,
          role: u.role,
          count: pageCounts[u._id.toString()] || 0,
        }))
        .sort((a, b) => b.count - a.count);
    }

    // --- Pagination metadata + links ---
    const pages = Math.max(1, Math.ceil(total / limit));
    const hasPrev = page > 1;
    const hasNext = page < pages;
    const prevPage = hasPrev ? page - 1 : null;
    const nextPage = hasNext ? page + 1 : null;

    // Build absolute next/prev links
    const buildLink = (p) => {
      if (!p) return null;
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const url = new URL(baseUrl + req.originalUrl.split("?")[0]);
      // Preserve existing query params EXCEPT page; re-apply from validatedQuery
      const params = new URLSearchParams(req.query || {});
      params.set("page", String(p));
      params.set("limit", String(limit)); // fixed page size
      url.search = params.toString();
      return url.toString();
    };

    const links = {
      self: buildLink(page),
      prev: buildLink(prevPage),
      next: buildLink(nextPage),
      first: buildLink(1),
      last: buildLink(pages),
    };

    return res.json({
      success: true,
      data: items,
      sponsoredTalents,
      pagination: {
        page,
        limit, // 10
        total, // total items
        pages, // total pages
        hasPrev,
        hasNext,
        prevPage,
        nextPage,
      },
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

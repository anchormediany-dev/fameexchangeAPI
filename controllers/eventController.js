import mongoose from "mongoose";
import Event from "../models/eventModel.js";
import User from "../models/user.js";
import { geocodeAddress } from "../utils/geocode.js";
import axios from "axios";
// CREATE
// export const createEvent = async (req, res) => {
//   try {
//     const {
//       datetime,
//       title,
//       summary,
//       details,
//       event_type,
//       status,
//       category,
//       location,
//       address,
//       phone,
//       website,
//       organizername,
//       regular_price,
//       discount_percent,
//       discount_codes,
//       event_coordinates,
//       is_featured,
//       prefrence,
//       // talent,
//     } = req.body;
//     // const event = new Event(req.body);
//     const missingFields = [];
//     if (!datetime) missingFields.push("datetime");
//     if (!title) missingFields.push("title");
//     if (!summary) missingFields.push("summary");
//     if (!details) missingFields.push("details");
//     if (!event_type) missingFields.push("event_type");
//     if (!status) missingFields.push("status");
//     if (!category) missingFields.push("category");
//     if (!location) missingFields.push("location");

//     if (missingFields.length > 0) {
//       return res.status(400).json({
//         success: false,
//         error: `Missing required fields: ${missingFields.join(", ")}`,
//       });
//     }
//     const LoginUser = req.user._id;
//     const user = await User.findById(req.user._id);
//     if (!user.role === "ADMIN") {
//       return res
//         .status(404)
//         .json({ success: false, error: "Admin Access Required" });
//     }
//     if (!user) {
//       return res.status(404).json({ success: false, error: "User not found" });
//     }

//     // ⏰ Check that datetime is today or in the future
//     const eventDate = new Date(datetime);
//     const today = new Date();
//     today.setHours(0, 0, 0, 0); // reset to start of day
//     const now = new Date();
//     // if (isNaN(eventDate.getTime())) {
//     //   return res
//     //     .status(400)
//     //     .json({ success: false, error: "Invalid datetime format" });
//     // }

//     // Compare full datetime (date + time)
//     if (eventDate.getTime() <= now.getTime()) {
//       return res.status(400).json({
//         success: false,
//         error:
//           "Event date and time must be in the future (not in the past or now)",
//       });
//     }

//     if (eventDate < today) {
//       return res.status(400).json({
//         success: false,
//         error: "Event date must be today or in the future",
//       });
//     }
//     // Parse JSON strings
//     let parsedDiscountCodes = [];
//     let talentData = [];
//     let parsedCoordinates = {};

//     if (discount_codes) {
//       try {
//         parsedDiscountCodes = JSON.parse(discount_codes);
//       } catch {
//         return res
//           .status(400)
//           .json({ success: false, error: "Invalid discount_codes format" });
//       }
//     }

//     if (event_coordinates) {
//       try {
//         parsedCoordinates = JSON.parse(event_coordinates);
//       } catch {
//         return res
//           .status(400)
//           .json({ success: false, error: "Invalid event_coordinates format" });
//       }
//     }

//     // ---- DROP THIS IN before creating the Event ----
//     let { talent } = req.body;

//     // If it's ["[\"id\",\"id2\"]"] -> unwrap & parse
//     if (
//       Array.isArray(talent) &&
//       talent.length === 1 &&
//       typeof talent[0] === "string"
//     ) {
//       const s = talent[0].trim();
//       if (s.startsWith("[") && s.endsWith("]")) {
//         try {
//           talent = JSON.parse(s);
//         } catch {
//           /* ignore */
//         }
//       }
//     }

//     // If it's a plain JSON string or CSV string
//     if (typeof talent === "string") {
//       const s = talent.trim();
//       if (s.startsWith("[") && s.endsWith("]")) {
//         try {
//           talent = JSON.parse(s);
//         } catch {
//           talent = s.split(",");
//         }
//       } else {
//         talent = s.split(",");
//       }
//     }

//     // Ensure array of clean strings, no duplicates
//     talent = (Array.isArray(talent) ? talent : [])
//       .map((id) => String(id).trim())
//       .filter(Boolean);
//     talent = [...new Set(talent)];
//     // Handle files
//     const logo = req.files?.logo?.[0]?.path || "";
//     const eventcover = req.files?.event_cover?.[0]?.path || "";
//     const eventimages =
//       Array.isArray(req.files?.event_images) &&
//       req.files.event_images.length > 0
//         ? req.files.event_images.map((file) => file.path)
//         : [];

//     // console.log("Event images:", eventimages);
//     // console.log("req.files?.event_images:", req.files?.event_images);

//     const event = new Event({
//       userId: user._id,
//       datetime,
//       addedby: LoginUser.role,
//       title,
//       talent: talent,
//       summary,
//       details,
//       event_type,
//       status,
//       category,
//       location,
//       address,
//       phone,
//       website,
//       organizername,
//       prefrence,
//       logo,
//       talent,
//       event_cover: eventcover,
//       event_images: eventimages,
//       is_featured,
//       regular_price,
//       discount_percent,
//       discount_codes: parsedDiscountCodes,
//       event_coordinates: parsedCoordinates,
//     });

//     const saved = await event.save();
//     res.status(201).json({ success: true, data: saved });
//   } catch (err) {
//     res.status(400).json({ success: false, error: err.message });
//   }
// };

export const createEvent = async (req, res) => {
  try {
    const {
      datetime,
      title,
      summary,
      details,
      event_type,
      status,
      category,
      location,
      address,
      phone,
      website,
      organizername,
      regular_price,
      discount_percent,
      discount_codes,
      event_coordinates,
      is_featured,
      prefrence,
    } = req.body;

    const missingFields = [];
    if (!datetime) missingFields.push("datetime");
    if (!title) missingFields.push("title");
    if (!summary) missingFields.push("summary");
    if (!details) missingFields.push("details");
    if (!event_type) missingFields.push("event_type");
    if (!status) missingFields.push("status");
    if (!category) missingFields.push("category");
    if (!location) missingFields.push("location"); // city is required

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    // ✅ Fix: Correct admin check
    if (user.role !== "ADMIN") {
      return res
        .status(403)
        .json({ success: false, error: "Admin Access Required" });
    }

    // ⏰ Date-time validation
    const eventDate = new Date(datetime);
    const now = new Date();
    if (isNaN(eventDate.getTime()) || eventDate.getTime() <= now.getTime()) {
      return res.status(400).json({
        success: false,
        error: "Event date/time must be a valid datetime in the future",
      });
    }

    // Parse JSON-ish inputs
    let parsedDiscountCodes = [];
    if (discount_codes) {
      try {
        parsedDiscountCodes = Array.isArray(discount_codes)
          ? discount_codes
          : JSON.parse(discount_codes);
      } catch {
        return res
          .status(400)
          .json({ success: false, error: "Invalid discount_codes format" });
      }
    }

    let parsedCoordinates = null;
    if (event_coordinates) {
      try {
        parsedCoordinates =
          typeof event_coordinates === "string"
            ? JSON.parse(event_coordinates)
            : event_coordinates;
      } catch {
        return res
          .status(400)
          .json({ success: false, error: "Invalid event_coordinates format" });
      }
    }

    // Handle talent (your original normalization kept)
    let { talent } = req.body;
    if (
      Array.isArray(talent) &&
      talent.length === 1 &&
      typeof talent[0] === "string"
    ) {
      const s = talent[0].trim();
      if (s.startsWith("[") && s.endsWith("]")) {
        try {
          talent = JSON.parse(s);
        } catch {
          /* ignore */
        }
      }
    }
    if (typeof talent === "string") {
      const s = talent.trim();
      if (s.startsWith("[") && s.endsWith("]")) {
        try {
          talent = JSON.parse(s);
        } catch {
          talent = s.split(",");
        }
      } else {
        talent = s.split(",");
      }
    }
    talent = (Array.isArray(talent) ? talent : [])
      .map((id) => String(id).trim())
      .filter(Boolean);
    talent = [...new Set(talent)];

    // Files
    const logo = req.files?.logo?.[0]?.path || "";
    const eventcover = req.files?.event_cover?.[0]?.path || "";
    const eventimages =
      Array.isArray(req.files?.event_images) &&
      req.files.event_images.length > 0
        ? req.files.event_images.map((file) => file.path)
        : [];

    // 🗺️ Auto-geocode if coordinates were not provided
    let computedCoords = parsedCoordinates;
    if (!computedCoords) {
      try {
        computedCoords = await geocodeAddress({
          address: address || "",
          city: location || "",
        });

        // console.log("computedCoords", computedCoords);
      } catch (geoErr) {
        return res.status(400).json({
          success: false,
          error: `Could not geocode address: ${geoErr.message}`,
        });
      }
    }

    const event = new Event({
      userId: user._id,
      addedby: user.role,
      datetime,
      title,
      talent,
      summary,
      details,
      event_type,
      status,
      category,
      location, // city
      address, // street
      phone,
      website,
      organizername,
      prefrence,
      logo,
      event_cover: eventcover,
      event_images: eventimages,
      is_featured,
      regular_price,
      discount_percent,
      discount_codes: parsedDiscountCodes,
      event_coordinates: computedCoords, // ← lat/lng + extras
    });

    const saved = await event.save();
    res.status(201).json({ success: true, data: saved });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

//  GET /events?page=1&limit=10
export const getAllEvents = async (req, res) => {
  try {
    // --- pagination inputs ---
    const rawPage = parseInt(req.query.page, 10);
    const rawLimit = parseInt(req.query.limit, 10);

    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
    // default 10, hard-cap to prevent abuse (tweak as you like)
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 50) : 10;
    const skip = (page - 1) * limit;

    // --- totals (for meta) ---
    const total = await Event.countDocuments({});
    const totalPages = Math.max(1, Math.ceil(total / limit));

    // --- query (latest first) ---
    const events = await Event.find({})
      .sort({ createdAt: -1 }) // newest first
      .skip(skip)
      .limit(limit)
      .lean();

    // --- shape preferences counts safely ---
    const data = events.map((event) => {
      const prefsArr = Array.isArray(event.prefrences) ? event.prefrences : [];
      const interested = prefsArr.filter(
        (p) => p?.prefrences === "interested"
      ).length;
      const notinterested = prefsArr.filter(
        (p) => p?.prefrences === "notinterested"
      ).length;
      const attending = prefsArr.filter(
        (p) => p?.prefrences === "attending"
      ).length;
      const live = prefsArr.filter((p) => p?.event_type === "live").length;
      const virtual = prefsArr.filter(
        (p) => p?.event_type === "virtual"
      ).length;

      return {
        ...event,
        prefrences: {
          ...event.prefrences, // keep original object fields if any
          interested,
          notinterested,
          attending,
          live,
          virtual,
        },
      };
    });

    return res.status(200).json({
      success: true,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasPrevPage: page > 1,
        hasNextPage: page < totalPages,
        prevPage: page > 1 ? page - 1 : null,
        nextPage: page < totalPages ? page + 1 : null,
      },
      data,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET ONE
export const getEventById = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate(
        "userId",
        "name KYC_Verified images biography representation token_brand_name talent selected_reps is_rep_have is_active role image email name"
        // "-password -__v -updatedAt -createdAt -isDeleted -is_over_18 -agreed_terms -is_verified -OTP_code -is_login_facebook -is_login_google -isAdmin -password"
      )
      .populate("talent", "email name role")
      .lean();
    if (!event)
      return res.status(404).json({ success: false, error: "Event not found" });

    // Ensure prefrences is always an array
    const prefs = Array.isArray(event.prefrences) ? event.prefrences : [];

    // ✅ Flat counts
    event.interested = prefs.filter(
      (p) => p.prefrence_Type === "interested"
    ).length;
    event.notinterested = prefs.filter(
      (p) => p.prefrence_Type === "notinterested"
    ).length;
    event.attending = prefs.filter(
      (p) => p.prefrence_Type === "attending"
    ).length;
    event.live = prefs.filter((p) => p.event_type === "live").length;
    event.virtual = prefs.filter((p) => p.event_type === "virtual").length;
    res.status(200).json({ success: true, data: event });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};
export const getEventUserById = async (req, res) => {
  console.log(req.user._id);
  const userId = req.user._id;
  try {
    const event = await Event.find({ userId })
      .sort({ createdAt: -1 })
      .populate(
        "userId",
        "name KYC_Verified images biography representation token_brand_name talent selected_reps is_rep_have is_active role image email name"
      )
      .lean();

    console.log(event);
    if (!event)
      return res.status(404).json({ success: false, error: "Event not found" });
    res.status(200).json({ success: true, data: event });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// UPDATE
export const updateEvent = async (req, res) => {
  try {
    const {
      datetime,
      title,
      summary,
      details,
      event_type,
      status,
      category,
      location,
      address,
      phone,
      website,
      organizername,
      regular_price,
      discount_percent,
      discount_codes,
      event_coordinates,
      is_featured,
    } = req.body;

    const eventId = req.params.id;
    const LoginUser = req.user._id;

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ success: false, error: "Event not found" });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    // ✅ Parse fields
    let parsedDiscountCodes = event.discount_codes;
    let parsedCoordinates = event.event_coordinates;

    if (discount_codes) {
      try {
        parsedDiscountCodes = JSON.parse(discount_codes);
      } catch {
        return res
          .status(400)
          .json({ success: false, error: "Invalid discount_codes format" });
      }
    }

    if (event_coordinates) {
      try {
        parsedCoordinates = JSON.parse(event_coordinates);
      } catch {
        return res
          .status(400)
          .json({ success: false, error: "Invalid event_coordinates format" });
      }
    }

    // ✅ Files
    const logo = req.files?.logo?.[0]?.path || event.logo;
    const eventcover = req.files?.event_cover?.[0]?.path || event.eventcover;
    const eventimages = req.files?.event_images?.length
      ? req.files.event_images.map((file) => file.path)
      : event.eventimages;

    // ✅ Update fields
    event.userId = req?.user?._id || event.userId;
    event.datetime = datetime || event.datetime;
    event.addedby = LoginUser.role || event.addedby;
    event.title = title || event.title;
    event.summary = summary || event.summary;
    event.details = details || event.details;
    event.event_type = event_type || event.event_type;
    event.status = status || event.status;
    event.category = category || event.category;
    event.location = location || event.location;
    event.address = address || event.address;
    event.phone = phone || event.phone;
    event.website = website || event.website;
    event.organizername = organizername || event.organizername;
    event.logo = logo;
    event.eventcover = eventcover;
    event.eventimages = eventimages;
    event.is_featured =
      is_featured !== undefined
        ? is_featured === "true" || is_featured === true
        : event.is_featured;
    event.regular_price = regular_price || event.regular_price;
    event.discount_percent = discount_percent || event.discount_percent;
    event.discount_codes = parsedDiscountCodes;
    event.event_coordinates = parsedCoordinates;

    const updated = await event.save();

    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    console.error("❌ Update error:", err);
    res.status(400).json({ success: false, error: err.message });
  }
};

//get featured events
export const getFeaturedUpcomingEvents = async (req, res) => {
  try {
    const now = new Date();

    const events = await Event.find({
      is_featured: true,
      datetime: { $gt: now },
      status: "active", // optional but usually preferred
    })
      .sort({ datetime: 1 }) // soonest first
      .limit(10); // optional: limit results

    return res.status(200).json({ success: true, data: events });
  } catch (error) {
    console.error("Error fetching featured events:", error);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
};

// DELETE
export const deleteEvent = async (req, res) => {
  try {
    const deleted = await Event.findByIdAndDelete(req.params.id);
    if (!deleted)
      return res.status(404).json({ success: false, error: "Event not found" });
    res.status(200).json({ success: true, message: "Event deleted" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Searched Events

const toBool = (v, def = false) =>
  typeof v === "string" ? v.toLowerCase() === "true" : v ?? def;

const escapeRegex = (str = "") => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getMonthRange = (month, year) => {
  // month: 1-12
  const y = Number(year);
  const m = Number(month) - 1; // JS Date month is 0-11
  const start = new Date(y, m, 1, 0, 0, 0, 0);
  const end = new Date(y, m + 1, 1, 0, 0, 0, 0); // exclusive upper bound
  return { start, end };
};

export const getMonthlyEvents = async (req, res) => {
  try {
    const now = new Date();
    const {
      month = (now.getMonth() + 1).toString(), // 1..12
      year = now.getFullYear().toString(),
      q,
      withinMonth = "false",
      status,
      featured,
    } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (featured === "true") filter.is_featured = true;
    if (featured === "false") filter.is_featured = { $in: [false, null] };

    const { start, end } = getMonthRange(month, year);
    let applyMonth = true;

    if (q && q.trim()) {
      applyMonth = toBool(withinMonth, false);
      const rx = new RegExp(escapeRegex(q.trim()), "i");
      filter.title = rx;
    }

    if (applyMonth) {
      filter.datetime = { $gte: start, $lt: end };
    }

    const pipeline = [
      { $match: filter },
      { $sort: { datetime: 1 } },

      // ✅ FIXED LOOKUP: use let + pipeline (NO localField/foreignField)
      {
        $lookup: {
          from: "users",
          let: { uid: "$userId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  // If userId is already an ObjectId, this still works.
                  // If it's a string, convert to ObjectId for comparison.
                  $eq: [
                    "$_id",
                    {
                      $cond: [
                        { $eq: [{ $type: "$$uid" }, "objectId"] },
                        "$$uid",
                        { $toObjectId: "$$uid" },
                      ],
                    },
                  ],
                },
              },
            },
            {
              $project: {
                name: 1,
                KYC_Verified: 1,
                images: 1,
                biography: 1,
                representation: 1,
                token_brand_name: 1,
                talent: 1,
                selected_reps: 1,
                is_rep_have: 1,
                is_active: 1,
                role: 1,
                image: 1,
                email: 1,
              },
            },
          ],
          as: "userId",
        },
      },
      { $unwind: { path: "$userId", preserveNullAndEmptyArrays: true } },

      // Ensure prefrences is always an array
      { $set: { prefrences: { $ifNull: ["$prefrences", []] } } },

      // Flat counts
      {
        $addFields: {
          interested: {
            $size: {
              $filter: {
                input: "$prefrences",
                as: "p",
                cond: { $eq: ["$$p.prefrence_Type", "interested"] },
              },
            },
          },
          notinterested: {
            $size: {
              $filter: {
                input: "$prefrences",
                as: "p",
                cond: { $eq: ["$$p.prefrence_Type", "notinterested"] },
              },
            },
          },
          attending: {
            $size: {
              $filter: {
                input: "$prefrences",
                as: "p",
                cond: { $eq: ["$$p.prefrence_Type", "attending"] },
              },
            },
          },
          live: {
            $size: {
              $filter: {
                input: "$prefrences",
                as: "p",
                cond: { $eq: ["$$p.event_type", "live"] },
              },
            },
          },
          virtual: {
            $size: {
              $filter: {
                input: "$prefrences",
                as: "p",
                cond: { $eq: ["$$p.event_type", "virtual"] },
              },
            },
          },
        },
      },
    ];

    const events = await Event.aggregate(pipeline);

    return res.status(200).json({
      success: true,
      month: applyMonth ? Number(month) : null,
      year: applyMonth ? Number(year) : null,
      total: events.length,
      data: events,
    });
  } catch (error) {
    console.error("Error fetching monthly/search events:", error);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error", error });
  }
};

export const setEventPreference = async (req, res) => {
  try {
    const { eventId } = req.params;

    // allow body userId or authenticated user
    const bodyUserId = req.body.userId || req?.user?._id;
    const { prefrence_Type, event_type } = req.body;

    // basic validations
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ success: false, error: "Invalid eventId" });
    }
    if (!mongoose.Types.ObjectId.isValid(bodyUserId)) {
      return res.status(400).json({ success: false, error: "Invalid userId" });
    }

    const allowedPref = ["interested", "notinterested", "attending"];
    const allowedEventType = ["live", "virtual"];

    if (!allowedPref.includes(prefrence_Type)) {
      return res.status(400).json({
        success: false,
        error: `prefrence_Type must be one of: ${allowedPref.join(", ")}`,
      });
    }

    if (!allowedEventType.includes(event_type)) {
      return res.status(400).json({
        success: false,
        error: `event_type must be one of: ${allowedEventType.join(", ")}`,
      });
    }

    // Ensure event & user exist (optional but good practice)
    const [event, user] = await Promise.all([
      Event.findById(eventId).select("_id"),
      User.findById(bodyUserId).select("_id"),
    ]);

    if (!event) {
      return res.status(404).json({ success: false, error: "Event not found" });
    }
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    // 1) Try to update existing preference for this user
    const updateExisting = await Event.updateOne(
      { _id: eventId, "prefrences.users": bodyUserId },
      {
        $set: {
          "prefrences.$.prefrence_Type": prefrence_Type,
          "prefrences.$.event_type": event_type,
        },
      }
    );

    if (updateExisting.modifiedCount === 0) {
      // 2) If no existing, push a new preference
      await Event.updateOne(
        { _id: eventId },
        {
          $push: {
            prefrences: {
              users: bodyUserId,
              prefrence_Type,
              event_type,
            },
          },
        }
      );
    }

    // Return the updated preferences (lightweight)
    const updated = await Event.findById(eventId)
      .select("prefrences")
      .populate("prefrences.users", "name email role image");

    return res.status(200).json({
      success: true,
      message: "Preference saved",
      data: updated?.prefrences || [],
    });
  } catch (err) {
    console.error("setEventPreference error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

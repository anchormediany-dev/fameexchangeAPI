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

const isId = (v) => mongoose.Types.ObjectId.isValid(v);
const norm = (s) => String(s || "").trim();
const key = (s) => norm(s).toLowerCase();

function assert(cond, msg = "Bad Request", status = 400) {
  if (!cond) {
    const e = new Error(msg);
    e.status = status;
    throw e;
  }
}

// ---- helpers ----
const toNum = (v) => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const toStrArr = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  const s = String(v).trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed)
      ? parsed.map((x) => String(x).trim()).filter(Boolean)
      : [s];
  } catch {
    return s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }
};

// Accepts:
// - Proper JSON: [{"discount_percent":10,"discount_codes":"SUMMER25"}]
// - Single quotes: [{'discount_percent':10,'discount_codes':'SUMMER25'}]
// - Unquoted keys: [{discount_percent:10, discount_codes:"SUMMER25"}]
// - Trailing commas
function parseJsonArrayLenient(input) {
  if (Array.isArray(input)) return input;
  let s = String(input || "").trim();
  if (!s) return [];

  // make it JSON-ish
  s = s
    .replace(/([{,]\s*)([A-Za-z_]\w*)(\s*:)/g, '$1"$2"$3') // quote bare keys
    .replace(/'/g, '"') // single → double quotes
    .replace(/,\s*(}|\])/g, "$1"); // remove trailing commas

  const parsed = JSON.parse(s); // may still throw; let caller catch
  if (!Array.isArray(parsed)) throw new Error("discounts must be an array");
  return parsed;
}

function toDiscounts(body) {
  // New preferred shape: `discounts` (array or stringified array)
  if (body.discounts != null) {
    let arr;
    try {
      arr = parseJsonArrayLenient(body.discounts);
    } catch (e) {
      // throw to outer try/catch so you respond 400 instead of crashing
      const ex = new Error(
        'Invalid `discounts`. Send an array like [{"discount_percent":10,"discount_codes":"SUMMER25"}]. ' +
          "Single quotes/unquoted keys/trailing commas are okay, but it must be an array."
      );
      ex.status = 400;
      throw ex;
    }

    return arr
      .map((d) => ({
        discount_percent: toNum(d?.discount_percent),
        discount_codes: String(d?.discount_codes ?? "").trim(),
      }))
      .filter(
        (d) =>
          Number.isFinite(d.discount_percent) &&
          d.discount_percent >= 0 &&
          d.discount_percent <= 100 &&
          !!d.discount_codes
      );
  }

  // Legacy inputs: discount_percent + discount_codes (csv/json/array)
  const p = toNum(body.discount_percent);
  const codes = toStrArr(body.discount_codes);
  return Number.isFinite(p) && p >= 0 && p <= 100 && codes.length
    ? codes.map((code) => ({ discount_percent: p, discount_codes: code }))
    : [];
}

// coordinate validators
function isValidLat(v) {
  return typeof v === "number" && Number.isFinite(v) && v >= -90 && v <= 90;
}
function isValidLng(v) {
  return typeof v === "number" && Number.isFinite(v) && v >= -180 && v <= 180;
}

export const createEvent = async (req, res) => {
  try {
    // auth
    const user = await User.findById(req.user._id);
    if (!user || user.role !== "ADMIN")
      return res
        .status(403)
        .json({ success: false, error: "Admin Access Required" });

    // required
    const {
      datetime,
      title,
      summary,
      details,
      status,
      category,
      location,
      event_type,
    } = req.body;
    const missing = [
      "datetime",
      "title",
      "summary",
      "details",
      "status",
      "category",
      "location",
    ].filter((k) => !req.body[k]);
    if (missing.length)
      return res
        .status(400)
        .json({ success: false, error: `Missing: ${missing.join(", ")}` });

    // datetime (must be future, TZ-aware string recommended)
    const when = new Date(datetime);
    if (Number.isNaN(when.getTime()) || when <= new Date())
      return res.status(400).json({
        success: false,
        error:
          "Event datetime must be a valid future time (ISO 8601 with timezone recommended)",
      });

    // files (optional) — multer-s3 sets .location to the full public URL
    const logo = req.files?.logo?.[0]?.location;
    const event_cover = req.files?.event_cover?.[0]?.location;
    const event_images = (req.files?.event_images || []).map((f) => f.location);

    // ------------------ COORDINATES LOGIC (do not skip) ------------------

    // 1) Parse incoming `event_coordinates` if provided
    let parsedCoordinates = null;
    if (req.body.event_coordinates) {
      try {
        parsedCoordinates =
          typeof req.body.event_coordinates === "string"
            ? JSON.parse(req.body.event_coordinates)
            : req.body.event_coordinates;
      } catch {
        return res
          .status(400)
          .json({ success: false, error: "Invalid event_coordinates format" });
      }
    }

    // 2) Auto-geocode if coordinates not provided
    let computedCoords = parsedCoordinates;
    if (!computedCoords) {
      try {
        computedCoords = await geocodeAddress({
          address: req.body.address || "",
          city: location || "",
        });
        // expected shape: { lat: number, lng: number }
      } catch (geoErr) {
        return res.status(400).json({
          success: false,
          error: `Could not geocode address: ${geoErr.message}`,
        });
      }
    }

    // 3) Normalize and validate numeric lat/lng
    const coords = {
      lat: Number(computedCoords?.lat),
      lng: Number(computedCoords?.lng),
    };
    if (!isValidLat(coords.lat) || !isValidLng(coords.lng)) {
      return res.status(400).json({
        success: false,
        error:
          "Invalid coordinates: require numeric lat (-90..90) and lng (-180..180)",
      });
    }

    // 4) Prepare both fields:
    // - event_coordinates: {lat, lng, ...extras if you want}
    // - geo: GeoJSON Point with [lng, lat]
    const event_coordinates = {
      ...computedCoords, // keep any extras from geocoder if present
      lat: coords.lat,
      lng: coords.lng,
    };
    const geo = {
      type: "Point",
      coordinates: [coords.lng, coords.lat], // always [lng, lat]
    };

    // normalize fields to schema
    const doc = {
      userId: user._id,
      datetime: when,

      title,
      summary,
      details,

      // NOTE: top-level event_type is NOT in schema; only inside prefrences items.
      status,
      category,
      location,
      address: req.body.address,
      phone: req.body.phone,
      website: req.body.website,

      organizer_name: req.body.organizername || req.body.organizer_name,

      logo,
      event_cover,
      event_images,

      is_featured:
        req.body.is_featured === "true"
          ? true
          : req.body.is_featured === "false"
          ? false
          : !!req.body.is_featured,

      // numbers
      price: toNum(req.body.price),
      no_of_tickets: toNum(req.body.no_of_tickets),
      totalSoldTickets: toNum(req.body.totalSoldTickets),
      is_free:
        req.body.is_free === "true"
          ? true
          : req.body.is_free === "false"
          ? false
          : !!req.body.is_free,

      // discounts array in schema shape
      discount: toDiscounts(req.body),

      // purchased_url must be array of strings
      purchased_url: toStrArr(req.body.purchased_url),

      // coordinates (always set, because we resolved them above)
      event_coordinates,
      geo,
    };

    // // set GeoJSON if coords provided
    // if (
    //   doc.event_coordinates?.lat != null &&
    //   doc.event_coordinates?.lng != null
    // ) {
    //   const { lat, lng } = doc.event_coordinates;
    //   doc.geo = { type: "Point", coordinates: [Number(lng), Number(lat)] };
    // }

    // optional: talent ids (array)
    if (req.body.talent) {
      const t = Array.isArray(req.body.talent)
        ? req.body.talent
        : req.body.talent.startsWith("[")
        ? JSON.parse(req.body.talent)
        : String(req.body.talent).split(",");
      doc.talent = [...new Set(t.map((x) => String(x).trim()).filter(Boolean))];
    }
    if (req.body.event_type) {
      // --- event_type: parse & validate ---
      const ALLOWED = new Set(["live", "virtual"]);
      const rawET = req.body.event_type;

      let etArr = [];
      if (Array.isArray(rawET)) {
        const joined = rawET.join("").trim(); // handles ['["live"', '"virtual"]']
        etArr =
          joined.startsWith("[") && joined.endsWith("]")
            ? JSON.parse(joined)
            : rawET;
      } else if (typeof rawET === "string") {
        const s = rawET.trim();
        etArr =
          s.startsWith("[") && s.endsWith("]") ? JSON.parse(s) : s.split(",");
      }

      const eventType = Array.from(
        new Set(
          (etArr || [])
            .map((x) =>
              String(x)
                .replace(/^\[|\]$/g, "")
                .replace(/"/g, "")
                .trim()
                .toLowerCase()
            )
            .filter(Boolean)
        )
      );

      if (!eventType.length || eventType.some((v) => !ALLOWED.has(v))) {
        return res.status(400).json({
          success: false,
          error: 'event_type must be "live" or "virtual"',
        });
      }

      // --- prefrences: always build & ensure at least one row ---
      let prefrences = [];
      try {
        const rawPrefs = req.body.prefrences;
        const arr = Array.isArray(rawPrefs)
          ? rawPrefs
          : rawPrefs
          ? JSON.parse(rawPrefs) // expects [{users, prefrence_Type}, ...]
          : [];

        prefrences = arr.map((p) => ({
          users: p.users, // must be a valid ObjectId
          prefrence_Type: p.prefrence_Type || "",
          event_type: eventType, // << required by your sub-schema
        }));
      } catch (e) {
        // ignore and fallback below
      }

      // Fallback/default if empty or missing
      if (!Array.isArray(prefrences) || prefrences.length === 0) {
        prefrences = [
          {
            users: user._id,
            prefrence_Type: "",
            event_type: eventType,
          },
        ];
      }

      // attach before saving
      doc.prefrences = prefrences;
    }

    // only pass defined keys to avoid saving undefined
    const cleanDoc = Object.fromEntries(
      Object.entries(doc).filter(([, v]) => v !== undefined)
    );

    const saved = await Event.create(cleanDoc);
    return res.status(201).json({ success: true, data: saved });
  } catch (err) {
    console.log(err);
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
      .populate("talent", "name role images")
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
  const userId = req.user._id;
  try {
    const event = await Event.find({ userId })
      .sort({ createdAt: -1 })
      .populate(
        "userId",
        "name KYC_Verified images biography representation token_brand_name talent selected_reps is_rep_have is_active role image email name"
      )
      .lean();

    // console.log(event);
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
      talent,
      details,
      event_type,
      status,
      category,
      location,
      address,
      phone,
      website,
      organizername,
      purchased_url,
      discount_percent,
      discount_codes,
      event_coordinates,
      is_featured,
      price,
      is_free,
      no_of_tickets,
      totalSoldTickets,
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

    let parsedPurchaseUrl = null;
    if (purchased_url) {
      parsedPurchaseUrl = JSON.parse(purchased_url);
    }

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

    // ✅ Files — multer-s3 sets .location to the full public URL
    const logo = req.files?.logo?.[0]?.location || event.logo;
    const eventcover = req.files?.event_cover?.[0]?.location || event.eventcover;
    const eventimages = req.files?.event_images?.length
      ? req.files.event_images.map((file) => file.location)
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

    event.discount_percent = discount_percent || event.discount_percent;
    event.discount_codes = parsedDiscountCodes;
    event.event_coordinates = parsedCoordinates;
    event.no_of_tickets = no_of_tickets;
    event.price = price;
    event.is_free = is_free;
    event.purchased_url = parsedPurchaseUrl;
    event.totalSoldTickets = totalSoldTickets;
    event.talent = talent;

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

/**
 * DELETE /:eventId/discounts/:discountId?
 * Query alternative: ?code=SUMMER2025
 */
export async function deleteDiscountByIdOrCode(req, res, next) {
  try {
    const { eventId, discountId } = req.params;
    const queryCode = req.query.code;

    assert(isId(eventId), "Invalid eventId");
    // await mustBeAdmin(req.user?._id);

    assert(
      discountId || queryCode,
      "Provide :discountId or ?code= to select a discount"
    );

    const match =
      discountId && isId(discountId)
        ? { _id: eventId, "discounts._id": discountId }
        : { _id: eventId };

    // If deleting by code, we’ll use $pull with case-insensitive match via JS (Mongoose) rather than Mongo regex to keep it simple/portable.
    const event = await Event.findById(eventId);
    assert(event, "Event not found", 404);

    const before = event.discount?.length || 0;

    if (discountId && isId(discountId)) {
      event.discount = (event.discount || []).filter(
        (d) => String(d._id) !== String(discountId)
      );
    } else {
      const key = normCodeKey(queryCode);
      event.discount = (event.discount || []).filter(
        (d) => normCodeKey(d.discount_code ?? d.discount_codes) !== key
      );
    }

    const after = event.discount.length;
    assert(after < before, "Discount not found", 404);

    await event.save();
    return res.json({
      success: true,
      removed: before - after,
      discount: event.discount,
    });
  } catch (e) {
    next(e);
  }
}

//update discount
export async function updateDiscountPercent(req, res, next) {
  try {
    const { eventId, discountId } = req.params;
    const code = req.query.code; // optional alternative to :discountId
    assert(isId(eventId), "Invalid eventId");

    const pct = Number(req.body?.discount_percent);
    assert(
      Number.isFinite(pct) && pct >= 0 && pct <= 100,
      "discount_percent must be 0..100"
    );

    // ---- Path A: update by discount _id with positional operator ----
    if (discountId && isId(discountId)) {
      const upd = await Event.updateOne(
        { _id: eventId, "discount._id": discountId },
        { $set: { "discount.$.discount_percent": pct } }
      );
      assert(upd.matchedCount === 1, "Discount not found", 404);

      const updated = await Event.findById(eventId, { discount: 1 }).lean();
      const item = updated.discount.find(
        (d) => String(d._id) === String(discountId)
      );
      return res.json({
        success: true,
        discount: item,
        discounts: updated.discount,
      });
    }

    // ---- Path B: update by code (?code=) case-insensitive ----
    assert(code, "Provide :discountId or ?code=");
    const event = await Event.findById(eventId);
    assert(event, "Event not found", 404);

    const idx = (event.discount || []).findIndex(
      (d) => normKey(d.discount_code ?? d.discount_codes) === normKey(code)
    );
    assert(idx >= 0, "Discount not found", 404);

    // Only update the percent; do NOT touch the code
    event.discount[idx].discount_percent = pct;
    await event.save();

    return res.json({
      success: true,
      discount: event.discount[idx],
      discounts: event.discount,
    });
  } catch (e) {
    next(e);
  }
}

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
      // Match across the fields a user might intuitively search by.
      filter.$or = [
        { title: rx },
        { details: rx },
        { location: rx },
        { address: rx },
        { category: rx },
        { event_type: rx },
        { website: rx },
        { talent: rx },
      ];
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

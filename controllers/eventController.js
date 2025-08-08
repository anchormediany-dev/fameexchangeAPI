import Event from "../models/eventModel.js";
import User from "../models/user.js";

// CREATE
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
    // const event = new Event(req.body);

    const missingFields = [];
    if (!datetime) missingFields.push("datetime");
    if (!title) missingFields.push("title");
    if (!summary) missingFields.push("summary");
    if (!details) missingFields.push("details");
    if (!event_type) missingFields.push("event_type");
    if (!status) missingFields.push("status");
    if (!category) missingFields.push("category");
    if (!location) missingFields.push("location");

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }
    const LoginUser = req.user._id;
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    // ⏰ Check that datetime is today or in the future
    const eventDate = new Date(datetime);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // reset to start of day
    const now = new Date();
    if (isNaN(eventDate.getTime())) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid datetime format" });
    }

    // Compare full datetime (date + time)
    if (eventDate.getTime() <= now.getTime()) {
      return res.status(400).json({
        success: false,
        error:
          "Event date and time must be in the future (not in the past or now)",
      });
    }

    if (eventDate < today) {
      return res.status(400).json({
        success: false,
        error: "Event date must be today or in the future",
      });
    }
    // Parse JSON strings
    let parsedDiscountCodes = [];
    let parsedCoordinates = {};

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

    // Handle files
    const logo = req.files?.logo?.[0]?.path || "";
    const eventcover = req.files?.event_cover?.[0]?.path || "";
    const eventimages =
      Array.isArray(req.files?.event_images) &&
      req.files.event_images.length > 0
        ? req.files.event_images.map((file) => file.path)
        : [];

    // console.log("Event images:", eventimages);
    // console.log("req.files?.event_images:", req.files?.event_images);

    const event = new Event({
      userId: user._id,
      datetime,
      addedby: LoginUser.role,
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
      prefrence,
      logo,
      event_cover: eventcover,
      event_images: eventimages,
      is_featured,
      regular_price,
      discount_percent,
      discount_codes: parsedDiscountCodes,
      event_coordinates: parsedCoordinates,
    });

    const saved = await event.save();
    res.status(201).json({ success: true, data: saved });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// GET ALL
export const getAllEvents = async (req, res) => {
  try {
    const events = await Event.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: events });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET ONE
export const getEventById = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id).populate(
      "userId",
      "name KYC_Verified images biography representation token_brand_name talent selected_reps is_rep_have is_active role image email name"
      // "-password -__v -updatedAt -createdAt -isDeleted -is_over_18 -agreed_terms -is_verified -OTP_code -is_login_facebook -is_login_google -isAdmin -password"
    );
    if (!event)
      return res.status(404).json({ success: false, error: "Event not found" });
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

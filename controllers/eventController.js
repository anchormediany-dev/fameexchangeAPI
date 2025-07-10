import Event from "../models/EventModel.js";
import User from "../models/user.js";

// CREATE
export const createEvent = async (req, res) => {
  try {
    const {
      userId,
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
    // const event = new Event(req.body);
    const LoginUser = req.user._id;
    const user = await User.findById(req.body.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
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

    console.log("Event images:", eventimages);
    // console.log("req.files?.event_images:", req.files?.event_images);

    const event = new Event({
      userId,
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
    const event = await Event.findById(req.params.id);
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
    const updated = await Event.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    if (!updated)
      return res.status(404).json({ success: false, error: "Event not found" });
    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
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

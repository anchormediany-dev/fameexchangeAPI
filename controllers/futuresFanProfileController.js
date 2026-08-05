import FuturesFanProfile from "../models/futuresFanProfileModel.js";

// No qualification gate — any logged-in FameExchange user can become a
// Fame Futures fan.

// GET /api/futures-hub/fan-profile/me
export const getMyFanProfile = async (req, res) => {
  try {
    const profile = await FuturesFanProfile.findOne({ userId: req.user._id }).lean();
    res.json({ success: true, data: profile });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// POST /api/futures-hub/fan-profile
export const createMyFanProfile = async (req, res) => {
  try {
    const existing = await FuturesFanProfile.findOne({ userId: req.user._id });
    if (existing) {
      return res.status(409).json({ success: false, message: "Profile already exists" });
    }
    const { display_name, talentId, avatar_url } = req.body;
    const created = await FuturesFanProfile.create({
      userId: req.user._id,
      display_name: display_name || req.user.name,
      talentId: talentId || null,
      avatar_url: avatar_url || null,
    });
    res.status(201).json({ success: true, data: created });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

// PUT /api/futures-hub/fan-profile/me
export const updateMyFanProfile = async (req, res) => {
  try {
    const body = { ...req.body };
    delete body._id;
    delete body.userId;
    const updated = await FuturesFanProfile.findOneAndUpdate(
      { userId: req.user._id },
      body,
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: updated });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

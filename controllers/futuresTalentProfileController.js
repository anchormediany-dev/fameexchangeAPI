import Talent from "../models/talentModel.js";
import FuturesTalentProfile from "../models/futuresTalentProfileModel.js";

// Qualification gate for Phase 2 (per product decision): any User with an
// active Talent record — futures tier or tradeable, doesn't matter — can
// create a Fame Futures profile. This is deliberately NOT "futures tier
// only": Fame Futures is a general creator-growth tool, not gated to
// pre-graduation talents specifically.
async function findQualifyingTalent(userId) {
  return Talent.findOne({ userId, status: "active" }).lean();
}

// GET /api/futures-hub/talent-profile/me
export const getMyTalentProfile = async (req, res) => {
  try {
    const profile = await FuturesTalentProfile.findOne({ userId: req.user._id }).lean();
    const qualifyingTalent = await findQualifyingTalent(req.user._id);
    res.json({
      success: true,
      data: profile,
      qualifies: Boolean(qualifyingTalent),
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /api/futures-hub/talent-profile/:userId — public view for fans browsing.
export const getTalentProfile = async (req, res) => {
  try {
    const profile = await FuturesTalentProfile.findOne({ userId: req.params.userId }).lean();
    if (!profile) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: profile });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// POST /api/futures-hub/talent-profile — create the caller's own profile.
export const createMyTalentProfile = async (req, res) => {
  try {
    const existing = await FuturesTalentProfile.findOne({ userId: req.user._id });
    if (existing) {
      return res.status(409).json({ success: false, message: "Profile already exists" });
    }

    const qualifyingTalent = await findQualifyingTalent(req.user._id);
    if (!qualifyingTalent) {
      return res.status(403).json({
        success: false,
        message: "Only approved talents can create a Fame Futures profile. Apply as talent first.",
      });
    }

    const { stage_name, niche, bio, platforms } = req.body;
    const created = await FuturesTalentProfile.create({
      userId: req.user._id,
      // Sensible defaults pulled from the existing Talent record — the
      // caller can override any of these in the same request.
      stage_name: stage_name || qualifyingTalent.name,
      niche: niche || "",
      bio: bio || qualifyingTalent.description || "",
      platforms: Array.isArray(platforms) ? platforms : [],
      total_followers: 0,
    });
    res.status(201).json({ success: true, data: created });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

// PUT /api/futures-hub/talent-profile/me — update the caller's own profile.
export const updateMyTalentProfile = async (req, res) => {
  try {
    const body = { ...req.body };
    delete body._id;
    delete body.userId;
    const updated = await FuturesTalentProfile.findOneAndUpdate(
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

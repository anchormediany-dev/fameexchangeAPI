import { applyToBeTalent } from "../services/talentApplicationService.js";

// POST /api/talents/apply — auth required
export const apply = async (req, res) => {
  try {
    const result = await applyToBeTalent(req.user);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

import {
  QUALIFICATION_THRESHOLDS,
  SINGLE_PLATFORM_QUALIFICATION,
} from "../config/famescoreConfig.js";

// GET /api/famescore/thresholds — public. Exposes the qualification rules
// so the frontend can show a user exactly what's required, without ever
// hardcoding these numbers client-side (they'd drift from the real backend
// values the moment either changes).
export const getThresholds = (req, res) => {
  res.json({
    success: true,
    thresholds: QUALIFICATION_THRESHOLDS,
    singlePlatformThresholds: SINGLE_PLATFORM_QUALIFICATION,
  });
};

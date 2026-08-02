import {
  QUALIFICATION_THRESHOLDS,
  SINGLE_PLATFORM_QUALIFICATION,
  MATURE_ACCOUNT_AGE_MONTHS,
  NEW_ACCOUNT_GROWTH_FLOOR,
  MATURE_ACCOUNT_GROWTH_FLOOR,
  MEGA_ACCOUNT_THRESHOLD,
  MEGA_ACCOUNT_ABSOLUTE_GROWTH_FLOOR,
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
    growthTiering: {
      matureAccountAgeMonths: MATURE_ACCOUNT_AGE_MONTHS,
      newAccountGrowthFloor: NEW_ACCOUNT_GROWTH_FLOOR,
      matureAccountGrowthFloor: MATURE_ACCOUNT_GROWTH_FLOOR,
      megaAccountThreshold: MEGA_ACCOUNT_THRESHOLD,
      megaAccountAbsoluteGrowthFloor: MEGA_ACCOUNT_ABSOLUTE_GROWTH_FLOOR,
    },
  });
};

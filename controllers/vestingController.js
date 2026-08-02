import { grantBrandAmbassadorBonusUnlock } from "../services/vestingService.js";

// POST /api/admin/talents/:id/brand-ambassador-bonus-unlock
export const grantBrandAmbassadorBonus = async (req, res) => {
  try {
    const { schedule, bonusAmount } = await grantBrandAmbassadorBonusUnlock(
      req.params.id,
      req.user._id
    );
    res.json({
      success: true,
      bonus_shares_unlocked: bonusAmount,
      shares_unlocked: schedule.shares_unlocked,
      shares_locked: schedule.shares_locked,
    });
  } catch (error) {
    console.error("Error granting brand ambassador bonus unlock:", error);
    res.status(400).json({ success: false, message: error.message });
  }
};

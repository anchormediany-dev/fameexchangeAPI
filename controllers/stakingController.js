import {
  createStakePosition,
  unstakeShares,
  getUserStakes,
  getTalentStakeStats,
} from "../services/stakingService.js";
import DividendPayout from "../models/dividendPayoutModel.js";
import { createStakeSchema } from "../validators/trading.js";

// POST /api/staking/stake
export const createStake = async (req, res) => {
  try {
    const data = createStakeSchema.parse(req.body);
    const result = await createStakePosition(req.user._id, data.talent_id, data.amount, data.lock_period_days);
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    const error = err.errors?.[0]?.message || err.message;
    res.status(400).json({ success: false, message: error });
  }
};

// POST /api/staking/:id/unstake
export const unstake = async (req, res) => {
  try {
    const result = await unstakeShares(req.params.id, req.user._id);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// GET /api/staking/my-stakes
export const getMyStakes = async (req, res) => {
  try {
    const stakes = await getUserStakes(req.user._id);
    res.json({ success: true, stakes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/staking/talent/:talentId/stats  (public market data)
export const getTalentStats = async (req, res) => {
  try {
    const stats = await getTalentStakeStats(req.params.talentId);
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/staking/my-dividends
export const getMyDividends = async (req, res) => {
  try {
    const payouts = await DividendPayout.find({ user_id: req.user._id })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, payouts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

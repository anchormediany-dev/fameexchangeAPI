import Wallet from "../models/walletModel.js";
import WalletTransaction from "../models/walletTransactionModel.js";
import { getUserPnlSummary } from "../services/tradingService.js";
import mongoose from "mongoose";

const D128 = (v) => mongoose.Types.Decimal128.fromString(String(v));

// GET /api/wallet
export const getWallet = async (req, res) => {
  try {
    let wallet = await Wallet.findOne({ userId: req.user._id });
    if (!wallet) {
      wallet = await Wallet.create({
        userId: req.user._id,
        available_balance: D128(0),
        locked_balance: D128(0),
        currency: "USD",
      });
    }

    const pnlSummary = await getUserPnlSummary(req.user._id);
    const available = parseFloat(wallet.available_balance.toString());

    res.json({
      success: true,
      wallet: {
        ...wallet.toDisplay(),
        total_equity: +(available + pnlSummary.unrealized_pnl).toFixed(2),
        realized_pnl: pnlSummary.realized_pnl,
        unrealized_pnl: pnlSummary.unrealized_pnl,
        open_positions_count: pnlSummary.open_positions_count,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/wallet/transactions
export const getWalletTransactions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = { user_id: req.user._id };
    if (req.query.type) filter.type = req.query.type;

    const [transactions, total] = await Promise.all([
      WalletTransaction.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      WalletTransaction.countDocuments(filter),
    ]);

    const items = transactions.map((t) => ({
      ...t,
      amount: parseFloat(t.amount.toString()),
      balance_before: parseFloat(t.balance_before.toString()),
      balance_after: parseFloat(t.balance_after.toString()),
    }));

    res.json({
      success: true,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      items,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/wallet/deposit (for testing / admin)
export const depositFunds = async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: "Amount must be positive" });
    }

    let wallet = await Wallet.findOne({ userId: req.user._id });
    if (!wallet) {
      wallet = await Wallet.create({
        userId: req.user._id,
        available_balance: D128(0),
        locked_balance: D128(0),
        currency: "USD",
      });
    }

    const balanceBefore = parseFloat(wallet.available_balance.toString());
    const balanceAfter = +(balanceBefore + amount).toFixed(2);

    wallet.available_balance = D128(balanceAfter);
    await wallet.save();

    await WalletTransaction.create({
      user_id: req.user._id,
      type: "deposit",
      amount: D128(amount),
      balance_before: D128(balanceBefore),
      balance_after: D128(balanceAfter),
      reference_type: "deposit",
    });

    res.json({ success: true, wallet: wallet.toDisplay() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

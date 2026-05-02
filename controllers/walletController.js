import Wallet from "../models/walletModel.js";
import WalletTransaction from "../models/walletTransactionModel.js";
import { getUserPnlSummary } from "../services/tradingService.js";
import mongoose from "mongoose";
import Stripe from "stripe";
import dotenv from "dotenv";
import { toMinorUnits } from "../utils/money.js";

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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

// POST /api/wallet/deposit-intent
// Body: { amount, currency? }
// Creates a Stripe PaymentIntent for funding the in-app wallet.
export const createDepositIntent = async (req, res) => {
  try {
    const { amount, currency = "usd" } = req.body || {};
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      return res.status(400).json({ success: false, message: "Amount must be positive" });
    }
    if (amt < 1) {
      return res.status(400).json({ success: false, message: "Minimum deposit is $1" });
    }
    if (amt > 100000) {
      return res.status(400).json({ success: false, message: "Maximum single deposit is $100,000" });
    }

    const amountInMinor = toMinorUnits(amt, currency);
    if (amountInMinor < 50) {
      return res.status(400).json({ success: false, message: "Amount too small" });
    }

    const pi = await stripe.paymentIntents.create({
      amount: amountInMinor,
      currency: String(currency).toLowerCase(),
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      metadata: {
        type: "wallet_deposit",
        userId: String(req.user._id),
        amount: String(amt),
      },
    });

    return res.json({
      success: true,
      paymentIntentId: pi.id,
      clientSecret: pi.client_secret,
      status: pi.status,
      amount: amt,
      amountInMinor,
      currency: String(currency).toLowerCase(),
    });
  } catch (err) {
    console.error("createDepositIntent error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/wallet/deposit-confirm
// Body: { paymentIntentId }
// Verifies the PaymentIntent succeeded with Stripe, then idempotently credits the wallet.
export const confirmDeposit = async (req, res) => {
  try {
    const { paymentIntentId } = req.body || {};
    if (!paymentIntentId) {
      return res.status(400).json({ success: false, message: "paymentIntentId is required" });
    }

    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (!pi) {
      return res.status(404).json({ success: false, message: "PaymentIntent not found" });
    }

    // Validate ownership
    if (String(pi.metadata?.userId || "") !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: "PaymentIntent does not belong to this user" });
    }

    if (pi.metadata?.type !== "wallet_deposit") {
      return res.status(400).json({ success: false, message: "PaymentIntent is not a wallet deposit" });
    }

    if (pi.status !== "succeeded") {
      return res.status(400).json({
        success: false,
        message: `PaymentIntent not yet succeeded (status: ${pi.status})`,
        status: pi.status,
      });
    }

    // Idempotency — already credited?
    const existingTx = await WalletTransaction.findOne({ stripe_payment_intent_id: pi.id });
    if (existingTx) {
      const wallet = await Wallet.findOne({ userId: req.user._id });
      return res.json({
        success: true,
        already_credited: true,
        wallet: wallet ? wallet.toDisplay() : null,
        transaction: {
          ...existingTx.toObject(),
          amount: parseFloat(existingTx.amount.toString()),
          balance_before: parseFloat(existingTx.balance_before.toString()),
          balance_after: parseFloat(existingTx.balance_after.toString()),
        },
      });
    }

    const amountInMinor = Number(pi.amount_received || pi.amount || 0);
    const amount = +(amountInMinor / 100).toFixed(2);
    if (amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid PaymentIntent amount" });
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

    const tx = await WalletTransaction.create({
      user_id: req.user._id,
      type: "deposit",
      amount: D128(amount),
      balance_before: D128(balanceBefore),
      balance_after: D128(balanceAfter),
      reference_type: "stripe_deposit",
      stripe_payment_intent_id: pi.id,
    });

    return res.json({
      success: true,
      already_credited: false,
      wallet: wallet.toDisplay(),
      transaction: {
        _id: tx._id,
        type: tx.type,
        amount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        stripe_payment_intent_id: pi.id,
      },
    });
  } catch (err) {
    console.error("confirmDeposit error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

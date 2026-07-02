import LedgerEntry from "../models/ledgerEntryModel.js";
import { verifyLedgerIntegrity } from "../services/ledgerService.js";

// GET /api/admin/ledger?page=&limit=
export const listLedgerEntries = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const skip = (page - 1) * limit;

    const [entries, total] = await Promise.all([
      LedgerEntry.find().sort({ sequence: -1 }).skip(skip).limit(limit).lean(),
      LedgerEntry.countDocuments(),
    ]);

    res.json({
      success: true,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      entries,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/admin/ledger/verify?from=&to=
export const verifyLedger = async (req, res) => {
  try {
    const from = req.query.from ? parseInt(req.query.from) : 1;
    const to = req.query.to ? parseInt(req.query.to) : null;
    const result = await verifyLedgerIntegrity({ from, to });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

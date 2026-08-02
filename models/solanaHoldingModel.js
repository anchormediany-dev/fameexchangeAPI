import mongoose from "mongoose";

// A read-only cache of on-chain talent-share balances for display purposes
// only — populated by services/solana/solana_sync_ownership.ts. Deliberately
// separate from Position (which tracks cost basis / entry price for the
// existing off-chain trading ledger, a different concept entirely) and from
// Wallet (USD cash balance). The chain is always the source of truth; this
// collection can be dropped and re-synced at any time with no data loss.
const solanaHoldingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    walletAddress: { type: String, required: true },
    mint: { type: String, required: true },
    // Raw base-unit amount as a string (talent-share mints are 0-decimal, so
    // this is also the whole-share count, but stored as-fetched rather than
    // assuming decimals here).
    amount: { type: String, required: true },
    uiAmount: { type: Number, required: true },
    syncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

solanaHoldingSchema.index({ userId: 1, mint: 1 }, { unique: true });
solanaHoldingSchema.index({ walletAddress: 1 });

const SolanaHolding = mongoose.model("SolanaHolding", solanaHoldingSchema);
export default SolanaHolding;

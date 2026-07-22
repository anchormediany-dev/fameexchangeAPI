import mongoose from "mongoose";

/**
 * Append-only, hash-chained ledger. Every financially/valuation-meaningful
 * event on the platform (trades, wallet movements, price/valuation changes)
 * gets one entry here, in strict sequence, each linked to the previous
 * entry's hash. This is the platform's internal "blockchain-style" proof
 * layer: tampering with ANY past record (here or in the original source
 * collection) is detectable by recomputing hashes forward from that point —
 * without any actual blockchain, token, or off-platform dependency.
 */
const ledgerEntrySchema = new mongoose.Schema(
  {
    sequence: { type: Number, required: true, unique: true, index: true },
    source_type: {
      type: String,
      required: true,
      enum: ["trade", "wallet_transaction", "talent_price_history", "futures_pledge", "revenue_event"],
    },
    source_id: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },

    // SHA-256 of the canonicalized source record at the moment it was
    // chained. Recomputing this later from the live record and comparing
    // catches tampering with the original document itself.
    payload_hash: { type: String, required: true },

    // Hash of the previous ledger entry (or a fixed genesis value for
    // sequence 1). This is what makes it a CHAIN: altering any entry breaks
    // every prev_hash link after it.
    prev_hash: { type: String, required: true },

    // SHA-256 of (sequence + source_type + source_id + payload_hash +
    // prev_hash + recorded_at). This entry's own "block hash".
    hash: { type: String, required: true, unique: true },

    recorded_at: { type: Date, required: true },
  },
  { timestamps: false }
);

export default mongoose.model("LedgerEntry", ledgerEntrySchema);

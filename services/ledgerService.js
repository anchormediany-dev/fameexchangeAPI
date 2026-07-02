import crypto from "crypto";
import mongoose from "mongoose";
import LedgerEntry from "../models/ledgerEntryModel.js";

// Fixed 64-char hex "genesis" hash — the prev_hash of entry #1. Equivalent in
// spirit to the genesis block of a real blockchain: it has nothing before it.
const GENESIS_HASH = "0".repeat(64);

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

// Recursively converts Mongo-specific types (Decimal128, ObjectId, Date) into
// plain strings, and sorts object keys, so the SAME logical record always
// hashes to the SAME value regardless of key order or driver representation.
function normalize(value) {
  if (value == null) return value;
  if (value instanceof mongoose.Types.Decimal128) return value.toString();
  if (value instanceof mongoose.Types.ObjectId) return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        // Skip Mongoose internals that aren't part of the logical record.
        if (key === "__v" || key === "_id") return acc;
        acc[key] = normalize(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function canonicalize(obj) {
  return JSON.stringify(normalize(obj));
}

function computeBlockHash({ sequence, source_type, source_id, payload_hash, prev_hash, recorded_at }) {
  return sha256(
    canonicalize({
      sequence,
      source_type,
      source_id: source_id.toString(),
      payload_hash,
      prev_hash,
      recorded_at: recorded_at.toISOString(),
    })
  );
}

// In-process append serialization: prevents two concurrent appendLedgerEntry
// calls from both reading the same "last entry" and forking the chain.
// NOTE: this only protects a single Node process. If this API is ever scaled
// horizontally (multiple instances writing concurrently), this needs to move
// to a DB-level atomic sequence (e.g. findOneAndUpdate on a counter doc with
// a retry-on-conflict loop) — flagged here deliberately, not silently glossed
// over, since this codebase currently runs as a single PM2 process.
let chain = Promise.resolve();

export function appendLedgerEntry(sourceType, sourceId, payload) {
  const result = chain.then(() => doAppend(sourceType, sourceId, payload));
  // Keep the chain alive even if this particular append fails, so one bad
  // append doesn't permanently wedge every future append.
  chain = result.catch(() => {});
  return result;
}

async function doAppend(sourceType, sourceId, payload) {
  const last = await LedgerEntry.findOne().sort({ sequence: -1 }).lean();
  const sequence = last ? last.sequence + 1 : 1;
  const prevHash = last ? last.hash : GENESIS_HASH;
  const recordedAt = new Date();

  const payloadHash = sha256(canonicalize(payload));
  const hash = computeBlockHash({
    sequence,
    source_type: sourceType,
    source_id: sourceId,
    payload_hash: payloadHash,
    prev_hash: prevHash,
    recorded_at: recordedAt,
  });

  return LedgerEntry.create({
    sequence,
    source_type: sourceType,
    source_id: sourceId,
    payload_hash: payloadHash,
    prev_hash: prevHash,
    hash,
    recorded_at: recordedAt,
  });
}

/**
 * Walks the chain (optionally a sub-range) and verifies every prev_hash link
 * and every block's own hash. Returns the first point of tampering, if any,
 * without assuming the rest of the chain is trustworthy beyond that point.
 */
export async function verifyLedgerIntegrity({ from = 1, to = null } = {}) {
  const filter = { sequence: { $gte: from } };
  if (to != null) filter.sequence.$lte = to;

  const entries = await LedgerEntry.find(filter).sort({ sequence: 1 }).lean();

  let expectedPrevHash = GENESIS_HASH;
  if (from > 1) {
    const anchor = await LedgerEntry.findOne({ sequence: from - 1 }).lean();
    expectedPrevHash = anchor ? anchor.hash : GENESIS_HASH;
  }

  const breaks = [];
  for (const entry of entries) {
    if (entry.prev_hash !== expectedPrevHash) {
      breaks.push({
        sequence: entry.sequence,
        reason: "prev_hash does not match preceding entry's hash — chain link broken",
        expected_prev_hash: expectedPrevHash,
        found_prev_hash: entry.prev_hash,
      });
    }

    const recomputedHash = computeBlockHash({
      sequence: entry.sequence,
      source_type: entry.source_type,
      source_id: entry.source_id,
      payload_hash: entry.payload_hash,
      prev_hash: entry.prev_hash,
      recorded_at: entry.recorded_at,
    });
    if (recomputedHash !== entry.hash) {
      breaks.push({
        sequence: entry.sequence,
        reason: "entry hash does not match its own recomputed content — entry tampered",
        expected_hash: recomputedHash,
        found_hash: entry.hash,
      });
    }

    expectedPrevHash = entry.hash;
  }

  return { checked: entries.length, valid: breaks.length === 0, breaks };
}

/**
 * Verifies that a SOURCE record (e.g. the actual Trade document) still
 * matches the payload_hash recorded in the ledger when it was chained.
 * Catches tampering with the original record even if the ledger chain
 * itself is internally consistent.
 */
export async function verifySourceRecordIntegrity(sourceType, sourceId, currentPayload) {
  const entry = await LedgerEntry.findOne({ source_type: sourceType, source_id: sourceId }).lean();
  if (!entry) return { found: false, valid: false };

  const recomputedPayloadHash = sha256(canonicalize(currentPayload));
  return {
    found: true,
    valid: recomputedPayloadHash === entry.payload_hash,
    ledger_sequence: entry.sequence,
  };
}

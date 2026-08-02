// Verifies a Solana transaction's confirmation status and returns its
// details for an audit trail (e.g. alongside a Trade/WalletTransaction
// record, or an admin-facing on-chain-activity log). Pure read — this
// module never signs or sends anything.
//
// This program does not reference Famecoin in any way.
import { getConnection } from "./connection.js";

export interface TransactionVerificationResult {
  signature: string;
  found: boolean;
  slot: number | null;
  blockTime: number | null; // unix seconds, as reported by the cluster
  confirmationStatus: "processed" | "confirmed" | "finalized" | null;
  success: boolean;
  err: unknown;
  fee: number | null;
  computeUnitsConsumed: number | null;
  logs: string[];
}

/**
 * Verifies a transaction by signature. `found: false` means the cluster has
 * no record of it at all (not yet propagated, wrong signature, or expired
 * from an RPC node's retention window) — distinct from `found: true,
 * success: false`, which means it landed on-chain but failed.
 */
export async function verifyTransaction(signature: string): Promise<TransactionVerificationResult> {
  const connection = getConnection();

  const [statusResponse, transaction] = await Promise.all([
    connection.getSignatureStatus(signature, { searchTransactionHistory: true }),
    connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    }),
  ]);

  const status = statusResponse.value;

  if (!transaction) {
    return {
      signature,
      found: false,
      slot: status?.slot ?? null,
      blockTime: null,
      confirmationStatus: status?.confirmationStatus ?? null,
      success: false,
      err: status?.err ?? null,
      fee: null,
      computeUnitsConsumed: null,
      logs: [],
    };
  }

  return {
    signature,
    found: true,
    slot: transaction.slot,
    blockTime: transaction.blockTime ?? null,
    confirmationStatus: status?.confirmationStatus ?? null,
    success: transaction.meta?.err == null,
    err: transaction.meta?.err ?? null,
    fee: transaction.meta?.fee ?? null,
    computeUnitsConsumed: transaction.meta?.computeUnitsConsumed ?? null,
    logs: transaction.meta?.logMessages ?? [],
  };
}

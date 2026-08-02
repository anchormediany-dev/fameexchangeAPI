// Called when a user passes KYC on TFE — registers and verifies their wallet
// in `tfe_kyc_registry`, the on-chain whitelist every talent-share transfer
// checks (via `tfe_transfer_hook`). Sent as a single transaction with both
// `register_user` and `verify_user` instructions, so a wallet can't end up
// registered-but-not-verified (or vice versa) from a crash mid-flow.
//
// This program does not reference Famecoin in any way.
import { createHash } from "node:crypto";
import { PublicKey, Transaction } from "@solana/web3.js";
import { SystemProgram } from "@solana/web3.js";

import { getConnection } from "./connection.js";
import { getPlatformSigner, type PlatformSigner } from "./signers.js";
import { getKycRegistryProgram } from "./programs.js";
import { kycConfigPda, kycRecordPda } from "./pda.js";

/** `tfe_kyc_registry`'s KYC_TIER_BASIC / KYC_TIER_FULL constants. */
export const KYC_TIER_BASIC = 1;
export const KYC_TIER_FULL = 2;

/**
 * `tfe_kyc_registry`'s `KycRecord.user_id_hash` is documented as "hash of the
 * TFE user ID, never the raw ID" — this is the canonical way to produce it
 * from a Mongo `_id` (or any other stable TFE user identifier) so every
 * caller hashes the same way.
 */
export function hashUserId(userId: string): number[] {
  return Array.from(createHash("sha256").update(userId).digest());
}

export interface RegisterKycParams {
  walletAddress: string;
  /** 32-byte array — use `hashUserId(user._id.toString())`, never a raw user ID. */
  userIdHash: number[];
  kycTier?: typeof KYC_TIER_BASIC | typeof KYC_TIER_FULL;
}

export interface RegisterKycResult {
  signature: string;
}

export async function registerAndVerifyKyc(
  params: RegisterKycParams
): Promise<RegisterKycResult> {
  const { walletAddress, userIdHash, kycTier = KYC_TIER_FULL } = params;
  if (userIdHash.length !== 32) {
    throw new Error(`userIdHash must be exactly 32 bytes, got ${userIdHash.length}`);
  }

  const connection = getConnection();
  const backend = await getPlatformSigner("KYC_BACKEND");
  const admin = await getPlatformSigner("KYC_ADMIN");
  const program = getKycRegistryProgram(connection, backend);

  const wallet = new PublicKey(walletAddress);
  const [config] = kycConfigPda();
  const [kycRecord] = kycRecordPda(wallet);

  // Cast to `any`: no IDL-derived TS types (see programs.ts).
  const registerIx = await (program.methods as any)
    .registerUser(wallet, userIdHash)
    .accounts({
      backendAuthority: backend.publicKey,
      config,
      kycRecord,
      systemProgram: SystemProgram.programId,
    } as any)
    .instruction();

  const verifyIx = await (program.methods as any)
    .verifyUser(wallet, kycTier)
    .accounts({
      adminAuthority: admin.publicKey,
      config,
      kycRecord,
    } as any)
    .instruction();

  const tx = new Transaction().add(registerIx, verifyIx);

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = backend.publicKey;

  await signWithBoth(tx, backend, admin);

  const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");

  return { signature };
}

/** Signs with both signers, skipping the second if it's the same key as the first (common in practice — TFE may run backend and admin authority off the same platform key). */
async function signWithBoth(tx: Transaction, first: PlatformSigner, second: PlatformSigner): Promise<void> {
  await first.signTransaction(tx);
  if (!second.publicKey.equals(first.publicKey)) {
    await second.signTransaction(tx);
  }
}

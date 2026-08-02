// PDA derivation for all four TFE programs. Seeds here must stay in sync
// with each program's own Rust `constants.rs` — see the comment on each
// function for exactly which program/file it mirrors.
import { PublicKey } from "@solana/web3.js";
import { getExtraAccountMetaAddress } from "@solana/spl-token";
import {
  TFE_EXCHANGE_PROGRAM_ID,
  TFE_KYC_REGISTRY_PROGRAM_ID,
  TFE_TOKEN_MINTER_PROGRAM_ID,
  TFE_TRANSFER_HOOK_PROGRAM_ID,
} from "./programIds.js";

function u64ToLeBytes(value: bigint | number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value));
  return buf;
}

// ── tfe_kyc_registry ─────────────────────────────────────────────────────

export function kycConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], TFE_KYC_REGISTRY_PROGRAM_ID);
}

export function kycRecordPda(wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("kyc"), wallet.toBuffer()],
    TFE_KYC_REGISTRY_PROGRAM_ID
  );
}

// ── tfe_transfer_hook ────────────────────────────────────────────────────

/** Standard SPL Transfer Hook interface seed (`["extra-account-metas", mint]`) — not TFE-specific, hence the SPL helper rather than a hand-rolled derivation. */
export function extraAccountMetaListPda(mint: PublicKey): PublicKey {
  return getExtraAccountMetaAddress(mint, TFE_TRANSFER_HOOK_PROGRAM_ID);
}

// ── tfe_token_minter ─────────────────────────────────────────────────────

export function minterConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], TFE_TOKEN_MINTER_PROGRAM_ID);
}

export function mintAuthorityPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("mint_authority")],
    TFE_TOKEN_MINTER_PROGRAM_ID
  );
}

export function liquidityPoolAuthorityPda(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("liquidity_pool"), mint.toBuffer()],
    TFE_TOKEN_MINTER_PROGRAM_ID
  );
}

export function talentTokenRegistryPda(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("talent_token"), mint.toBuffer()],
    TFE_TOKEN_MINTER_PROGRAM_ID
  );
}

// ── tfe_exchange ─────────────────────────────────────────────────────────

export function exchangeConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], TFE_EXCHANGE_PROGRAM_ID);
}

export function exchangeAuthorityPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("exchange_authority")],
    TFE_EXCHANGE_PROGRAM_ID
  );
}

export function orderPda(orderId: bigint | number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("order"), u64ToLeBytes(orderId)],
    TFE_EXCHANGE_PROGRAM_ID
  );
}

export function tradePda(tradeId: bigint | number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("trade"), u64ToLeBytes(tradeId)],
    TFE_EXCHANGE_PROGRAM_ID
  );
}

export function claimableAllocationPda(mint: PublicKey, talentWallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("claimable"), mint.toBuffer(), talentWallet.toBuffer()],
    TFE_EXCHANGE_PROGRAM_ID
  );
}

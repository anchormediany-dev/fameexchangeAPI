// Called by TFE's order-matching engine once it's matched an open buy order
// against an open sell order — constructs and submits
// `tfe_exchange::execute_trade`, waits for confirmation, and returns the
// resulting on-chain trade record.
//
// This program does not reference Famecoin in any way.
//
// A note on Anchor's two different casing conventions for this same IDL,
// found by testing directly rather than assumed (see services/solana git
// history / PR description for the diagnostics that confirmed this):
//   - `.accounts({...})` instruction builder keys: camelCase (e.g. `buyOrder`)
//   - decoded on-chain account fields (`program.account.x.fetch(...)`): the
//     IDL's own raw snake_case (e.g. `order.trader`, but `order.order_id`)
// Both conventions are used correctly below — don't "fix" one to match the other.
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  Transaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";

import { getConnection } from "./connection.js";
import { getPlatformSigner } from "./signers.js";
import { getExchangeProgram } from "./programs.js";
import { TFE_KYC_REGISTRY_PROGRAM_ID, TFE_TRANSFER_HOOK_PROGRAM_ID } from "./programIds.js";
import {
  exchangeAuthorityPda,
  exchangeConfigPda,
  extraAccountMetaListPda,
  kycRecordPda,
  orderPda,
  tradePda,
} from "./pda.js";

const EXECUTE_TRADE_COMPUTE_UNITS = 400_000;

export interface ExecuteTradeParams {
  buyOrderId: bigint | number;
  sellOrderId: bigint | number;
}

export interface TradeRecordResult {
  tradeId: string;
  signature: string;
  buyOrder: string;
  sellOrder: string;
  mint: string;
  amount: string;
  price: string;
  fee: string;
  executedAt: string; // ISO 8601
}

export async function executeTrade(params: ExecuteTradeParams): Promise<TradeRecordResult> {
  const connection = getConnection();
  const executor = await getPlatformSigner("EXCHANGE_EXECUTOR");
  const program = getExchangeProgram(connection, executor);

  const [buyOrderAddress] = orderPda(params.buyOrderId);
  const [sellOrderAddress] = orderPda(params.sellOrderId);
  const [configAddress] = exchangeConfigPda();

  // Cast to `any`: no IDL-derived TS types (see programs.ts). Order/Config
  // accounts decode with the IDL's raw snake_case field names (verified
  // directly — see the module doc comment above).
  const accounts = program.account as any;
  const [buyOrder, sellOrder, config] = await Promise.all([
    accounts.order.fetch(buyOrderAddress),
    accounts.order.fetch(sellOrderAddress),
    accounts.config.fetch(configAddress),
  ]);

  const mint = new PublicKey(buyOrder.mint);
  const usdcMint = new PublicKey(config.usdc_mint);
  const treasuryWallet = new PublicKey(config.treasury_wallet);
  const buyerWallet = new PublicKey(buyOrder.trader);
  const sellerWallet = new PublicKey(sellOrder.trader);

  const [exchangeAuthority] = exchangeAuthorityPda();
  // `Config.next_trade_id` is what `execute_trade` will use on-chain to derive
  // the new TradeRecord's PDA — read it now so we can derive the same address
  // client-side to pass as the `trade_record` account. Safe as long as this
  // function runs one trade at a time (a single-threaded matching-engine
  // crank calling it serially); concurrent calls would need a retry-on-drift
  // strategy instead.
  const nextTradeId = BigInt(config.next_trade_id.toString());
  const [tradeRecordAddress] = tradePda(nextTradeId);

  const extraAccountMetaList = extraAccountMetaListPda(mint);
  const [senderKycRecord] = kycRecordPda(sellerWallet);
  const [receiverKycRecord] = kycRecordPda(buyerWallet);

  const buyerUsdcAccount = getAssociatedTokenAddressSync(
    usdcMint, buyerWallet, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const sellerUsdcAccount = getAssociatedTokenAddressSync(
    usdcMint, sellerWallet, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const treasuryUsdcAccount = getAssociatedTokenAddressSync(
    usdcMint, treasuryWallet, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const sellerShareAccount = getAssociatedTokenAddressSync(
    mint, sellerWallet, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const buyerShareAccount = getAssociatedTokenAddressSync(
    mint, buyerWallet, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const executeTradeIx = await (program.methods as any)
    .executeTrade(new BN(params.buyOrderId.toString()), new BN(params.sellOrderId.toString()))
    .accounts({
      executor: executor.publicKey,
      config: configAddress,
      exchangeAuthority,
      buyOrder: buyOrderAddress,
      sellOrder: sellOrderAddress,
      mint,
      usdcMint,
      buyerUsdcAccount,
      sellerUsdcAccount,
      treasuryUsdcAccount,
      sellerShareAccount,
      buyerShareAccount,
      tradeRecord: tradeRecordAddress,
      extraAccountMetaList,
      tfeTransferHookProgram: TFE_TRANSFER_HOOK_PROGRAM_ID,
      instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      tfeKycRegistryProgram: TFE_KYC_REGISTRY_PROGRAM_ID,
      senderKycRecord,
      receiverKycRecord,
      usdcTokenProgram: TOKEN_PROGRAM_ID,
      token2022Program: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    } as any)
    .instruction();

  const tx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: EXECUTE_TRADE_COMPUTE_UNITS }),
    executeTradeIx
  );

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = executor.publicKey;
  const signed = await executor.signTransaction(tx);

  const signature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");

  const tradeRecord = await accounts.tradeRecord.fetch(tradeRecordAddress);

  return {
    tradeId: tradeRecord.trade_id.toString(),
    signature,
    buyOrder: new PublicKey(tradeRecord.buy_order).toBase58(),
    sellOrder: new PublicKey(tradeRecord.sell_order).toBase58(),
    mint: new PublicKey(tradeRecord.mint).toBase58(),
    amount: tradeRecord.amount.toString(),
    price: tradeRecord.price.toString(),
    fee: tradeRecord.fee.toString(),
    executedAt: new Date(Number(tradeRecord.executed_at.toString()) * 1000).toISOString(),
  };
}

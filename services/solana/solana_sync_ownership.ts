// Reads on-chain Token-2022 balances for a wallet and syncs them into
// `SolanaHolding` for display. Called on login and after trades — see the
// integration notes at the bottom of this file for where those hooks live.
//
// This program does not reference Famecoin in any way.
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

import { getConnection } from "./connection.js";
import SolanaHolding from "../../models/solanaHoldingModel.js";

export interface OnChainHolding {
  mint: string;
  amount: string; // raw base units, as a string (avoids float precision loss)
  uiAmount: number;
}

/**
 * Reads every Token-2022 account owned by `walletAddress` directly from the
 * chain. Pure read — does not touch Mongo. Zero-balance accounts are
 * excluded (an emptied-out ATA that wasn't closed shouldn't show up as a holding).
 */
export async function getOnChainHoldings(walletAddress: string): Promise<OnChainHolding[]> {
  const connection = getConnection();
  const owner = new PublicKey(walletAddress);

  const { value } = await connection.getParsedTokenAccountsByOwner(owner, {
    programId: TOKEN_2022_PROGRAM_ID,
  });

  return value
    .map((entry) => {
      const info = entry.account.data.parsed.info;
      const tokenAmount = info.tokenAmount;
      return {
        mint: info.mint as string,
        amount: tokenAmount.amount as string,
        uiAmount: (tokenAmount.uiAmount as number | null) ?? 0,
      };
    })
    .filter((holding) => holding.amount !== "0");
}

export interface SyncOwnershipParams {
  walletAddress: string;
  /** If provided, persists the result into `SolanaHolding` for that user; omit for a read-only check. */
  userId?: string;
}

/**
 * Reads on-chain holdings and, if `userId` is given, upserts them into
 * `SolanaHolding` (and removes any previously-cached holding that's now
 * zero/gone — an on-chain sync should fully replace the prior snapshot, not
 * just add to it). Call this on login and immediately after any trade
 * completes (`solana_execute_trade.ts` / `solana_create_talent_token.ts`)
 * that could have changed the caller's balances.
 */
export async function syncOwnership(params: SyncOwnershipParams): Promise<OnChainHolding[]> {
  const holdings = await getOnChainHoldings(params.walletAddress);

  if (params.userId) {
    const currentMints = holdings.map((h) => h.mint);

    await Promise.all(
      holdings.map((h) =>
        SolanaHolding.findOneAndUpdate(
          { userId: params.userId, mint: h.mint },
          {
            userId: params.userId,
            walletAddress: params.walletAddress,
            mint: h.mint,
            amount: h.amount,
            uiAmount: h.uiAmount,
            syncedAt: new Date(),
          },
          { upsert: true, new: true }
        )
      )
    );

    // Drop cached rows for mints the wallet no longer holds (fully sold, or
    // the ATA was closed) so the display cache never shows a stale balance.
    await SolanaHolding.deleteMany({
      userId: params.userId,
      mint: { $nin: currentMints },
    });
  }

  return holdings;
}

// ── Integration notes (not wired in automatically — see PR/summary) ────────
// - On login: call `syncOwnership({ walletAddress: user.solanaWalletAddress, userId: user._id })`
//   from wherever `controllers/auth.js`'s `login` currently issues a JWT.
// - After a trade: call it for both the buyer's and seller's wallets once
//   `solana_execute_trade.ts` resolves.
// Neither hook is added to those existing files here — wiring a live
// on-chain sync into the login/trade path is a bigger behavioral change than
// "create this function," and risks breaking existing flows if the wallet
// field isn't populated for a given user yet (see the summary on
// `solanaWalletAddress` not existing on the User model before this change).

// Called when a talent qualifies on TFE (i.e. `famescoreService`'s graduation
// path decides a talent is tradeable) — creates their real Token-2022
// talent-share mint via `tfe_token_minter::create_talent_token`.
//
// This program does not reference Famecoin in any way — talent tokens are a
// standalone Solana ledger for TFE talent shares.
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";

import { getConnection } from "./connection.js";
import { getPlatformSigner } from "./signers.js";
import { getTokenMinterProgram } from "./programs.js";
import { TFE_KYC_REGISTRY_PROGRAM_ID, TFE_TRANSFER_HOOK_PROGRAM_ID } from "./programIds.js";
import {
  extraAccountMetaListPda,
  liquidityPoolAuthorityPda,
  mintAuthorityPda,
  minterConfigPda,
  talentTokenRegistryPda,
} from "./pda.js";

/** create_talent_token comfortably exceeds the default 200k CU budget — see tfe_token_minter's README. */
const CREATE_TALENT_TOKEN_COMPUTE_UNITS = 600_000;

export interface CreateTalentTokenParams {
  /** The talent's own Solana wallet — receives `talentAmount` shares directly. */
  talentWalletAddress: string;
  name: string;
  symbol: string;
  /** Off-chain metadata URI (name/symbol/image JSON), same convention as any Token-2022 TokenMetadata. */
  uri: string;
  /** Whole shares (0 decimals) — see tfe_token_minter's TOKEN_DECIMALS. */
  talentAmount: bigint | number;
  poolAmount: bigint | number;
}

export interface CreateTalentTokenResult {
  mintAddress: string;
  signature: string;
}

export async function createTalentToken(
  params: CreateTalentTokenParams
): Promise<CreateTalentTokenResult> {
  const { talentWalletAddress, name, symbol, uri, talentAmount, poolAmount } = params;

  const connection = getConnection();
  const admin = await getPlatformSigner("TOKEN_MINTER_ADMIN");
  const program = getTokenMinterProgram(connection, admin);

  const talentWallet = new PublicKey(talentWalletAddress);
  const mint = Keypair.generate();

  const [config] = minterConfigPda();
  const [mintAuthority] = mintAuthorityPda();
  const [liquidityPoolAuthority] = liquidityPoolAuthorityPda(mint.publicKey);
  const [registry] = talentTokenRegistryPda(mint.publicKey);
  const extraAccountMetaList = extraAccountMetaListPda(mint.publicKey);

  const talentTokenAccount = getAssociatedTokenAddressSync(
    mint.publicKey,
    talentWallet,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const liquidityPoolTokenAccount = getAssociatedTokenAddressSync(
    mint.publicKey,
    liquidityPoolAuthority,
    true, // liquidityPoolAuthority is a PDA — allow off-curve owner
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  // Cast to `any`: no IDL-derived TS types (see programs.ts), and Anchor's
  // fully-generic `.methods` builder chain otherwise hits
  // "Type instantiation is excessively deep" under `Program<any>`.
  const createTalentTokenIx = await (program.methods as any)
    .createTalentToken(name, symbol, uri, new BN(talentAmount.toString()), new BN(poolAmount.toString()))
    .accounts({
      admin: admin.publicKey,
      config,
      mint: mint.publicKey,
      mintAuthority,
      talentWallet,
      talentTokenAccount,
      liquidityPoolAuthority,
      liquidityPoolTokenAccount,
      registry,
      extraAccountMetaList,
      tfeTransferHookProgram: TFE_TRANSFER_HOOK_PROGRAM_ID,
      tfeKycRegistryProgram: TFE_KYC_REGISTRY_PROGRAM_ID,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    } as any)
    .instruction();

  const tx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: CREATE_TALENT_TOKEN_COMPUTE_UNITS }),
    createTalentTokenIx
  );

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = admin.publicKey;
  // `mint` is a fresh keypair this call generates (matching tfe_token_minter's
  // `mint: Signer` account) — it signs its own creation, in addition to the
  // admin/platform signer.
  tx.partialSign(mint);
  const signed = await admin.signTransaction(tx);

  const signature = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
  });
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");

  return { mintAddress: mint.publicKey.toBase58(), signature };
}

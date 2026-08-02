import { AnchorProvider, Program, type Idl } from "@coral-xyz/anchor";
import { Connection } from "@solana/web3.js";

import tfeKycRegistryIdl from "./idl/tfe_kyc_registry.json" with { type: "json" };
import tfeTokenMinterIdl from "./idl/tfe_token_minter.json" with { type: "json" };
import tfeExchangeIdl from "./idl/tfe_exchange.json" with { type: "json" };

import type { PlatformSigner } from "./signers.js";

// Not typed against generated IDL-derived TS types (that codegen step wasn't
// part of this integration) — `.methods`/`.accounts({...})` calls are typed
// loosely and rely on the account-name comments in each `solana_*.ts` file
// (verified against the real IDLs — see programIds.ts/pda.ts) rather than
// compiler-enforced account-shape checking. `tfe_transfer_hook` has no
// program instance here — nothing in this backend calls it directly; it's
// only ever invoked automatically by Token-2022 as part of a transfer.

function buildProvider(connection: Connection, signer: PlatformSigner): AnchorProvider {
  return new AnchorProvider(connection, signer as any, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
}

// Typed `Program<any>` rather than the bare `Program` (which defaults its
// generic to the base `Idl` type and, as a result, types `.account`/`.methods`
// as empty namespaces with no per-program keys, since there's no IDL-derived
// TS codegen here) — `any` at this one boundary is deliberate, not an
// oversight, so callers get useful completions on the *values* they pass
// without the compiler rejecting every account/method name it can't see.
export function getKycRegistryProgram(connection: Connection, signer: PlatformSigner): Program<any> {
  return new Program(tfeKycRegistryIdl as Idl, buildProvider(connection, signer));
}

export function getTokenMinterProgram(connection: Connection, signer: PlatformSigner): Program<any> {
  return new Program(tfeTokenMinterIdl as Idl, buildProvider(connection, signer));
}

export function getExchangeProgram(connection: Connection, signer: PlatformSigner): Program<any> {
  return new Program(tfeExchangeIdl as Idl, buildProvider(connection, signer));
}

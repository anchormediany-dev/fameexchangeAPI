// Real, deployed program IDs for all four TFE Solana programs (built at
// /Users/victorramos/Desktop/tfe_{transfer_hook,kyc_registry,token_minter,exchange}).
// None of these reference Famecoin — this is a standalone ledger for TFE talent shares.
import { PublicKey } from "@solana/web3.js";

export const TFE_KYC_REGISTRY_PROGRAM_ID = new PublicKey(
  "9eLB6vhwmmQmtmLXYUTpjT8aQhNZwvcZXTuZiKJVk6Pa"
);

export const TFE_TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
  "AVp2WjNdFj6g1inw79m9KQ5oc7EMKzRknH14HVZfS3nW"
);

export const TFE_TOKEN_MINTER_PROGRAM_ID = new PublicKey(
  "32v7giXjk2PAWD7rzxU6WCf6s476gGWXuzSHXJyPVexS"
);

export const TFE_EXCHANGE_PROGRAM_ID = new PublicKey(
  "HRerodqzFjef1ofx9DD9sGotw8RzzKsRz9q9XMYT5MGv"
);

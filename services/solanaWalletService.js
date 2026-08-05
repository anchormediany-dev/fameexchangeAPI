// Per-user custodial Solana wallet — the backend generates and holds a
// real keypair on each user's behalf (same model a brokerage uses for
// "street name" shares), so there's no wallet-connect/seed-phrase UX
// anywhere in this app. The public address is stored plainly on the User
// doc (models/user.js's solanaWalletAddress) — it's meant to be shared,
// that's the whole point (anyone can independently verify real on-chain
// holdings on a block explorer). The private key is NEVER stored raw —
// only a KMS envelope-encrypted ciphertext (solanaWalletEncryptedKey,
// select:false), decrypted transiently in-memory only at the moment of
// signing, matching the PlatformSigner shape services/solana/signers.ts
// already establishes for the platform's own admin/mint/KYC/executor keys.
//
// This is a real, reasonably strong pattern appropriate for devnet and
// early mainnet — NOT a substitute for a dedicated custody provider
// (Fireblocks, already wired as an option in signers.ts). Upgrading to
// that is a hard prerequisite before any real-money mainnet launch.
import { KMSClient, EncryptCommand, DecryptCommand } from "@aws-sdk/client-kms";
import { Keypair, Transaction, VersionedTransaction } from "@solana/web3.js";
import User from "../models/user.js";

const kms = new KMSClient({ region: process.env.AWS_REGION || "us-east-1" });

function requireKeyId() {
  const keyId = process.env.SOLANA_WALLET_KMS_KEY_ID;
  if (!keyId) {
    throw new Error(
      "SOLANA_WALLET_KMS_KEY_ID is not set — required to generate or unlock any custodial wallet."
    );
  }
  return keyId;
}

async function encryptSecretKey(secretKey) {
  const KeyId = requireKeyId();
  const { CiphertextBlob } = await kms.send(
    new EncryptCommand({ KeyId, Plaintext: Buffer.from(secretKey) })
  );
  return Buffer.from(CiphertextBlob).toString("base64");
}

async function decryptSecretKey(encryptedBase64) {
  requireKeyId(); // fail fast with a clear error even though DecryptCommand doesn't need KeyId
  const { Plaintext } = await kms.send(
    new DecryptCommand({ CiphertextBlob: Buffer.from(encryptedBase64, "base64") })
  );
  return new Uint8Array(Plaintext);
}

/**
 * Generates a brand-new custodial wallet for a user who doesn't have one
 * yet and persists it. Idempotent — if the user already has
 * solanaWalletAddress set, returns that instead of generating a second one.
 */
export async function getOrCreateWalletForUser(userId) {
  const existing = await User.findById(userId).select("solanaWalletAddress").lean();
  if (!existing) throw new Error("User not found");
  if (existing.solanaWalletAddress) {
    return { publicKey: existing.solanaWalletAddress, created: false };
  }

  const keypair = Keypair.generate();
  const encryptedKey = await encryptSecretKey(keypair.secretKey);
  const publicKey = keypair.publicKey.toBase58();

  // Race-safe: only set these fields if still unset (two concurrent calls
  // for the same brand-new user shouldn't be able to generate two wallets
  // and silently keep only one — the loser here just discards its unused
  // keypair and returns the winner's address instead).
  const updated = await User.findOneAndUpdate(
    { _id: userId, solanaWalletAddress: null },
    { $set: { solanaWalletAddress: publicKey, solanaWalletEncryptedKey: encryptedKey } },
    { new: true }
  ).select("solanaWalletAddress");

  if (!updated) {
    const winner = await User.findById(userId).select("solanaWalletAddress").lean();
    return { publicKey: winner.solanaWalletAddress, created: false };
  }

  return { publicKey, created: true };
}

/**
 * Returns a PlatformSigner-shaped object (see services/solana/signers.ts)
 * for a user's custodial wallet — drops straight into
 * `new AnchorProvider(connection, signer, opts)` the same way a platform
 * role signer does.
 */
export async function getSignerForUser(userId) {
  const user = await User.findById(userId).select("+solanaWalletEncryptedKey solanaWalletAddress");
  if (!user?.solanaWalletEncryptedKey) {
    throw new Error(`User ${userId} has no custodial wallet yet — call getOrCreateWalletForUser first.`);
  }

  const secretKey = await decryptSecretKey(user.solanaWalletEncryptedKey);
  const keypair = Keypair.fromSecretKey(secretKey);

  return {
    publicKey: keypair.publicKey,
    async signTransaction(tx) {
      if (tx instanceof VersionedTransaction) tx.sign([keypair]);
      else tx.partialSign(keypair);
      return tx;
    },
    async signAllTransactions(txs) {
      for (const tx of txs) {
        if (tx instanceof VersionedTransaction) tx.sign([keypair]);
        else tx.partialSign(keypair);
      }
      return txs;
    },
  };
}

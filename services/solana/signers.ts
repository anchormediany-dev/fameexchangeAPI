import { Keypair, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";

/**
 * Every signer this module produces implements this shape (a superset of
 * Anchor's own `Wallet` interface, so it drops straight into
 * `new AnchorProvider(connection, signer, opts)`). Nothing here ever reads a
 * private key from MongoDB — only from `process.env` or Fireblocks' own
 * custody infrastructure. Keep it that way: these are TFE's own
 * platform-controlled signing authorities (mint admin, KYC admin/backend,
 * exchange executor), never a user's individual wallet key.
 */
export interface PlatformSigner {
  publicKey: PublicKey;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
}

/**
 * Which on-chain authority a given call needs to sign as. Maps 1:1 to the
 * `Config.*_authority` / `executor` roles across the four programs — see
 * each program's own README for exactly what each role is allowed to do.
 */
export type SignerRole =
  | "TOKEN_MINTER_ADMIN" // tfe_token_minter Config.admin_authority
  | "KYC_ADMIN" // tfe_kyc_registry Config.admin_authority
  | "KYC_BACKEND" // tfe_kyc_registry Config.backend_authority
  | "EXCHANGE_EXECUTOR"; // tfe_exchange execute_trade's `executor` (permissionless on-chain, but the backend crank still needs a real key to pay the tx fee and sign)

function envKeypairSigner(secret: string): PlatformSigner {
  const keypair = decodeSecretKey(secret);
  return {
    publicKey: keypair.publicKey,
    async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
      if (tx instanceof VersionedTransaction) {
        tx.sign([keypair]);
      } else {
        tx.partialSign(keypair);
      }
      return tx;
    },
    async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
      for (const tx of txs) {
        if (tx instanceof VersionedTransaction) tx.sign([keypair]);
        else tx.partialSign(keypair);
      }
      return txs;
    },
  };
}

/** Accepts either a base58-encoded secret key or a JSON `[1,2,3,...]` byte array — whichever `solana-keygen`/Fireblocks-export convention produced the env var. */
function decodeSecretKey(secret: string): Keypair {
  const trimmed = secret.trim();
  if (trimmed.startsWith("[")) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(trimmed)));
  }
  return Keypair.fromSecretKey(bs58.decode(trimmed));
}

/**
 * Signs via Fireblocks' RAW signing capability against a specific vault
 * account, rather than ever materializing a private key in this process.
 * Fireblocks custodies the key in its own MPC/HSM infrastructure — this
 * function only ever sends the transaction's raw bytes for signing and
 * receives a signature back.
 *
 * NOTE: this integration hasn't been exercised against a real Fireblocks
 * workspace in this environment (no live credentials to test against) — the
 * shape below follows `@fireblocks/ts-sdk`'s documented RAW-signing flow
 * (create a RAW transaction, poll until COMPLETED, read the signature off
 * `signedMessages[0]`), but treat it as a starting point to verify against
 * your actual Fireblocks workspace/SDK version before relying on it in
 * production, not as already-proven-correct the way the on-chain programs
 * and their tests are.
 */
async function fireblocksSigner(
  vaultAccountId: string,
  assetId: string
): Promise<PlatformSigner> {
  // Env var names match the SDK's own built-in fallback convention exactly
  // (see node_modules/@fireblocks/ts-sdk/client/client.ts's constructor) —
  // read explicitly here only so this function can fail with a clear error
  // before ever touching the SDK.
  const apiKey = process.env.FIREBLOCKS_API_KEY;
  const secretKey = process.env.FIREBLOCKS_SECRET_KEY; // PEM contents, not a file path — never write this to disk here
  const basePath = process.env.FIREBLOCKS_BASE_PATH; // e.g. sandbox vs production API base URL

  if (!apiKey || !secretKey) {
    throw new Error(
      "FIREBLOCKS_API_KEY / FIREBLOCKS_SECRET_KEY are not set — cannot build a Fireblocks signer."
    );
  }

  // Dynamically imported so a deployment that only uses env-var signers
  // never needs the Fireblocks SDK installed at all (it's an optional
  // dependency for exactly this reason).
  const { Fireblocks, BasePath, TransactionOperation, TransferPeerPathType } = await import(
    "@fireblocks/ts-sdk"
  );

  const fireblocks = new Fireblocks({
    apiKey,
    secretKey,
    basePath: (basePath as any) ?? BasePath.US,
  });

  const publicKeyRes = await fireblocks.vaults.getPublicKeyInfoForAddress({
    vaultAccountId,
    assetId,
    change: 0,
    addressIndex: 0,
  });
  const publicKey = new PublicKey(bs58.decode(publicKeyRes.data.publicKey as string));

  async function signRawMessage(message: Buffer): Promise<Buffer> {
    const { data: created } = await fireblocks.transactions.createTransaction({
      transactionRequest: {
        assetId,
        operation: TransactionOperation.Raw,
        source: { type: TransferPeerPathType.VaultAccount, id: vaultAccountId },
        extraParameters: {
          rawMessageData: {
            messages: [{ content: message.toString("hex") }],
          },
        },
      },
    });

    const txId = created.id;
    if (!txId) throw new Error("Fireblocks did not return a transaction id");

    // Poll for completion — Fireblocks signing is asynchronous (may involve
    // real approver workflows in production). Adjust interval/timeout to
    // match your workspace's actual approval policy.
    const timeoutMs = 120_000;
    const intervalMs = 2_000;
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const { data: status } = await fireblocks.transactions.getTransaction({ txId });
      if (status.status === "COMPLETED") {
        const sig = status.signedMessages?.[0]?.signature?.fullSig;
        if (!sig) throw new Error("Fireblocks transaction completed with no signature attached");
        return Buffer.from(sig, "hex");
      }
      if (status.status === "FAILED" || status.status === "REJECTED" || status.status === "CANCELLED") {
        throw new Error(`Fireblocks transaction ${txId} ended in status ${status.status}`);
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new Error(`Fireblocks transaction ${txId} did not complete within ${timeoutMs}ms`);
  }

  async function signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    const message = tx instanceof VersionedTransaction ? tx.message.serialize() : tx.compileMessage().serialize();
    const signature = await signRawMessage(Buffer.from(message));
    tx.addSignature(publicKey, signature);
    return tx;
  }

  async function signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    const out: T[] = [];
    for (const tx of txs) out.push(await signTransaction(tx));
    return out;
  }

  return { publicKey, signTransaction, signAllTransactions };
}

/**
 * Resolves the signer for a given platform role: Fireblocks if
 * `FIREBLOCKS_{ROLE}_VAULT_ACCOUNT_ID` is configured for it, otherwise an
 * env-var keypair from `SOLANA_{ROLE}_PRIVATE_KEY`. Throws a clear
 * configuration error rather than silently picking a default if neither is set.
 */
export async function getPlatformSigner(role: SignerRole): Promise<PlatformSigner> {
  const vaultAccountId = process.env[`FIREBLOCKS_${role}_VAULT_ACCOUNT_ID`];
  if (vaultAccountId) {
    const assetId = process.env[`FIREBLOCKS_${role}_ASSET_ID`] ?? process.env.FIREBLOCKS_SOLANA_ASSET_ID;
    if (!assetId) {
      throw new Error(
        `FIREBLOCKS_${role}_VAULT_ACCOUNT_ID is set but no asset id is configured ` +
          `(FIREBLOCKS_${role}_ASSET_ID or FIREBLOCKS_SOLANA_ASSET_ID).`
      );
    }
    return fireblocksSigner(vaultAccountId, assetId);
  }

  const envKey = process.env[`SOLANA_${role}_PRIVATE_KEY`];
  if (envKey) {
    return envKeypairSigner(envKey);
  }

  throw new Error(
    `No signer configured for role ${role} — set either FIREBLOCKS_${role}_VAULT_ACCOUNT_ID ` +
      `(+ an asset id) or SOLANA_${role}_PRIVATE_KEY.`
  );
}

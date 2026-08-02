import { Connection } from "@solana/web3.js";

let connection: Connection | null = null;

/**
 * Lazily-created singleton `Connection` pointed at Helius (or whatever RPC
 * endpoint `HELIUS_RPC_URL` names — Helius is just what TFE actually uses).
 * Lazy so that importing anything in `services/solana/` doesn't throw at
 * process startup in environments where Solana isn't configured yet (e.g.
 * local dev without a Helius key) — the error only surfaces when a caller
 * actually tries to touch the chain.
 */
export function getConnection(): Connection {
  if (connection) return connection;

  const url = process.env.HELIUS_RPC_URL;
  if (!url) {
    throw new Error(
      "HELIUS_RPC_URL is not set — required for any Solana integration call."
    );
  }

  connection = new Connection(url, "confirmed");
  return connection;
}

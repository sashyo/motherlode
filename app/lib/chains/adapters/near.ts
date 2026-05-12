// NEAR adapter.
//
// Address (implicit account): hex(publicKey) — 64 lowercase hex chars.
// Serialization: Borsh.

import type {
  ChainAdapter,
  BalanceResult,
  UnsignedTransfer,
  SignedTransfer,
} from "../types";
import { CHAIN_META, formatBaseUnits } from "../registry";
import { bytesToHex } from "../realmKey";

const META = CHAIN_META.near;

async function rpc<T>(method: string, params: unknown): Promise<T> {
  const res = await fetch(META.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = (await res.json()) as { result?: T; error?: { message?: string } };
  if (json.error) throw new Error(`NEAR RPC: ${json.error.message ?? "unknown"}`);
  return json.result as T;
}

export const adapter: ChainAdapter = {
  meta: META,

  async deriveAddress(publicKey: Uint8Array): Promise<string> {
    // Prefer a named account if configured — NEAR's testnet faucet only
    // funds named `*.testnet` accounts, and named accounts are what most
    // tooling expects. Fall back to the implicit (hex-pubkey) account.
    const named = typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_NEAR_ACCOUNT_ID
      : undefined;
    if (named) return named;
    return bytesToHex(publicKey);
  },

  validateAddress(address: string): boolean {
    if (/^[0-9a-f]{64}$/.test(address)) return true;
    // Named accounts: a-z, 0-9, '-', '_', '.', terminating in ".testnet" or ".near"
    return /^[a-z0-9_\-.]{2,64}$/.test(address);
  },

  async getBalance(address: string): Promise<BalanceResult> {
    try {
      type Resp = { amount: string };
      const res = await rpc<Resp>("query", {
        request_type: "view_account",
        finality: "final",
        account_id: address,
      });
      const raw = BigInt(res.amount);
      return { raw, formatted: formatBaseUnits(raw, META.decimals) };
    } catch {
      return { raw: 0n, formatted: "0" };
    }
  },

  async buildUnsignedTransfer({ publicKey, from, to, amount }): Promise<UnsignedTransfer> {
    // near-api-js's package "exports" map only allows the root entrypoint;
    // subpaths like /lib/transactions are blocked. Pull everything from
    // the root namespace — the v6 root re-exports the full tx + crypto API.
    const near = await import("near-api-js");
    const bs58 = (await import("bs58")).default;

    // Pubkey in NEAR's canonical "ed25519:<base58>" form.
    const pubKeyStr = `ed25519:${bs58.encode(publicKey)}`;
    const nearPub = near.PublicKey.fromString(pubKeyStr);

    // 1. Fetch the access-key nonce for (account, pubkey).
    type AccessKeyResp = { nonce: number; permission: unknown };
    const accessKey = await rpc<AccessKeyResp>("query", {
      request_type: "view_access_key",
      finality: "final",
      account_id: from,
      public_key: pubKeyStr,
    });
    const nonce = BigInt(accessKey.nonce) + 1n;

    // 2. Latest finalized block hash — required for tx replay protection.
    type BlockResp = { header: { hash: string } };
    const block = await rpc<BlockResp>("block", { finality: "final" });
    const blockHash = bs58.decode(block.header.hash);

    // 3. Build the transfer action + transaction via the v6 helpers.
    const action = near.actions.transfer(amount);
    const transaction = near.createTransaction(
      from,
      nearPub,
      to,
      nonce,
      [action],
      blockHash,
    );

    // 4. NEAR signs sha256(borsh(transaction)). The wire-broadcast bytes
    // are the SignedTransaction encode (we'll build that in attachSignature).
    const serialized = transaction.encode();
    const hashBuf = await crypto.subtle.digest(
      "SHA-256",
      serialized as unknown as BufferSource,
    );
    const signingPayload = new Uint8Array(hashBuf);

    return {
      serialized,
      signingPayload,
      txHashPreview: bs58.encode(signingPayload),
    };
  },

  async attachSignature({ unsigned, signature }): Promise<SignedTransfer> {
    const near = await import("near-api-js");
    // Re-decode the unsigned bytes back into a Transaction object, then
    // wrap with the ED25519 Signature into a SignedTransaction.
    const transaction = near.Transaction.decode(unsigned.serialized);
    const sig = new near.Signature({
      keyType: near.KeyType.ED25519,
      data: signature,
    });
    const signed = new near.SignedTransaction({ transaction, signature: sig });
    return { serialized: signed.encode() };
  },

  async broadcast(signed: SignedTransfer): Promise<string> {
    let bin = "";
    for (let i = 0; i < signed.serialized.length; i++) {
      bin += String.fromCharCode(signed.serialized[i]);
    }
    const b64 = btoa(bin);
    return await rpc<string>("broadcast_tx_async", [b64]);
  },

  explorerTxUrl(txHash: string): string {
    return `https://testnet.nearblocks.io/txns/${txHash}`;
  },

  explorerAddressUrl(address: string): string {
    return `https://testnet.nearblocks.io/address/${address}`;
  },
};

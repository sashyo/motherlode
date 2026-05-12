// Solana adapter.
//
// Address: base58(publicKey) — Solana addresses ARE the 32-byte Ed25519 pubkey.
// Serialization: Solana's "compact-array" wire format (length-compact + Borsh-ish).
// We use @solana/web3.js to compile a versioned message → SystemProgram.transfer.

import type {
  ChainAdapter,
  BalanceResult,
  UnsignedTransfer,
  SignedTransfer,
} from "../types";
import { CHAIN_META, formatBaseUnits } from "../registry";

const META = CHAIN_META.solana;

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(META.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`Solana RPC ${res.status}`);
  const json = (await res.json()) as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(`Solana RPC: ${json.error.message}`);
  return json.result as T;
}

export const adapter: ChainAdapter = {
  meta: META,

  async deriveAddress(publicKey: Uint8Array): Promise<string> {
    const bs58 = (await import("bs58")).default;
    return bs58.encode(publicKey);
  },

  validateAddress(address: string): boolean {
    if (address.length < 32 || address.length > 44) return false;
    return /^[1-9A-HJ-NP-Za-km-z]+$/.test(address);
  },

  async getBalance(address: string): Promise<BalanceResult> {
    type Resp = { value: number };
    try {
      const res = await rpc<Resp>("getBalance", [address]);
      const raw = BigInt(res.value);
      return { raw, formatted: formatBaseUnits(raw, META.decimals) };
    } catch {
      return { raw: 0n, formatted: "0" };
    }
  },

  async buildUnsignedTransfer({ publicKey, to, amount }): Promise<UnsignedTransfer> {
    const [
      { PublicKey, SystemProgram, TransactionMessage, VersionedTransaction },
      bs58Mod,
    ] = await Promise.all([
      import("@solana/web3.js"),
      import("bs58"),
    ]);
    const bs58 = bs58Mod.default;

    type BlockhashResp = { value: { blockhash: string } };
    const bh = await rpc<BlockhashResp>("getLatestBlockhash", [{ commitment: "finalized" }]);
    const blockhash = bh.value.blockhash;

    const fromKey = new PublicKey(publicKey);
    const toKey = new PublicKey(to);

    const ix = SystemProgram.transfer({
      fromPubkey: fromKey,
      toPubkey: toKey,
      lamports: Number(amount),
    });

    const msg = new TransactionMessage({
      payerKey: fromKey,
      recentBlockhash: blockhash,
      instructions: [ix],
    }).compileToV0Message();

    const tx = new VersionedTransaction(msg);
    // Replace the placeholder zero-signature slot with a 64-byte zero buffer
    // (SDK already does this in the constructor). We capture the *message*
    // bytes — those are what gets signed.
    const messageBytes = tx.message.serialize();

    return {
      serialized: tx.serialize(),
      signingPayload: messageBytes,
      txHashPreview: bs58.encode(messageBytes.slice(0, 32)),
    };
  },

  async attachSignature({ unsigned, signature }): Promise<SignedTransfer> {
    const { VersionedTransaction } = await import("@solana/web3.js");
    const tx = VersionedTransaction.deserialize(unsigned.serialized);
    tx.signatures[0] = signature;
    return { serialized: tx.serialize() };
  },

  async broadcast(signed: SignedTransfer): Promise<string> {
    const bs58 = (await import("bs58")).default;
    const b64 = btoa(String.fromCharCode(...signed.serialized));
    type Resp = string;
    const sig = await rpc<Resp>("sendTransaction", [
      b64,
      { encoding: "base64", skipPreflight: false },
    ]);
    return sig;
  },

  explorerTxUrl(txHash: string): string {
    return `https://explorer.solana.com/tx/${txHash}?cluster=devnet`;
  },

  explorerAddressUrl(address: string): string {
    return `https://explorer.solana.com/address/${address}?cluster=devnet`;
  },
};

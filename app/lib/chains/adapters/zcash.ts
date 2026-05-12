// Zcash adapter — STUB.
//
// Zcash transparent addresses (t1...) are essentially Bitcoin's P2PKH:
// base58check(0x1CB8 || ripemd160(sha256(pubkey))). The ED25519 family
// doesn't natively map to Zcash's signing scheme (which is ECDSA for
// transparent and RedDSA for shielded). We surface a t1-shaped address
// derived from the realm Ed25519 pubkey purely for parity, and reject
// transaction operations.

import type {
  ChainAdapter,
  BalanceResult,
  UnsignedTransfer,
  SignedTransfer,
} from "../types";
import { CHAIN_META } from "../registry";

const META = CHAIN_META.zcash;

const UNSUPPORTED = new Error(
  "Zcash adapter not implemented. Sapling/Orchard signing has no browser-safe pure-JS lib.",
);

const BS58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function bs58Encode(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) + BigInt(b);
  let out = "";
  while (n > 0n) {
    const r = n % 58n;
    n = n / 58n;
    out = BS58_ALPHABET[Number(r)] + out;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = BS58_ALPHABET[0] + out;
  }
  return out;
}

export const adapter: ChainAdapter = {
  meta: META,

  async deriveAddress(publicKey: Uint8Array): Promise<string> {
    const { sha256 } = await import("@noble/hashes/sha2.js");
    const { ripemd160 } = await import("@noble/hashes/legacy.js");
    const id = ripemd160(sha256(publicKey));
    // testnet t-addr prefix: 0x1D25
    const prefix = new Uint8Array([0x1D, 0x25]);
    const versioned = new Uint8Array(prefix.length + id.length);
    versioned.set(prefix, 0);
    versioned.set(id, prefix.length);
    const checksum = sha256(sha256(versioned)).slice(0, 4);
    const full = new Uint8Array(versioned.length + 4);
    full.set(versioned, 0);
    full.set(checksum, versioned.length);
    return bs58Encode(full);
  },

  validateAddress(address: string): boolean {
    return /^(t1|t2|tm|tn)[1-9A-HJ-NP-Za-km-z]{32,40}$/.test(address);
  },

  async getBalance(): Promise<BalanceResult> {
    return { raw: 0n, formatted: "0" };
  },

  async buildUnsignedTransfer(): Promise<UnsignedTransfer> {
    throw UNSUPPORTED;
  },

  async attachSignature(): Promise<SignedTransfer> {
    throw UNSUPPORTED;
  },

  async broadcast(): Promise<string> {
    throw UNSUPPORTED;
  },

  explorerTxUrl(txHash: string): string {
    return `https://blockexplorer.one/zcash/testnet/tx/${txHash}`;
  },

  explorerAddressUrl(address: string): string {
    return `https://blockexplorer.one/zcash/testnet/address/${address}`;
  },
};

// Monero adapter — STUB.
//
// Monero uses a custom Ed25519-curve construction with separate spend/view
// keys, ring signatures, and stealth addresses. There is no production-grade
// pure-JS library; the canonical implementation is C++ wallet2. Browser
// usage typically wraps a remote `monero-wallet-rpc` over HTTP.
//
// We expose a "view-only address" placeholder that hex-encodes the realm
// pubkey for visibility but otherwise rejects all operations.

import type {
  ChainAdapter,
  BalanceResult,
  UnsignedTransfer,
  SignedTransfer,
} from "../types";
import { CHAIN_META } from "../registry";

const META = CHAIN_META.monero;

const UNSUPPORTED = new Error(
  "Monero adapter not implemented. Requires monero-wallet-rpc (no browser-safe pure-JS lib).",
);

export const adapter: ChainAdapter = {
  meta: META,

  async deriveAddress(publicKey: Uint8Array): Promise<string> {
    return (
      "[stagenet:placeholder] " +
      Array.from(publicKey).map((b) => b.toString(16).padStart(2, "0")).join("")
    );
  },

  validateAddress(address: string): boolean {
    return /^[45][0-9A-Za-z]{94}$/.test(address);
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
    return `https://stagenet.xmrchain.net/tx/${txHash}`;
  },

  explorerAddressUrl(): string {
    return "https://stagenet.xmrchain.net/";
  },
};

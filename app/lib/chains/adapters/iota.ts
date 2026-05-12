// IOTA adapter — STUB.
//
// IOTA's stablest browser SDK is @iota/sdk-wasm which is heavy and has
// bundling issues on Next 16/webpack. Address derivation is in principle:
// bech32("iota", blake2b256(pubkey)). This adapter exposes that and stubs
// the rest with explicit unsupported errors.

import type {
  ChainAdapter,
  BalanceResult,
  UnsignedTransfer,
  SignedTransfer,
} from "../types";
import { CHAIN_META } from "../registry";

const META = CHAIN_META.iota;

const UNSUPPORTED = new Error(
  "IOTA adapter not implemented. Install @iota/sdk-wasm and wire serialization.",
);

export const adapter: ChainAdapter = {
  meta: META,

  async deriveAddress(publicKey: Uint8Array): Promise<string> {
    const { blake2b } = await import("@noble/hashes/blake2.js");
    const { bech32 } = await import("@scure/base");
    const id = blake2b(publicKey, { dkLen: 32 });
    return bech32.encode("iota", bech32.toWords(id), 100);
  },

  validateAddress(address: string): boolean {
    return /^iota1[0-9a-z]{50,80}$/.test(address);
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
    return `https://explorer.iota.org/iota-testnet/transaction/${txHash}`;
  },

  explorerAddressUrl(address: string): string {
    return `https://explorer.iota.org/iota-testnet/addr/${address}`;
  },
};

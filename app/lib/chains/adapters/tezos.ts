// Tezos adapter.
//
// Address (tz1): base58check(0x06A19F || blake2b160(publicKey)).
// Serialization: Tezos forge format (Michelson typed binary, custom).

import type {
  ChainAdapter,
  BalanceResult,
  UnsignedTransfer,
  SignedTransfer,
} from "../types";
import { CHAIN_META, formatBaseUnits } from "../registry";

const META = CHAIN_META.tezos;

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
    const { blake2b } = await import("@noble/hashes/blake2.js");
    const { sha256 } = await import("@noble/hashes/sha2.js");
    const hash = blake2b(publicKey, { dkLen: 20 });
    // tz1 prefix (Ed25519 public key hash) = 0x06A19F
    const prefix = new Uint8Array([0x06, 0xA1, 0x9F]);
    const versioned = new Uint8Array(prefix.length + hash.length);
    versioned.set(prefix, 0);
    versioned.set(hash, prefix.length);
    const checksum = sha256(sha256(versioned)).slice(0, 4);
    const full = new Uint8Array(versioned.length + 4);
    full.set(versioned, 0);
    full.set(checksum, versioned.length);
    return bs58Encode(full);
  },

  validateAddress(address: string): boolean {
    return /^(tz1|tz2|tz3|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
  },

  async getBalance(address: string): Promise<BalanceResult> {
    try {
      const res = await fetch(`${META.endpoint}/chains/main/blocks/head/context/contracts/${address}/balance`);
      if (!res.ok) return { raw: 0n, formatted: "0" };
      const text = (await res.text()).replace(/"/g, "");
      const raw = BigInt(text);
      return { raw, formatted: formatBaseUnits(raw, META.decimals) };
    } catch {
      return { raw: 0n, formatted: "0" };
    }
  },

  async buildUnsignedTransfer({ from, to, amount }): Promise<UnsignedTransfer> {
    const { localForger } = await import("@taquito/local-forging");
    const forger = localForger;

    type HeadResp = { hash: string };
    const head = await fetch(`${META.endpoint}/chains/main/blocks/head/header`).then(
      (r) => r.json() as Promise<HeadResp>,
    );

    type CounterResp = string;
    const counter = await fetch(`${META.endpoint}/chains/main/blocks/head/context/contracts/${from}/counter`)
      .then((r) => r.text())
      .then((t) => parseInt(t.replace(/"/g, ""), 10));

    const branch = head.hash;
    const op = {
      branch,
      contents: [
        {
          kind: "transaction" as const,
          source: from,
          fee: "1500",
          counter: String(counter + 1),
          gas_limit: "10500",
          storage_limit: "300",
          amount: amount.toString(),
          destination: to,
        },
      ],
    };

    const forgedHex = await forger.forge(op);
    const hexToBytes = (h: string) => {
      const out = new Uint8Array(h.length / 2);
      for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
      return out;
    };
    const forged = hexToBytes(forgedHex);
    // Tezos signing payload = 0x03 || forged op bytes, then blake2b256 of that.
    const watermark = new Uint8Array([0x03]);
    const concat = new Uint8Array(watermark.length + forged.length);
    concat.set(watermark, 0);
    concat.set(forged, watermark.length);
    const { blake2b } = await import("@noble/hashes/blake2.js");
    const signingPayload = blake2b(concat, { dkLen: 32 });
    return { serialized: forged, signingPayload, fee: 1500n };
  },

  async attachSignature({ unsigned, signature }): Promise<SignedTransfer> {
    const out = new Uint8Array(unsigned.serialized.length + signature.length);
    out.set(unsigned.serialized, 0);
    out.set(signature, unsigned.serialized.length);
    return { serialized: out };
  },

  async broadcast(signed: SignedTransfer): Promise<string> {
    const hex = Array.from(signed.serialized).map((b) => b.toString(16).padStart(2, "0")).join("");
    const res = await fetch(`${META.endpoint}/injection/operation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(hex),
    });
    if (!res.ok) throw new Error(`Tezos inject ${res.status}: ${await res.text()}`);
    return (await res.text()).replace(/"/g, "");
  },

  explorerTxUrl(txHash: string): string {
    return `https://ghostnet.tzkt.io/${txHash}`;
  },

  explorerAddressUrl(address: string): string {
    return `https://ghostnet.tzkt.io/${address}`;
  },
};

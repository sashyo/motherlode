// Cardano adapter (preprod testnet).
//
// Address (enterprise, addr_test...): bech32(0x60 || network=0x00 || blake2b224(pubkey)).
// Serialization: CBOR (canonical).
//
// Cardano normally uses BIP32-Ed25519 (extended keys) with CIP-1852 paths.
// We use the realm Ed25519 pubkey directly as the verification key —
// representing a "minimal" Shelley payment credential. Real wallets derive
// payment + stake credentials from a 64-byte BIP32 root.

import type {
  ChainAdapter,
  BalanceResult,
  UnsignedTransfer,
  SignedTransfer,
} from "../types";
import { CHAIN_META, formatBaseUnits } from "../registry";

const META = CHAIN_META.cardano;
const NETWORK_ID = 0x00; // testnet

// ──────────────────────────────────────────────────────────────────────
// Minimal CBOR encoder, just enough for a Conway-era ADA-only payment
// transaction. Cardano requires canonical (deterministic) CBOR, which for
// our subset means: definite-length items, smallest-possible integer
// encoding, and (ideally) sorted map keys. We only emit numeric keys 0..3
// in ascending order so sorting is implicit.
// ──────────────────────────────────────────────────────────────────────

function encUint(n: number | bigint): Uint8Array {
  const v = typeof n === "bigint" ? n : BigInt(n);
  return encMajor(0, v);
}

function encBytes(bytes: Uint8Array): Uint8Array {
  const header = encMajor(2, BigInt(bytes.length));
  const out = new Uint8Array(header.length + bytes.length);
  out.set(header, 0);
  out.set(bytes, header.length);
  return out;
}

function encArray(items: Uint8Array[]): Uint8Array {
  const header = encMajor(4, BigInt(items.length));
  const total = items.reduce((n, it) => n + it.length, header.length);
  const out = new Uint8Array(total);
  out.set(header, 0);
  let off = header.length;
  for (const it of items) {
    out.set(it, off);
    off += it.length;
  }
  return out;
}

function encodeMap(pairs: [Uint8Array, Uint8Array][]): Uint8Array {
  const header = encMajor(5, BigInt(pairs.length));
  const total = pairs.reduce((n, [k, v]) => n + k.length + v.length, header.length);
  const out = new Uint8Array(total);
  out.set(header, 0);
  let off = header.length;
  for (const [k, v] of pairs) {
    out.set(k, off); off += k.length;
    out.set(v, off); off += v.length;
  }
  return out;
}

function encMajor(major: number, value: bigint): Uint8Array {
  const tag = major << 5;
  if (value < 24n) return new Uint8Array([tag | Number(value)]);
  if (value < 256n) return new Uint8Array([tag | 24, Number(value)]);
  if (value < 65536n) {
    const v = Number(value);
    return new Uint8Array([tag | 25, (v >> 8) & 0xff, v & 0xff]);
  }
  if (value < 4294967296n) {
    const v = Number(value);
    return new Uint8Array([
      tag | 26,
      (v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff,
    ]);
  }
  // 8-byte path
  const out = new Uint8Array(9);
  out[0] = tag | 27;
  const buf = new DataView(out.buffer);
  buf.setBigUint64(1, value, false);
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function decodeShelleyAddress(
  addr: string,
  bech32: { decode: (s: string, max: number) => { prefix: string; words: number[] }; fromWords: (w: number[]) => number[] | Uint8Array },
): Uint8Array {
  const decoded = bech32.decode(addr, 200);
  return new Uint8Array(bech32.fromWords(decoded.words));
}

export const adapter: ChainAdapter = {
  meta: META,

  async deriveAddress(publicKey: Uint8Array): Promise<string> {
    const { blake2b } = await import("@noble/hashes/blake2.js");
    const { bech32 } = await import("@scure/base");
    // Verification key may be raw 32 bytes (Ed25519) — Cardano hashes that
    // with blake2b-224 to get the "key hash" credential.
    const keyHash = blake2b(publicKey, { dkLen: 28 });
    // Enterprise address header: 0b0110_0000 = 0x60 (no stake) | network nibble.
    const header = 0x60 | (NETWORK_ID & 0x0f);
    const addrBytes = new Uint8Array(1 + keyHash.length);
    addrBytes[0] = header;
    addrBytes.set(keyHash, 1);
    return bech32.encode("addr_test", bech32.toWords(addrBytes), 200);
  },

  validateAddress(address: string): boolean {
    return /^addr(_test)?1[0-9a-z]{50,120}$/.test(address);
  },

  async getBalance(address: string): Promise<BalanceResult> {
    // Two read paths:
    //   - Koios (default, key-less): POST /address_info with body {_addresses}
    //   - Blockfrost (if NEXT_PUBLIC_BLOCKFROST_PROJECT_ID is set): GET /addresses/<addr>
    const project = typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_BLOCKFROST_PROJECT_ID
      : undefined;

    if (project) {
      const res = await fetch(`${META.endpoint}/addresses/${address}`, {
        headers: { project_id: project },
      });
      if (!res.ok) {
        throw new Error(`Blockfrost ${res.status}: ${await res.text().catch(() => "")}`);
      }
      const data = (await res.json()) as { amount: { unit: string; quantity: string }[] };
      const lovelace = data.amount.find((a) => a.unit === "lovelace");
      const raw = BigInt(lovelace?.quantity ?? 0);
      return { raw, formatted: formatBaseUnits(raw, META.decimals) };
    }
    // Koios path. Routed through /api/proxy/cardano because Koios's CORS
    // headers don't reliably reach browser fetches from localhost.
    const res = await fetch("/api/proxy/cardano", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "address_info",
        body: { _addresses: [address] },
      }),
    });
    if (!res.ok) {
      throw new Error(`Koios proxy ${res.status}: ${await res.text().catch(() => "")}`);
    }
    const arr = (await res.json()) as { balance?: string }[];
    if (!Array.isArray(arr) || arr.length === 0) {
      // Address has no UTxOs yet — legitimately zero.
      return { raw: 0n, formatted: "0" };
    }
    const raw = BigInt(arr[0]?.balance ?? 0);
    return { raw, formatted: formatBaseUnits(raw, META.decimals) };
  },

  async buildUnsignedTransfer({ from, to, amount }): Promise<UnsignedTransfer> {
    const { bech32 } = await import("@scure/base");
    const { blake2b } = await import("@noble/hashes/blake2.js");

    // 1. Decode addresses from bech32 to raw bytes (header + credential).
    const fromBytes = decodeShelleyAddress(from, bech32);
    const toBytes = decodeShelleyAddress(to, bech32);

    // 2. Fetch UTxOs at the source address.
    const utxosRes = await fetch("/api/proxy/cardano", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "address_utxos",
        body: { _addresses: [from], _extended: false },
      }),
    });
    if (!utxosRes.ok) throw new Error(`UTxO fetch ${utxosRes.status}`);
    const utxos = (await utxosRes.json()) as {
      tx_hash: string; tx_index: number; value: string;
    }[];
    if (utxos.length === 0) throw new Error("Cardano: no UTxOs at source address");

    // 3. Fetch tip → ttl = current_slot + 7200 (2 hours of validity).
    const tipRes = await fetch("/api/proxy/cardano", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "tip" }),
    });
    if (!tipRes.ok) throw new Error(`tip fetch ${tipRes.status}`);
    const tip = (await tipRes.json()) as { abs_slot: number }[];
    const ttl = BigInt(tip[0].abs_slot) + 7200n;

    // 4. Pick a UTxO that covers amount + fee + min change.
    //    Conway minimum fee: 44 lovelace/byte + 155381 base ≈ 170k for a
    //    simple tx. We budget 200k generously to skip exact-size iteration.
    const FEE = 200_000n;
    const MIN_UTXO = 1_000_000n; // 1 ADA min for the change output
    const sorted = [...utxos].sort((a, b) =>
      BigInt(b.value) > BigInt(a.value) ? 1 : -1,
    );
    const utxo = sorted.find((u) => BigInt(u.value) >= amount + FEE + MIN_UTXO);
    if (!utxo) {
      throw new Error(`Cardano: no UTxO covers ${amount} + fee ${FEE} + min-utxo ${MIN_UTXO}`);
    }
    const change = BigInt(utxo.value) - amount - FEE;

    // 5. Build the tx body CBOR map:
    //    { 0: [inputs], 1: [outputs], 2: fee, 3: ttl }
    const body = encodeMap([
      [encUint(0), encArray([
        encArray([
          encBytes(hexToBytes(utxo.tx_hash)),
          encUint(BigInt(utxo.tx_index)),
        ]),
      ])],
      [encUint(1), encArray([
        encArray([encBytes(toBytes), encUint(amount)]),
        encArray([encBytes(fromBytes), encUint(change)]),
      ])],
      [encUint(2), encUint(FEE)],
      [encUint(3), encUint(ttl)],
    ]);

    // 6. The tx hash that gets signed = blake2b256 of the body CBOR.
    const txHash = blake2b(body, { dkLen: 32 });

    return { serialized: body, signingPayload: txHash, fee: FEE };
  },

  async attachSignature({ unsigned, publicKey, signature }): Promise<SignedTransfer> {
    // Conway-era full transaction CBOR:
    //   [ body, witness_set, is_valid, auxiliary_data ]
    //
    //   witness_set = { 0: [[pubkey, signature]] }   ← vkey witnesses only
    //   is_valid    = true
    //   aux_data    = null
    const witnessSet = encodeMap([
      [encUint(0), encArray([
        encArray([encBytes(publicKey), encBytes(signature)]),
      ])],
    ]);
    const fullTx = encArray([
      unsigned.serialized,                     // body (already CBOR-encoded bytes)
      witnessSet,
      new Uint8Array([0xF5]),                  // CBOR true
      new Uint8Array([0xF6]),                  // CBOR null
    ]);
    return { serialized: fullTx };
  },

  async broadcast(signed: SignedTransfer): Promise<string> {
    const { blake2b } = await import("@noble/hashes/blake2.js");

    let bin = "";
    for (let i = 0; i < signed.serialized.length; i++) {
      bin += String.fromCharCode(signed.serialized[i]);
    }
    const cborB64 = btoa(bin);

    const res = await fetch("/api/proxy/cardano", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "submittx", cborB64 }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Cardano submittx ${res.status}: ${text.slice(0, 200)}`);
    // Koios returns the tx id (hex) as a JSON-encoded string. The id is the
    // blake2b256 of the tx BODY (not the full tx) — we already computed it.
    // Recompute from the body for consistency:
    // The first element of the outer CBOR array is the body. We don't have
    // a CBOR decoder here; instead Koios's submittx response IS the tx id.
    return JSON.parse(text);
  },

  explorerTxUrl(txHash: string): string {
    return `https://preprod.cardanoscan.io/transaction/${txHash}`;
  },

  explorerAddressUrl(address: string): string {
    return `https://preprod.cardanoscan.io/address/${address}`;
  },
};

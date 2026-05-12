// Realm public key extraction.
//
// The "wallet identity" for this app is the Tide realm itself. Its Ed25519
// public key is published in data/tidecloak.json under jwk.keys[0].x as a
// base64url-encoded 32-byte value. Every chain's address is a chain-specific
// encoding of these 32 bytes.
//
// SECURITY MODEL: The matching private key is held threshold-style by Tide
// ORKs — it does not exist in one place and is never accessible to this app.
// To submit a transaction, the unsigned bytes must be signed via Tide's
// threshold protocol (an ORK round-trip). This file does not perform any
// signing — it only surfaces the public key.

import tcConfig from "../../../data/tidecloak.json";

type JwkKey = {
  kid: string;
  kty: string;
  alg: string;
  crv: string;
  x: string;
};

function base64UrlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let _cached: { bytes: Uint8Array; kid: string } | null = null;

export function getRealmPublicKey(): { bytes: Uint8Array; kid: string } {
  if (_cached) return _cached;

  const keys = (tcConfig as { jwk: { keys: JwkKey[] } }).jwk.keys;
  const ed = keys.find((k) => k.kty === "OKP" && k.crv === "Ed25519");
  if (!ed) {
    throw new Error("No Ed25519 OKP key found in tidecloak.json jwk.keys");
  }
  const bytes = base64UrlToBytes(ed.x);
  if (bytes.length !== 32) {
    throw new Error(`Realm Ed25519 pubkey must be 32 bytes, got ${bytes.length}`);
  }
  _cached = { bytes, kid: ed.kid };
  return _cached;
}

// Hex helper used by adapters that need to format the pubkey for display.
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

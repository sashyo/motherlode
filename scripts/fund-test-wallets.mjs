#!/usr/bin/env node
// Derive every chain address from the realm pubkey in tidecloak.json
// and auto-fund the chains with programmatic testnet faucets.
// Prints addresses + faucet URLs for the rest.
//
// Usage:  node scripts/fund-test-wallets.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { sha3_256 } from "@noble/hashes/sha3.js";
import { blake2b } from "@noble/hashes/blake2.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import bs58 from "bs58";
import { bech32 } from "@scure/base";

// ---------- realm pubkey ----------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tcConfig = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../data/tidecloak.json"), "utf8"),
);

function base64UrlToBytes(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return new Uint8Array(Buffer.from(padded, "base64"));
}

const ed = tcConfig.jwk.keys.find((k) => k.kty === "OKP" && k.crv === "Ed25519");
if (!ed) throw new Error("No Ed25519 key in tidecloak.json");
const PUBKEY = base64UrlToBytes(ed.x);
console.log(`\nRealm Ed25519 pubkey: ${Buffer.from(PUBKEY).toString("hex")}\n`);

// ---------- address derivation helpers ----------

function sha256(data) {
  return new Uint8Array(createHash("sha256").update(data).digest());
}

function sha512_256(data) {
  // Algorand uses SHA-512/256 — Node exposes it as 'sha512-256'
  return new Uint8Array(createHash("sha512-256").update(data).digest());
}

const BS58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const XRPL_ALPHABET = "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz";

function bs58EncodeWithAlphabet(bytes, alphabet) {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) + BigInt(b);
  let out = "";
  while (n > 0n) {
    const r = n % 58n;
    n /= 58n;
    out = alphabet[Number(r)] + out;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = alphabet[0] + out;
  }
  return out;
}

function base58CheckEncode(versionBytes, payload, alphabet = BS58_ALPHABET) {
  const versioned = new Uint8Array(versionBytes.length + payload.length);
  versioned.set(versionBytes, 0);
  versioned.set(payload, versionBytes.length);
  const checksum = sha256(sha256(versioned)).slice(0, 4);
  const full = new Uint8Array(versioned.length + 4);
  full.set(versioned, 0);
  full.set(checksum, versioned.length);
  return bs58EncodeWithAlphabet(full, alphabet);
}

function toHex(bytes) {
  return Buffer.from(bytes).toString("hex");
}

// ---- per-chain ----

async function deriveSolana() {
  return bs58.encode(PUBKEY);
}

async function deriveStellar() {
  const { StrKey } = await import("@stellar/stellar-sdk");
  return StrKey.encodeEd25519PublicKey(Buffer.from(PUBKEY));
}

async function deriveAlgorand() {
  // base32(pubkey || sha512_256(pubkey)[-4:])
  const checksum = sha512_256(PUBKEY).slice(-4);
  const full = new Uint8Array(PUBKEY.length + 4);
  full.set(PUBKEY, 0);
  full.set(checksum, PUBKEY.length);
  // RFC 4648 base32 without padding
  const algosdk = (await import("algosdk")).default;
  return algosdk.encodeAddress(PUBKEY);
}

async function deriveNear() {
  return toHex(PUBKEY);
}

async function deriveAptos() {
  const buf = new Uint8Array(PUBKEY.length + 1);
  buf.set(PUBKEY, 0);
  buf[PUBKEY.length] = 0x00;
  const hash = sha3_256(buf);
  return "0x" + toHex(hash);
}

async function deriveSui() {
  const buf = new Uint8Array(PUBKEY.length + 1);
  buf[0] = 0x00;
  buf.set(PUBKEY, 1);
  const hash = blake2b(buf, { dkLen: 32 });
  return "0x" + toHex(hash);
}

async function deriveTon() {
  const { WalletContractV4 } = await import("@ton/ton");
  const wallet = WalletContractV4.create({
    workchain: 0,
    publicKey: Buffer.from(PUBKEY),
  });
  return wallet.address.toString({ testOnly: true, bounceable: false });
}

async function deriveXrpl() {
  const prefixed = new Uint8Array(33);
  prefixed[0] = 0xED;
  prefixed.set(PUBKEY, 1);
  const id = ripemd160(sha256(prefixed));
  return base58CheckEncode(new Uint8Array([0x00]), id, XRPL_ALPHABET);
}

async function deriveHedera() {
  // 0.0.<DER-encoded ed25519 pubkey hex> — Hedera SDK's PublicKey.fromString
  // expects a raw or DER-encoded key, NOT the protobuf Key{} wrapper.
  // DER prefix for ED25519 SubjectPublicKeyInfo (12 bytes) + 32-byte pubkey.
  const DER_PREFIX = new Uint8Array([
    0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
  ]);
  const der = new Uint8Array(DER_PREFIX.length + PUBKEY.length);
  der.set(DER_PREFIX, 0);
  der.set(PUBKEY, DER_PREFIX.length);
  return `0.0.${toHex(der)}`;
}

async function derivePolkadot() {
  const { encodeAddress } = await import("@polkadot/util-crypto");
  return encodeAddress(PUBKEY, 0); // Paseo prefix (same as Polkadot mainnet)
}

async function deriveTezos() {
  // tz1 = base58check(0x06A19F || blake2b160(pubkey))
  const hash = blake2b(PUBKEY, { dkLen: 20 });
  const prefix = new Uint8Array([0x06, 0xA1, 0x9F]);
  return base58CheckEncode(prefix, hash, BS58_ALPHABET);
}

async function deriveCosmos() {
  const id = sha256(PUBKEY).slice(0, 20);
  return bech32.encode("cosmos", bech32.toWords(id));
}

async function deriveCardano() {
  // Enterprise address: 0x60 (testnet) || blake2b224(pubkey), bech32 "addr_test"
  const keyHash = blake2b(PUBKEY, { dkLen: 28 });
  const header = 0x60 | 0x00; // testnet network nibble
  const addrBytes = new Uint8Array(1 + keyHash.length);
  addrBytes[0] = header;
  addrBytes.set(keyHash, 1);
  return bech32.encode("addr_test", bech32.toWords(addrBytes), 200);
}

// ---------- faucet logic ----------

const KNOWN_FUNDED = new Set(["solana"]); // user already funded

const CHAINS = [
  { id: "solana", name: "Solana", derive: deriveSolana,
    faucet: "https://faucet.solana.com" },

  { id: "stellar", name: "Stellar", derive: deriveStellar,
    auto: async (addr) => {
      const r = await fetch(`https://friendbot.stellar.org/?addr=${addr}`);
      if (r.ok) return "10,000 XLM (testnet)";
      const body = await r.text();
      // Friendbot returns 400 with this body once the account is already funded.
      if (r.status === 400 && body.includes("account already funded")) {
        // Confirm the actual balance.
        const acc = await fetch(`https://horizon-testnet.stellar.org/accounts/${addr}`);
        if (acc.ok) {
          const data = await acc.json();
          const native = data.balances.find((b) => b.asset_type === "native");
          return `already funded · ${native?.balance ?? "?"} XLM`;
        }
        return "already funded";
      }
      throw new Error(`friendbot ${r.status}: ${body}`);
    },
    faucet: "https://laboratory.stellar.org/#account-creator?network=test" },

  // Aptos: faucet now requires a JWT (Bearer token from aptoslabs.com). Manual.
  { id: "aptos", name: "Aptos", derive: deriveAptos,
    faucet: "https://aptos.dev/network/faucet" },

  // Sui: testnet faucet rate-limits per IP very aggressively. Manual is fastest.
  { id: "sui", name: "Sui", derive: deriveSui,
    faucet: "https://faucet.sui.io/" },

  { id: "algorand", name: "Algorand", derive: deriveAlgorand,
    faucet: "https://bank.testnet.algorand.network/" },

  { id: "near", name: "NEAR", derive: deriveNear,
    auto: async () => {
      // NEAR's testnet helper API still creates named accounts initialized
      // with a chosen pubkey. The implicit (hex) form isn't fundable via
      // public faucets — the named account is what tooling expects.
      const accountId = process.env.NEAR_ACCOUNT_ID || "motherlode-vault.testnet";
      const bs58 = (await import("bs58")).default;
      const pubkey58 = bs58.encode(PUBKEY);
      const r = await fetch("https://helper.testnet.near.org/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newAccountId: accountId,
          newAccountPublicKey: `ed25519:${pubkey58}`,
        }),
      });
      if (r.ok) {
        return `${accountId} · 10 NEAR (set NEXT_PUBLIC_NEAR_ACCOUNT_ID=${accountId})`;
      }
      const body = await r.text();
      // 422 = name taken. 200 should already be funded — check explicitly.
      if (body.includes("already exists") || body.includes("UNPROCESSABLE")) {
        return `${accountId} already exists (set NEXT_PUBLIC_NEAR_ACCOUNT_ID=${accountId})`;
      }
      throw new Error(`near helper ${r.status}: ${body.slice(0, 200)}`);
    },
    faucet: "https://near-faucet.io" },

  { id: "ton", name: "TON", derive: deriveTon,
    faucet: "https://t.me/testgiver_ton_bot" },

  { id: "xrpl", name: "XRPL", derive: deriveXrpl,
    auto: async (addr) => {
      // The XRPL altnet faucet supports a `destination` field that funds
      // an existing address instead of creating a new one. The address
      // gets the requested xrpAmount immediately (subject to ledger reserve).
      const r = await fetch("https://faucet.altnet.rippletest.net/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination: addr, xrpAmount: "1000" }),
      });
      if (!r.ok) throw new Error(`xrpl faucet ${r.status}: ${await r.text()}`);
      const data = await r.json();
      return `1,000 XRP (tx ${(data.transactionHash ?? "").slice(0, 12)}…)`;
    },
    faucet: "https://test.xrpfaucet.io/" },

  { id: "hedera", name: "Hedera", derive: deriveHedera,
    note:
      "Hedera testnet has no public alias-funding faucet — sign up at " +
      "portal.hedera.com, generate a testnet account, then set " +
      "NEXT_PUBLIC_HEDERA_ACCOUNT_ID to the resulting 0.0.X id.",
    faucet: "https://portal.hedera.com/" },

  { id: "polkadot", name: "Polkadot (Paseo)", derive: derivePolkadot,
    note:
      "Westend was deprecated in 2024-25; Paseo is the active testnet. " +
      "On faucet.polkadot.io, select \"Paseo\" from the network dropdown.",
    faucet: "https://faucet.polkadot.io/" },

  { id: "tezos", name: "Tezos (Ghostnet)", derive: deriveTezos,
    faucet: "https://faucet.ghostnet.teztnets.com/" },

  { id: "cosmos", name: "Cosmos Hub (Theta)", derive: deriveCosmos,
    faucet: "https://discord.com/invite/cosmosnetwork" },

  { id: "cardano", name: "Cardano (Preprod)", derive: deriveCardano,
    faucet: "https://docs.cardano.org/cardano-testnets/tools/faucet/" },
];

// ---------- run ----------

const auto = [];
const manual = [];

for (const c of CHAINS) {
  if (KNOWN_FUNDED.has(c.id)) continue;
  const address = await c.derive();
  const row = { ...c, address };
  if (c.auto) auto.push(row);
  else manual.push(row);
}

console.log("=".repeat(80));
console.log(`AUTO-FUNDING ${auto.length} chain${auto.length === 1 ? "" : "s"}`);
console.log("=".repeat(80));

for (const c of auto) {
  process.stdout.write(`  ${c.name.padEnd(22)} ${c.address}  ... `);
  try {
    const result = await c.auto(c.address);
    console.log(`✓ ${result}`);
  } catch (err) {
    console.log(`✗ ${err.message}`);
    console.log(`    ↳ manual: ${c.faucet}`);
  }
}

console.log();
console.log("=".repeat(80));
console.log(`MANUAL FAUCET (${manual.length} chains — paste address into faucet URL)`);
console.log("=".repeat(80));

for (const c of manual) {
  console.log(`\n  ${c.name}`);
  console.log(`    address: ${c.address}`);
  console.log(`    faucet:  ${c.faucet}`);
  if (c.note) console.log(`    note:    ${c.note}`);
}

console.log();

// XRPL (XRP Ledger) adapter.
//
// Address (classic, "r..."): base58check_xrpl(0x00 || ripemd160(sha256(0xED || pubkey))).
// 0xED is the ED25519 prefix byte specific to XRPL pubkey serialization.
// Serialization: XRPL's binary codec (custom typed format).

import type {
  ChainAdapter,
  BalanceResult,
  UnsignedTransfer,
  SignedTransfer,
} from "../types";
import { CHAIN_META, formatBaseUnits } from "../registry";

const META = CHAIN_META.xrpl;

const XRPL_ALPHABET = "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz";

function bytesToBase58(bytes: Uint8Array, alphabet: string): string {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) + BigInt(b);
  let out = "";
  while (n > 0n) {
    const r = n % 58n;
    n = n / 58n;
    out = alphabet[Number(r)] + out;
  }
  // Leading zero bytes → leading "r" chars (alphabet[0])
  for (const b of bytes) {
    if (b !== 0) break;
    out = alphabet[0] + out;
  }
  return out;
}

export const adapter: ChainAdapter = {
  meta: META,

  async deriveAddress(publicKey: Uint8Array): Promise<string> {
    const { sha256 } = await import("@noble/hashes/sha2.js");
    const { ripemd160 } = await import("@noble/hashes/legacy.js");
    // ED25519 pubkey on XRPL is prefixed with 0xED.
    const prefixed = new Uint8Array(33);
    prefixed[0] = 0xED;
    prefixed.set(publicKey, 1);
    const id = ripemd160(sha256(prefixed));
    const versioned = new Uint8Array(1 + id.length);
    versioned[0] = 0x00; // account ID type
    versioned.set(id, 1);
    const checksum = sha256(sha256(versioned)).slice(0, 4);
    const full = new Uint8Array(versioned.length + 4);
    full.set(versioned, 0);
    full.set(checksum, versioned.length);
    return bytesToBase58(full, XRPL_ALPHABET);
  },

  validateAddress(address: string): boolean {
    return /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(address);
  },

  async getBalance(address: string): Promise<BalanceResult> {
    try {
      // Routed through /api/proxy/xrpl because the XRPL altnet RPC does
      // not set CORS headers — direct browser fetches fail.
      const res = await fetch("/api/proxy/xrpl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "account_info",
          params: [{ account: address, ledger_index: "validated" }],
        }),
      });
      if (!res.ok) return { raw: 0n, formatted: "0" };
      const data = (await res.json()) as {
        result?: { account_data?: { Balance: string }; error?: string };
      };
      // actNotFound = account never funded; legitimately zero, not an error.
      if (data.result?.error === "actNotFound") {
        return { raw: 0n, formatted: "0" };
      }
      const raw = BigInt(data.result?.account_data?.Balance ?? 0);
      return { raw, formatted: formatBaseUnits(raw, META.decimals) };
    } catch {
      return { raw: 0n, formatted: "0" };
    }
  },

  async buildUnsignedTransfer({ publicKey, from, to, amount }): Promise<UnsignedTransfer> {
    const xrpl = await import("xrpl");
    const { encode, encodeForSigning } = xrpl;

    // Get current ledger sequence + account sequence (via CORS proxy).
    const accountInfo = await fetch("/api/proxy/xrpl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method: "account_info",
        params: [{ account: from, ledger_index: "validated" }],
      }),
    }).then((r) => r.json() as Promise<{
      result: { account_data: { Sequence: number } };
    }>);

    const pubkeyHex = "ED" + Array.from(publicKey).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
    const tx = {
      TransactionType: "Payment",
      Account: from,
      Destination: to,
      Amount: amount.toString(),
      Sequence: accountInfo.result.account_data.Sequence,
      Fee: "12",
      SigningPubKey: pubkeyHex,
    } as const;

    const serializedHex = encode(tx);
    const signingHex = encodeForSigning(tx);

    const hexToBytes = (h: string) => {
      const out = new Uint8Array(h.length / 2);
      for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
      return out;
    };

    return {
      serialized: hexToBytes(serializedHex),
      signingPayload: hexToBytes(signingHex),
      fee: 12n,
    };
  },

  async attachSignature({ unsigned, publicKey, signature }): Promise<SignedTransfer> {
    void publicKey;
    const xrpl = await import("xrpl");
    const { decode, encode } = xrpl;
    const bytesToHex = (b: Uint8Array) =>
      Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
    // xrpl's encode/decode types are fairly strict; we cast through unknown
    // because the adapter operates on the canonical map shape rather than
    // the typed Transaction unions.
    const tx = decode(bytesToHex(unsigned.serialized)) as unknown as Record<string, unknown>;
    tx.TxnSignature = bytesToHex(signature);
    const out = encode(tx as unknown as Parameters<typeof encode>[0]);
    const outBytes = new Uint8Array(out.length / 2);
    for (let i = 0; i < outBytes.length; i++) outBytes[i] = parseInt(out.slice(i * 2, i * 2 + 2), 16);
    return { serialized: outBytes };
  },

  async broadcast(signed: SignedTransfer): Promise<string> {
    const hex = Array.from(signed.serialized).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
    const res = await fetch("/api/proxy/xrpl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method: "submit",
        params: [{ tx_blob: hex }],
      }),
    });
    if (!res.ok) throw new Error(`XRPL broadcast ${res.status}`);
    const data = (await res.json()) as { result?: { tx_json?: { hash?: string } } };
    return data.result?.tx_json?.hash ?? "";
  },

  explorerTxUrl(txHash: string): string {
    return `https://testnet.xrpl.org/transactions/${txHash}`;
  },

  explorerAddressUrl(address: string): string {
    return `https://testnet.xrpl.org/accounts/${address}`;
  },
};

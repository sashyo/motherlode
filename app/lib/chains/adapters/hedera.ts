// Hedera adapter.
//
// Hedera doesn't derive an account ID directly from a public key — accounts
// must be CREATED on-network (paid for by an existing account or via the
// faucet portal). We expose the "account alias" representation
// (0.0.<base32-encoded-pubkey>) which is the closest thing to a derivable
// address until an account is provisioned.
// Serialization: Protobuf.

import type {
  ChainAdapter,
  BalanceResult,
  UnsignedTransfer,
  SignedTransfer,
} from "../types";
import { CHAIN_META, formatBaseUnits } from "../registry";

const META = CHAIN_META.hedera;

export const adapter: ChainAdapter = {
  meta: META,

  async deriveAddress(publicKey: Uint8Array): Promise<string> {
    // Hedera testnet has no public faucet for alias accounts — the workflow
    // is: sign up at portal.hedera.com → get a real `0.0.XXXXX` account
    // (with HBAR) → paste the ID into NEXT_PUBLIC_HEDERA_ACCOUNT_ID. The
    // alias form is still useful for verifying the pubkey wired up
    // correctly, but it can't be used as a sender until activated.
    const account = typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_HEDERA_ACCOUNT_ID
      : undefined;
    if (account) return account;

    // Alias form: 0.0.<DER-encoded ed25519 pubkey hex>. AccountId.fromString
    // parses this back into a Key{ed25519:...} alias before submission.
    // Don't pre-wrap in protobuf — PublicKey.fromString rejects that as
    // malformed DER (sees 0x12 instead of 0x30 SEQUENCE tag).
    const DER_PREFIX = new Uint8Array([
      0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
    ]);
    const der = new Uint8Array(DER_PREFIX.length + publicKey.length);
    der.set(DER_PREFIX, 0);
    der.set(publicKey, DER_PREFIX.length);
    const hex = Array.from(der).map((b) => b.toString(16).padStart(2, "0")).join("");
    return `0.0.${hex}`;
  },

  validateAddress(address: string): boolean {
    return /^\d+\.\d+\.\d+$/.test(address) || /^\d+\.\d+\.[0-9a-fA-F]+$/.test(address);
  },

  async getBalance(address: string): Promise<BalanceResult> {
    try {
      // Two lookup paths on the Hedera mirror node:
      //   - Real account ID `0.0.<int>` → /api/v1/accounts/0.0.<int>
      //   - DER-alias `0.0.<DER-hex>`   → /api/v1/accounts?account.publickey=<DER-hex>
      // The alias path returns the auto-instantiated real account once
      // someone has sent HBAR to the alias for the first time.
      const accountIdMatch = /^\d+\.\d+\.\d+$/.test(address);
      let url: string;
      if (accountIdMatch) {
        url = `${META.endpoint}/api/v1/accounts/${address}`;
      } else if (/^\d+\.\d+\.[0-9a-fA-F]{40,}$/.test(address)) {
        const derHex = address.slice(address.lastIndexOf(".") + 1);
        url = `${META.endpoint}/api/v1/accounts?account.publickey=${derHex}`;
      } else {
        return { raw: 0n, formatted: "0" };
      }
      const res = await fetch(url);
      if (!res.ok) return { raw: 0n, formatted: "0" };
      const data = await res.json();
      const account = accountIdMatch
        ? (data as { balance?: { balance?: number } })
        : ((data as { accounts?: { balance?: { balance?: number } }[] }).accounts?.[0]);
      const raw = BigInt(account?.balance?.balance ?? 0);
      return { raw, formatted: formatBaseUnits(raw, META.decimals) };
    } catch {
      return { raw: 0n, formatted: "0" };
    }
  },

  async buildUnsignedTransfer({ from, to, amount, memo, publicKey }): Promise<UnsignedTransfer> {
    const sdk = await import("@hashgraph/sdk");
    const { TransferTransaction, AccountId, Hbar, HbarUnit, TransactionId, PublicKey } = sdk;

    const tx = new TransferTransaction()
      .addHbarTransfer(AccountId.fromString(from), Hbar.from(-Number(amount), HbarUnit.Tinybar))
      .addHbarTransfer(AccountId.fromString(to), Hbar.from(Number(amount), HbarUnit.Tinybar))
      .setTransactionId(TransactionId.generate(AccountId.fromString(from)))
      .setNodeAccountIds([AccountId.fromString("0.0.3")])
      // Default maxTransactionFee is 1 HBAR — Hedera precheck reserves the
      // FULL max + transfer amount against the payer's balance. A 1 HBAR
      // account would always fail precheck. Cap at 0.05 HBAR (5,000,000
      // tinybar); actual fee for a basic transfer is ~0.0001 HBAR so
      // there's plenty of margin.
      .setMaxTransactionFee(Hbar.from(5_000_000, HbarUnit.Tinybar));

    if (memo) tx.setTransactionMemo(memo);

    tx.freeze();

    // Capture the body bytes (what the ORK needs to sign) via signWith with
    // a recognisable placeholder. We byte-replace the placeholder in
    // attachSignature once Tide returns the real signature. The placeholder
    // is 64 bytes of 0xAB — collision-free in practice (1/256^64 chance).
    const nearPub = PublicKey.fromBytesED25519(publicKey);
    let bodyBytes: Uint8Array | null = null;
    await tx.signWith(nearPub, async (body: Uint8Array) => {
      bodyBytes = new Uint8Array(body);
      return new Uint8Array(64).fill(0xAB);
    });
    if (!bodyBytes) throw new Error("Hedera: signWith did not call recorder");

    return {
      serialized: tx.toBytes(),
      signingPayload: bodyBytes,
    };
  },

  async attachSignature({ unsigned, signature }): Promise<SignedTransfer> {
    // Find the 64-byte 0xAB placeholder in the serialized tx and overwrite
    // it with the real Tide signature. Mutating the SDK's encoded bytes
    // directly avoids re-serialization (which would re-emit the
    // placeholder) and the SDK's addSignature dedup logic.
    if (signature.length !== 64) {
      throw new Error(`Hedera: signature must be 64 bytes, got ${signature.length}`);
    }
    const buf = unsigned.serialized;
    let found = -1;
    outer: for (let i = 0; i <= buf.length - 64; i++) {
      for (let j = 0; j < 64; j++) {
        if (buf[i + j] !== 0xAB) continue outer;
      }
      found = i;
      break;
    }
    if (found < 0) throw new Error("Hedera: signature placeholder not found in serialized tx");
    const out = new Uint8Array(buf);
    out.set(signature, found);
    return { serialized: out };
  },

  async broadcast(signed: SignedTransfer): Promise<string> {
    // Submit via the server-side proxy — Hedera nodes only speak gRPC,
    // which the browser can't reach directly.
    let bin = "";
    for (let i = 0; i < signed.serialized.length; i++) {
      bin += String.fromCharCode(signed.serialized[i]);
    }
    const res = await fetch("/api/proxy/hedera", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ txBytesB64: btoa(bin) }),
    });
    const data = (await res.json()) as { txId?: string; error?: string };
    if (!res.ok || !data.txId) {
      throw new Error(`Hedera broadcast ${res.status}: ${data.error ?? "unknown"}`);
    }
    return data.txId;
  },

  explorerTxUrl(txHash: string): string {
    return `https://hashscan.io/testnet/transaction/${txHash}`;
  },

  explorerAddressUrl(address: string): string {
    return `https://hashscan.io/testnet/account/${address}`;
  },
};

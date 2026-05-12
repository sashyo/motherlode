// Aptos adapter.
//
// Address: sha3_256(publicKey || 0x00) — single Ed25519 auth key scheme.
// Serialization: BCS (Binary Canonical Serialization).

import type {
  ChainAdapter,
  BalanceResult,
  UnsignedTransfer,
  SignedTransfer,
} from "../types";
import { CHAIN_META, formatBaseUnits } from "../registry";

const META = CHAIN_META.aptos;

export const adapter: ChainAdapter = {
  meta: META,

  async deriveAddress(publicKey: Uint8Array): Promise<string> {
    const { sha3_256 } = await import("@noble/hashes/sha3.js");
    const buf = new Uint8Array(publicKey.length + 1);
    buf.set(publicKey, 0);
    buf[publicKey.length] = 0x00; // single-key Ed25519 scheme byte
    const hash = sha3_256(buf);
    return "0x" + Array.from(hash).map((b) => b.toString(16).padStart(2, "0")).join("");
  },

  validateAddress(address: string): boolean {
    return /^0x[0-9a-fA-F]{1,64}$/.test(address);
  },

  async getBalance(address: string): Promise<BalanceResult> {
    try {
      const res = await fetch(
        `${META.endpoint}/accounts/${address}/resource/0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>`,
      );
      if (!res.ok) return { raw: 0n, formatted: "0" };
      const data = (await res.json()) as { data: { coin: { value: string } } };
      const raw = BigInt(data.data.coin.value);
      return { raw, formatted: formatBaseUnits(raw, META.decimals) };
    } catch {
      return { raw: 0n, formatted: "0" };
    }
  },

  async buildUnsignedTransfer({ from, to, amount }): Promise<UnsignedTransfer> {
    const { Aptos, AptosConfig, Network, Account, Ed25519PublicKey } = await import("@aptos-labs/ts-sdk");
    const aptos = new Aptos(new AptosConfig({ network: Network.TESTNET }));

    const tx = await aptos.transaction.build.simple({
      sender: from,
      data: {
        function: "0x1::aptos_account::transfer",
        functionArguments: [to, amount.toString()],
      },
    });

    const serialized = tx.bcsToBytes();
    // Aptos signing payload is the BCS bytes of `RawTransaction` prefixed
    // with sha3_256("APTOS::RawTransaction"). The SDK exposes this via
    // generateSignedTransaction's pre-image; we recompute it.
    const { sha3_256 } = await import("@noble/hashes/sha3.js");
    const domain = sha3_256(new TextEncoder().encode("APTOS::RawTransaction"));
    const rawBytes = tx.rawTransaction.bcsToBytes();
    const signingPayload = new Uint8Array(domain.length + rawBytes.length);
    signingPayload.set(domain, 0);
    signingPayload.set(rawBytes, domain.length);

    return {
      serialized,
      signingPayload,
    };
  },

  async attachSignature({ unsigned, publicKey, signature }): Promise<SignedTransfer> {
    const {
      AccountAuthenticatorEd25519,
      Ed25519PublicKey,
      Ed25519Signature,
      Deserializer,
      RawTransaction,
      SimpleTransaction,
    } = await import("@aptos-labs/ts-sdk");

    const deser = new Deserializer(unsigned.serialized);
    const simple = SimpleTransaction.deserialize(deser);

    const auth = new AccountAuthenticatorEd25519(
      new Ed25519PublicKey(publicKey),
      new Ed25519Signature(signature),
    );
    const { generateSignedTransaction } = await import("@aptos-labs/ts-sdk");
    const submitBytes = generateSignedTransaction({
      transaction: simple,
      senderAuthenticator: auth,
    });
    return { serialized: submitBytes };
  },

  async broadcast(signed: SignedTransfer): Promise<string> {
    const res = await fetch(`${META.endpoint}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/x.aptos.signed_transaction+bcs" },
      body: signed.serialized as BodyInit,
    });
    if (!res.ok) throw new Error(`Aptos broadcast ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { hash: string };
    return data.hash;
  },

  explorerTxUrl(txHash: string): string {
    return `https://explorer.aptoslabs.com/txn/${txHash}?network=testnet`;
  },

  explorerAddressUrl(address: string): string {
    return `https://explorer.aptoslabs.com/account/${address}?network=testnet`;
  },
};

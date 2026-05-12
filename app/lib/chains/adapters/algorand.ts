// Algorand adapter.
//
// Address: base32(pubkey || sha512_256(pubkey).slice(-4)).
// Serialization: MessagePack (canonical, sorted keys).

import type {
  ChainAdapter,
  BalanceResult,
  UnsignedTransfer,
  SignedTransfer,
} from "../types";
import { CHAIN_META, formatBaseUnits } from "../registry";

const META = CHAIN_META.algorand;

export const adapter: ChainAdapter = {
  meta: META,

  async deriveAddress(publicKey: Uint8Array): Promise<string> {
    const algosdk = (await import("algosdk")).default;
    return algosdk.encodeAddress(publicKey);
  },

  validateAddress(address: string): boolean {
    return /^[A-Z2-7]{58}$/.test(address);
  },

  async getBalance(address: string): Promise<BalanceResult> {
    try {
      const res = await fetch(`${META.endpoint}/v2/accounts/${address}`);
      if (!res.ok) return { raw: 0n, formatted: "0" };
      const data = (await res.json()) as { amount: number };
      const raw = BigInt(data.amount ?? 0);
      return { raw, formatted: formatBaseUnits(raw, META.decimals) };
    } catch {
      return { raw: 0n, formatted: "0" };
    }
  },

  async buildUnsignedTransfer({ from, to, amount, memo }): Promise<UnsignedTransfer> {
    const algosdk = (await import("algosdk")).default;
    const paramsRaw = await fetch(`${META.endpoint}/v2/transactions/params`).then(
      (r) => r.json() as Promise<{
        "fee": number;
        "min-fee": number;
        "last-round": number;
        "genesis-id": string;
        "genesis-hash": string;
      }>,
    );
    // The endpoint returns `last-round` (current network round). The SDK
    // wants firstValid + lastValid; convention is firstValid = current,
    // lastValid = current + 1000 (transactions stay valid for ~50 minutes
    // at ~3 sec/round). Earlier API revisions exposed `first-round`; the
    // current Algonode response only has `last-round`.
    const currentRound = paramsRaw["last-round"];
    if (typeof currentRound !== "number") {
      throw new Error("Algorand suggested-params missing last-round");
    }
    // genesisHash arrives base64; SDK wants Uint8Array.
    const genesisBytes = Uint8Array.from(atob(paramsRaw["genesis-hash"]), (c) => c.charCodeAt(0));
    const sp = {
      fee: paramsRaw["min-fee"],
      flatFee: true,
      firstValid: currentRound,
      lastValid: currentRound + 1000,
      genesisID: paramsRaw["genesis-id"],
      genesisHash: genesisBytes,
      minFee: paramsRaw["min-fee"],
    };
    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: from,
      receiver: to,
      amount: Number(amount),
      suggestedParams: sp,
      note: memo ? new TextEncoder().encode(memo) : undefined,
    });

    const serialized = txn.toByte();
    const tag = new TextEncoder().encode("TX");
    const signingPayload = new Uint8Array(tag.length + serialized.length);
    signingPayload.set(tag, 0);
    signingPayload.set(serialized, tag.length);

    return {
      serialized,
      signingPayload,
      fee: BigInt(sp.fee),
      txHashPreview: txn.txID(),
    };
  },

  async attachSignature({ unsigned, signature }): Promise<SignedTransfer> {
    // Algorand's broadcast endpoint expects a SIGNED transaction:
    // msgpack({ sig: <64-byte sig>, txn: <txn map> }). The bare unsigned
    // bytes (which have a top-level "amt" field) get rejected with
    // "no matching struct field for amt" because that's only valid
    // inside the nested "txn" map of a signed envelope.
    const algosdk = await import("algosdk");
    const txn = algosdk.decodeUnsignedTransaction(unsigned.serialized);
    const signed = new algosdk.SignedTransaction({ txn, sig: signature });
    return { serialized: algosdk.encodeMsgpack(signed) };
  },

  async broadcast(signed: SignedTransfer): Promise<string> {
    const res = await fetch(`${META.endpoint}/v2/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/x-binary" },
      body: signed.serialized as BodyInit,
    });
    if (!res.ok) throw new Error(`Algorand broadcast ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { txId: string };
    return data.txId;
  },

  explorerTxUrl(txHash: string): string {
    return `https://testnet.explorer.perawallet.app/tx/${txHash}/`;
  },

  explorerAddressUrl(address: string): string {
    return `https://testnet.explorer.perawallet.app/address/${address}/`;
  },
};

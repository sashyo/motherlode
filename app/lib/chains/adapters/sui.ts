// Sui adapter.
//
// Address: blake2b256(0x00 || publicKey)[:32] — flag byte 0x00 = Ed25519.
// Serialization: BCS (Sui Move framework).
//
// Transaction building bypasses @mysten/sui v2's BaseClient by calling
// JSON-RPC directly for the dependencies (gas coin + ref gas price) and
// then constructing a Transaction with explicit gas configuration.
// This avoids the v2 client-extensions plumbing while still producing
// canonically-valid PTB bytes.

import type {
  ChainAdapter,
  BalanceResult,
  UnsignedTransfer,
  SignedTransfer,
} from "../types";
import { CHAIN_META, formatBaseUnits } from "../registry";

const META = CHAIN_META.sui;

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(META.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = (await res.json()) as { result?: T; error?: { message?: string } };
  if (json.error) throw new Error(`Sui RPC: ${json.error.message ?? "unknown"}`);
  return json.result as T;
}

type SuiCoin = {
  coinObjectId: string;
  version: string;
  digest: string;
  balance: string;
};

export const adapter: ChainAdapter = {
  meta: META,

  async deriveAddress(publicKey: Uint8Array): Promise<string> {
    const { blake2b } = await import("@noble/hashes/blake2.js");
    const buf = new Uint8Array(publicKey.length + 1);
    buf[0] = 0x00; // Ed25519 sig flag
    buf.set(publicKey, 1);
    const hash = blake2b(buf, { dkLen: 32 });
    return "0x" + Array.from(hash).map((b) => b.toString(16).padStart(2, "0")).join("");
  },

  validateAddress(address: string): boolean {
    return /^0x[0-9a-fA-F]{64}$/.test(address);
  },

  async getBalance(address: string): Promise<BalanceResult> {
    try {
      const res = await rpc<{ totalBalance: string }>("suix_getBalance", [address]);
      const raw = BigInt(res.totalBalance);
      return { raw, formatted: formatBaseUnits(raw, META.decimals) };
    } catch {
      return { raw: 0n, formatted: "0" };
    }
  },

  async buildUnsignedTransfer({ from, to, amount }): Promise<UnsignedTransfer> {
    const { Transaction } = await import("@mysten/sui/transactions");

    // 1. Find a SUI coin big enough to cover both the transfer and gas.
    type CoinsPage = { data: SuiCoin[] };
    const coinsPage = await rpc<CoinsPage>("suix_getCoins", [
      from,
      "0x2::sui::SUI",
      null,
      10,
    ]);
    if (!coinsPage.data || coinsPage.data.length === 0) {
      throw new Error("Sui: no SUI coins on this account — fund it first");
    }
    // Pick the largest coin as gas payer + transfer source.
    const gasCoin = [...coinsPage.data].sort((a, b) =>
      BigInt(b.balance) > BigInt(a.balance) ? 1 : -1,
    )[0];

    // 2. Reference gas price.
    const refGasPriceStr = await rpc<string>("suix_getReferenceGasPrice", []);
    const refGasPrice = BigInt(refGasPriceStr);
    const gasBudget = 10_000_000n; // 0.01 SUI — comfortable for a basic transfer

    if (BigInt(gasCoin.balance) < amount + gasBudget) {
      throw new Error(
        `Sui: gas coin balance ${gasCoin.balance} < amount ${amount} + budget ${gasBudget}`,
      );
    }

    // 3. Build the PTB.
    const tx = new Transaction();
    tx.setSender(from);
    tx.setGasOwner(from);
    tx.setGasPayment([{
      objectId: gasCoin.coinObjectId,
      version: gasCoin.version,
      digest: gasCoin.digest,
    }]);
    tx.setGasBudget(gasBudget);
    tx.setGasPrice(refGasPrice);

    const [transferCoin] = tx.splitCoins(tx.gas, [amount]);
    tx.transferObjects([transferCoin], to);

    // build() without a client works because every gas/sender field is explicit.
    const serialized = await tx.build();

    // 4. Signing payload: blake2b256([intent_scope=TX, version=0, app=Sui] || tx_bytes).
    //    Sui signs the digest of the intent-prefixed BCS-serialized
    //    TransactionData, not the bytes themselves.
    const { blake2b } = await import("@noble/hashes/blake2.js");
    const intent = new Uint8Array([0, 0, 0]);
    const intentMsg = new Uint8Array(intent.length + serialized.length);
    intentMsg.set(intent, 0);
    intentMsg.set(serialized, intent.length);
    const signingPayload = blake2b(intentMsg, { dkLen: 32 });

    return { serialized, signingPayload, fee: gasBudget };
  },

  async attachSignature({ unsigned, publicKey, signature }): Promise<SignedTransfer> {
    // Sui signature blob = flag(0x00 = Ed25519) || sig(64) || pubkey(32),
    // base64-encoded for the RPC call. We stash the base64 in `txHash` so
    // broadcast() can pair it with the tx bytes.
    const sigBlob = new Uint8Array(1 + 64 + 32);
    sigBlob[0] = 0x00;
    sigBlob.set(signature, 1);
    sigBlob.set(publicKey, 65);
    let bin = "";
    for (let i = 0; i < sigBlob.length; i++) bin += String.fromCharCode(sigBlob[i]);
    return {
      serialized: unsigned.serialized,
      txHash: btoa(bin),
    };
  },

  async broadcast(signed: SignedTransfer): Promise<string> {
    if (!signed.txHash) throw new Error("Sui: missing signature blob");
    let txBin = "";
    for (let i = 0; i < signed.serialized.length; i++) {
      txBin += String.fromCharCode(signed.serialized[i]);
    }
    const txB64 = btoa(txBin);

    const result = await rpc<{ digest: string }>("sui_executeTransactionBlock", [
      txB64,
      [signed.txHash],
      { showEffects: false, showEvents: false, showInput: false, showRawInput: false, showObjectChanges: false, showBalanceChanges: false },
      "WaitForLocalExecution",
    ]);
    return result.digest;
  },

  explorerTxUrl(txHash: string): string {
    return `https://suiscan.xyz/testnet/tx/${txHash}`;
  },

  explorerAddressUrl(address: string): string {
    return `https://suiscan.xyz/testnet/account/${address}`;
  },
};

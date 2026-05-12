// TON adapter.
//
// Address: derived from a wallet contract state-init (v4R2) parameterised by
// the public key. Format: "EQ..." (mainnet bounceable) or "kQ..." (testnet
// bounceable). We use TON's standard wallet-v4r2 contract layout.
// Serialization: Cell BoC (Bag of Cells).

import type {
  ChainAdapter,
  BalanceResult,
  UnsignedTransfer,
  SignedTransfer,
} from "../types";
import { CHAIN_META, formatBaseUnits } from "../registry";

const META = CHAIN_META.ton;

export const adapter: ChainAdapter = {
  meta: META,

  async deriveAddress(publicKey: Uint8Array): Promise<string> {
    const { WalletContractV4 } = await import("@ton/ton");
    const wallet = WalletContractV4.create({
      workchain: 0,
      publicKey: Buffer.from(publicKey),
    });
    return wallet.address.toString({ testOnly: true, bounceable: false });
  },

  validateAddress(address: string): boolean {
    return /^[0EUkQ][A-Za-z0-9_-]{47,48}$/.test(address) || /^-?\d+:[0-9a-fA-F]{64}$/.test(address);
  },

  async getBalance(address: string): Promise<BalanceResult> {
    try {
      const res = await fetch(`${META.endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getAddressBalance",
          params: { address },
        }),
      });
      if (!res.ok) return { raw: 0n, formatted: "0" };
      const data = (await res.json()) as { result?: string };
      const raw = BigInt(data.result ?? 0);
      return { raw, formatted: formatBaseUnits(raw, META.decimals) };
    } catch {
      return { raw: 0n, formatted: "0" };
    }
  },

  async buildUnsignedTransfer({ publicKey, to, amount, memo }): Promise<UnsignedTransfer> {
    const { WalletContractV4, internal, beginCell } = await import("@ton/ton");
    const { Address, SendMode } = await import("@ton/core");

    const wallet = WalletContractV4.create({
      workchain: 0,
      publicKey: Buffer.from(publicKey),
    });

    const transfer = wallet.createTransfer({
      seqno: 0,
      secretKey: Buffer.alloc(64), // placeholder — we sign externally
      messages: [
        internal({
          to: Address.parse(to),
          value: amount,
          body: memo ? beginCell().storeUint(0, 32).storeStringTail(memo).endCell() : undefined,
          bounce: false,
        }),
      ],
      sendMode: SendMode.PAY_GAS_SEPARATELY,
    });

    const cellBytes = transfer.toBoc();
    // For TON wallet-v4 the payload signed is the hash of the inner message
    // cell (without the 64-byte signature prefix). Simplified approximation
    // returned here as the full BoC; production should extract the signing
    // cell and hash it.
    return {
      serialized: new Uint8Array(cellBytes),
      signingPayload: new Uint8Array(cellBytes),
    };
  },

  async attachSignature({ unsigned, signature }): Promise<SignedTransfer> {
    const out = new Uint8Array(unsigned.serialized.length + 64);
    out.set(signature, 0);
    out.set(unsigned.serialized, 64);
    return { serialized: out };
  },

  async broadcast(signed: SignedTransfer): Promise<string> {
    const b64 = btoa(String.fromCharCode(...signed.serialized));
    const res = await fetch(`${META.endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "sendBoc",
        params: { boc: b64 },
      }),
    });
    if (!res.ok) throw new Error(`TON broadcast ${res.status}`);
    const data = (await res.json()) as { result?: { hash: string } };
    return data.result?.hash ?? "";
  },

  explorerTxUrl(txHash: string): string {
    return `https://testnet.tonscan.org/tx/${txHash}`;
  },

  explorerAddressUrl(address: string): string {
    return `https://testnet.tonscan.org/address/${address}`;
  },
};

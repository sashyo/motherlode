// Stellar adapter.
//
// Address: StrKey "G..." — base32(0x30 || pubkey || crc16(0x30||pubkey)).
// Serialization: XDR (Stellar's typed binary format).

import type {
  ChainAdapter,
  BalanceResult,
  UnsignedTransfer,
  SignedTransfer,
} from "../types";
import { CHAIN_META, formatBaseUnits } from "../registry";

const META = CHAIN_META.stellar;

export const adapter: ChainAdapter = {
  meta: META,

  async deriveAddress(publicKey: Uint8Array): Promise<string> {
    const { StrKey } = await import("@stellar/stellar-sdk");
    return StrKey.encodeEd25519PublicKey(Buffer.from(publicKey));
  },

  validateAddress(address: string): boolean {
    return /^G[A-Z2-7]{55}$/.test(address);
  },

  async getBalance(address: string): Promise<BalanceResult> {
    try {
      const res = await fetch(`${META.endpoint}/accounts/${address}`);
      if (!res.ok) return { raw: 0n, formatted: "0" };
      const data = (await res.json()) as { balances: { asset_type: string; balance: string }[] };
      const native = data.balances.find((b) => b.asset_type === "native");
      if (!native) return { raw: 0n, formatted: "0" };
      // Stellar API returns balance as decimal string; convert to stroops.
      const [intPart, fracPart = ""] = native.balance.split(".");
      const padded = fracPart.padEnd(META.decimals, "0").slice(0, META.decimals);
      const raw = BigInt(intPart + padded);
      return { raw, formatted: formatBaseUnits(raw, META.decimals) };
    } catch {
      return { raw: 0n, formatted: "0" };
    }
  },

  async buildUnsignedTransfer({ publicKey, from, to, amount, memo }): Promise<UnsignedTransfer> {
    const sdk = await import("@stellar/stellar-sdk");
    const {
      Networks, TransactionBuilder, Operation, Asset, Memo, Keypair,
    } = sdk;
    const Server = sdk.Horizon.Server;
    const server = new Server(META.endpoint);

    const account = await server.loadAccount(from);
    const builder = new TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: Networks.TESTNET,
    }).addOperation(
      Operation.payment({
        destination: to,
        asset: Asset.native(),
        // Stellar amount is decimal XLM string, not stroops.
        amount: formatBaseUnits(amount, META.decimals),
      }),
    );
    if (memo) builder.addMemo(Memo.text(memo.slice(0, 28)));
    const tx = builder.setTimeout(180).build();

    const signingPayload = tx.hash();
    const xdrBuf = tx.toEnvelope().toXDR() as unknown as Buffer;
    return {
      serialized: new Uint8Array(xdrBuf),
      signingPayload: new Uint8Array(signingPayload),
      fee: 100n,
      txHashPreview: signingPayload.toString("hex"),
    };
  },

  async attachSignature({ unsigned, publicKey, signature }): Promise<SignedTransfer> {
    const sdk = await import("@stellar/stellar-sdk");
    const { TransactionBuilder, Networks, xdr, Keypair } = sdk;
    const xdrB64 = Buffer.from(unsigned.serialized).toString("base64");
    const tx = TransactionBuilder.fromXDR(xdrB64, Networks.TESTNET);
    const kp = Keypair.fromPublicKey(
      sdk.StrKey.encodeEd25519PublicKey(Buffer.from(publicKey)),
    );
    const hint = kp.signatureHint();
    const decoratedSig = new xdr.DecoratedSignature({
      hint,
      signature: Buffer.from(signature),
    });
    tx.signatures.push(decoratedSig);
    const out = tx.toEnvelope().toXDR() as unknown as Buffer;
    return { serialized: new Uint8Array(out) };
  },

  async broadcast(signed: SignedTransfer): Promise<string> {
    const sdk = await import("@stellar/stellar-sdk");
    const { TransactionBuilder, Networks } = sdk;
    const Server = sdk.Horizon.Server;
    const server = new Server(META.endpoint);
    const xdrB64 = Buffer.from(signed.serialized).toString("base64");
    const tx = TransactionBuilder.fromXDR(xdrB64, Networks.TESTNET);
    const res = await server.submitTransaction(tx);
    return res.hash;
  },

  explorerTxUrl(txHash: string): string {
    return `https://stellar.expert/explorer/testnet/tx/${txHash}`;
  },

  explorerAddressUrl(address: string): string {
    return `https://stellar.expert/explorer/testnet/account/${address}`;
  },
};

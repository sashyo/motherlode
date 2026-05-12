// Cosmos Hub adapter (theta testnet).
//
// NOTE: Default Cosmos accounts use Secp256k1; Ed25519 is the validator-key
// scheme. We still derive an account-style bech32 address from the realm
// Ed25519 pubkey (sha256 → take first 20 bytes → bech32("cosmos", ...)),
// which is well-defined; it just won't authenticate against the chain
// because Cosmos accounts created from Ed25519 pubkeys aren't the standard
// path. Surfacing it for parity with the Ed25519-curve theme.
// Serialization: Protobuf (sdk.Tx with TxBody/AuthInfo/Signatures).

import type {
  ChainAdapter,
  BalanceResult,
  UnsignedTransfer,
  SignedTransfer,
} from "../types";
import { CHAIN_META, formatBaseUnits } from "../registry";

const META = CHAIN_META.cosmos;

export const adapter: ChainAdapter = {
  meta: META,

  async deriveAddress(publicKey: Uint8Array): Promise<string> {
    const { sha256 } = await import("@noble/hashes/sha2.js");
    const { bech32 } = await import("@scure/base");
    const id = sha256(publicKey).slice(0, 20);
    return bech32.encode("cosmos", bech32.toWords(id));
  },

  validateAddress(address: string): boolean {
    return /^cosmos1[0-9a-z]{38,58}$/.test(address);
  },

  async getBalance(address: string): Promise<BalanceResult> {
    try {
      const res = await fetch(
        `https://rest.sentry-01.theta-testnet.polypore.xyz/cosmos/bank/v1beta1/balances/${address}`,
      );
      if (!res.ok) return { raw: 0n, formatted: "0" };
      const data = (await res.json()) as { balances: { denom: string; amount: string }[] };
      const native = data.balances.find((b) => b.denom === "uatom");
      const raw = BigInt(native?.amount ?? 0);
      return { raw, formatted: formatBaseUnits(raw, META.decimals) };
    } catch {
      return { raw: 0n, formatted: "0" };
    }
  },

  async buildUnsignedTransfer({ from, to, amount }): Promise<UnsignedTransfer> {
    const { Registry } = await import("@cosmjs/proto-signing");
    const { defaultRegistryTypes } = await import("@cosmjs/stargate");
    const { TxBody, AuthInfo, Fee, SignerInfo } = await import("cosmjs-types/cosmos/tx/v1beta1/tx");
    const { MsgSend } = await import("cosmjs-types/cosmos/bank/v1beta1/tx");
    const { SignMode } = await import("cosmjs-types/cosmos/tx/signing/v1beta1/signing");
    const { PubKey } = await import("cosmjs-types/cosmos/crypto/ed25519/keys");

    const registry = new Registry(defaultRegistryTypes);
    const sendMsg = MsgSend.fromPartial({
      fromAddress: from,
      toAddress: to,
      amount: [{ denom: "uatom", amount: amount.toString() }],
    });
    const txBody = TxBody.fromPartial({
      messages: [
        { typeUrl: "/cosmos.bank.v1beta1.MsgSend", value: MsgSend.encode(sendMsg).finish() },
      ],
    });
    const txBodyBytes = TxBody.encode(txBody).finish();

    const pubKey = PubKey.fromPartial({ key: undefined });
    // Build auth info with placeholder pubkey & sequence — real values would
    // come from /cosmos/auth/v1beta1/accounts/{address}.
    const authInfoBytes = AuthInfo.encode(
      AuthInfo.fromPartial({
        signerInfos: [
          {
            modeInfo: { single: { mode: SignMode.SIGN_MODE_DIRECT } },
            sequence: 0n,
          },
        ],
        fee: Fee.fromPartial({
          amount: [{ denom: "uatom", amount: "200" }],
          gasLimit: 200000n,
        }),
      }),
    ).finish();

    const { SignDoc } = await import("cosmjs-types/cosmos/tx/v1beta1/tx");
    const signDoc = SignDoc.fromPartial({
      bodyBytes: txBodyBytes,
      authInfoBytes,
      chainId: "theta-testnet-001",
      accountNumber: 0n,
    });
    const signingPayload = SignDoc.encode(signDoc).finish();

    return {
      serialized: signingPayload,
      signingPayload,
      fee: 200n,
    };
  },

  async attachSignature(): Promise<SignedTransfer> {
    throw new Error(
      "Cosmos signature attachment requires building a TxRaw with the Tide-signed bytes. " +
      "Wire Tide threshold signing to complete this path.",
    );
  },

  async broadcast(): Promise<string> {
    throw new Error("Cosmos broadcast unavailable until signature attachment is wired");
  },

  explorerTxUrl(txHash: string): string {
    return `https://explorer.theta-testnet.polypore.xyz/transactions/${txHash}`;
  },

  explorerAddressUrl(address: string): string {
    return `https://explorer.theta-testnet.polypore.xyz/accounts/${address}`;
  },
};

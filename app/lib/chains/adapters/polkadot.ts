// Polkadot/Westend adapter.
//
// Address: SS58 with network prefix 42 (Westend testnet) or 0 (Polkadot mainnet).
// Format: base58check(prefix || pubkey || blake2b(SS58_PREFIX || prefix || pubkey)[:2]).
// Serialization: SCALE (Substrate's compact encoding).

import type {
  ChainAdapter,
  BalanceResult,
  UnsignedTransfer,
  SignedTransfer,
} from "../types";
import { CHAIN_META, formatBaseUnits } from "../registry";

const META = CHAIN_META.polkadot;
// Paseo uses prefix 0 (same as Polkadot mainnet); Westend used 42.
// The faucet at faucet.polkadot.io routes by network selection, not prefix.
const SS58_PREFIX = 0;

// ApiPromise.create downloads ~200KB of runtime metadata. Cache the
// instance so only the first call pays that cost; later calls reuse the
// open WebSocket. The cache is module-scoped → shared across the page.
let _apiPromise: Promise<unknown> | null = null;

async function getApi() {
  if (_apiPromise) return _apiPromise;
  _apiPromise = (async () => {
    const { ApiPromise, WsProvider } = await import("@polkadot/api");
    const provider = new WsProvider(META.endpoint);
    return ApiPromise.create({ provider });
  })();
  // Evict on failure so the next call retries.
  _apiPromise.catch(() => {
    _apiPromise = null;
  });
  return _apiPromise;
}

export const adapter: ChainAdapter = {
  meta: META,

  async deriveAddress(publicKey: Uint8Array): Promise<string> {
    const { encodeAddress } = await import("@polkadot/util-crypto");
    return encodeAddress(publicKey, SS58_PREFIX);
  },

  validateAddress(address: string): boolean {
    return /^[1-9A-HJ-NP-Za-km-z]{45,50}$/.test(address);
  },

  async getBalance(address: string): Promise<BalanceResult> {
    try {
      // 12s timeout — Paseo nodes occasionally hang the WS handshake.
      const api = (await Promise.race([
        getApi(),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error("timeout")), 12000),
        ),
      ])) as Awaited<ReturnType<typeof getApi>>;
      const result = await (api as { query: { system: { account: (a: string) => Promise<unknown> } } })
        .query.system.account(address);
      const data = (result as { toJSON: () => unknown }).toJSON() as
        { data?: { free?: string | number } } | null;
      const raw = BigInt(data?.data?.free ?? 0);
      return { raw, formatted: formatBaseUnits(raw, META.decimals) };
    } catch {
      return { raw: 0n, formatted: "0" };
    }
  },

  async buildUnsignedTransfer({ from, to, amount }): Promise<UnsignedTransfer> {
    const { ApiPromise, WsProvider } = await import("@polkadot/api");
    const provider = new WsProvider(META.endpoint);
    const api = await ApiPromise.create({ provider });

    const call = api.tx.balances.transferKeepAlive(to, amount);
    // Construct signing payload via Substrate's "ExtrinsicPayload".
    const nonce = (await api.rpc.system.accountNextIndex(from)).toNumber();
    const blockHash = await api.rpc.chain.getBlockHash();
    const blockNumberRaw = await api.rpc.chain.getHeader(blockHash);
    const blockNumber = blockNumberRaw.number.toNumber();
    const era = api.createType("ExtrinsicEra", { current: blockNumber, period: 64 });

    const payload = api.createType("ExtrinsicPayload", {
      method: call.method.toHex(),
      nonce,
      genesisHash: api.genesisHash,
      blockHash,
      era,
      specVersion: api.runtimeVersion.specVersion,
      transactionVersion: api.runtimeVersion.transactionVersion,
      tip: 0,
    }, { version: 4 });

    const signingPayload = payload.toU8a({ method: true });
    const serialized = call.toU8a();
    await api.disconnect();
    return { serialized, signingPayload };
  },

  async attachSignature(): Promise<SignedTransfer> {
    // Substrate signature attachment requires reconstructing the extrinsic
    // from the API instance. This is a non-trivial protocol step that
    // depends on a live api connection at sign-time.
    throw new Error(
      "Polkadot signature attachment requires a live ApiPromise at sign time. " +
      "Wire Tide threshold signing into ChainContext to complete this path.",
    );
  },

  async broadcast(): Promise<string> {
    throw new Error("Polkadot broadcast unavailable until signature attachment is wired");
  },

  explorerTxUrl(txHash: string): string {
    return `https://paseo.subscan.io/extrinsic/${txHash}`;
  },

  explorerAddressUrl(address: string): string {
    return `https://paseo.subscan.io/account/${address}`;
  },
};

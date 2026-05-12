// Chain registry. SDK-free metadata + lazy adapter loaders.
//
// Each adapter import is wrapped in a function so webpack code-splits it
// into its own chunk. A chain's SDK only enters the bundle once that chain
// is selected.

import type { ChainAdapter, ChainAdapterLoader, ChainId, ChainMeta } from "./types";

// Endpoints default to public testnets so the deterministic-seed-derived
// accounts (see seed.ts) can be used safely. Override per chain via env vars
// of the form NEXT_PUBLIC_RPC_<CHAIN>.
const env = (k: string): string | undefined =>
  typeof process !== "undefined" ? process.env[k] : undefined;

export const CHAIN_META: Record<ChainId, ChainMeta> = {
  solana: {
    id: "solana",
    name: "Solana",
    nativeSymbol: "SOL",
    decimals: 9,
    baseUnit: "lamports",
    scheme: "ed25519",
    serialization: "Borsh / compact-array",
    color: "#c6ff3a",
    network: "testnet",
    endpoint: env("NEXT_PUBLIC_RPC_SOLANA") ?? "https://api.devnet.solana.com",
    faucet: "https://faucet.solana.com",
    implemented: true,
  },
  stellar: {
    id: "stellar",
    name: "Stellar",
    nativeSymbol: "XLM",
    decimals: 7,
    baseUnit: "stroops",
    scheme: "ed25519",
    serialization: "XDR",
    color: "#00f0ff",
    network: "testnet",
    endpoint: env("NEXT_PUBLIC_RPC_STELLAR") ?? "https://horizon-testnet.stellar.org",
    faucet: "https://laboratory.stellar.org/#account-creator?network=test",
    implemented: true,
  },
  algorand: {
    id: "algorand",
    name: "Algorand",
    nativeSymbol: "ALGO",
    decimals: 6,
    baseUnit: "microAlgos",
    scheme: "ed25519",
    serialization: "MessagePack",
    color: "#ffb400",
    network: "testnet",
    endpoint: env("NEXT_PUBLIC_RPC_ALGORAND") ?? "https://testnet-api.algonode.cloud",
    faucet: "https://bank.testnet.algorand.network/",
    implemented: true,
  },
  near: {
    id: "near",
    name: "NEAR Protocol",
    nativeSymbol: "NEAR",
    decimals: 24,
    baseUnit: "yoctoNEAR",
    scheme: "ed25519",
    serialization: "Borsh",
    color: "#7e8cff",
    network: "testnet",
    endpoint: env("NEXT_PUBLIC_RPC_NEAR") ?? "https://rpc.testnet.near.org",
    faucet: "https://near-faucet.io",
    implemented: true,
  },
  aptos: {
    id: "aptos",
    name: "Aptos",
    nativeSymbol: "APT",
    decimals: 8,
    baseUnit: "octa",
    scheme: "ed25519",
    serialization: "BCS",
    color: "#00d8c8",
    network: "testnet",
    endpoint: env("NEXT_PUBLIC_RPC_APTOS") ?? "https://api.testnet.aptoslabs.com/v1",
    faucet: "https://aptos.dev/network/faucet",
    implemented: true,
  },
  sui: {
    id: "sui",
    name: "Sui",
    nativeSymbol: "SUI",
    decimals: 9,
    baseUnit: "MIST",
    scheme: "ed25519",
    serialization: "BCS",
    color: "#4ca2ff",
    network: "testnet",
    endpoint: env("NEXT_PUBLIC_RPC_SUI") ?? "https://fullnode.testnet.sui.io",
    faucet: "https://discord.com/channels/916379725201563759/1037811694564560966",
    implemented: true,
  },
  ton: {
    id: "ton",
    name: "TON",
    nativeSymbol: "TON",
    decimals: 9,
    baseUnit: "nanotons",
    scheme: "ed25519",
    serialization: "Cell BoC",
    color: "#3aaaff",
    network: "testnet",
    endpoint: env("NEXT_PUBLIC_RPC_TON") ?? "https://testnet.toncenter.com/api/v2/jsonRPC",
    faucet: "https://t.me/testgiver_ton_bot",
    implemented: true,
  },
  xrpl: {
    id: "xrpl",
    name: "XRP Ledger",
    nativeSymbol: "XRP",
    decimals: 6,
    baseUnit: "drops",
    scheme: "ed25519",
    serialization: "XRPL binary",
    color: "#cccccc",
    network: "testnet",
    endpoint: env("NEXT_PUBLIC_RPC_XRPL") ?? "wss://s.altnet.rippletest.net:51233",
    faucet: "https://test.xrpfaucet.io/",
    implemented: true,
  },
  hedera: {
    id: "hedera",
    name: "Hedera",
    nativeSymbol: "HBAR",
    decimals: 8,
    baseUnit: "tinybar",
    scheme: "ed25519",
    serialization: "Protobuf",
    color: "#9d9bff",
    network: "testnet",
    endpoint: env("NEXT_PUBLIC_RPC_HEDERA") ?? "https://testnet.mirrornode.hedera.com",
    faucet: "https://portal.hedera.com/",
    implemented: true,
  },
  polkadot: {
    id: "polkadot",
    name: "Polkadot (Paseo)",
    nativeSymbol: "PAS",
    decimals: 10, // Paseo PAS uses 10 decimals (Westend WND used 12)
    baseUnit: "Planck",
    scheme: "ed25519",
    serialization: "SCALE",
    color: "#ff2bd6",
    network: "testnet",
    // Paseo is the active Substrate testnet (Westend was deprecated 2024-2025).
    // dotters.network is currently healthy; ibp.network has been flaky.
    // Fallbacks: wss://paseo.rpc.amforc.com
    endpoint: env("NEXT_PUBLIC_RPC_POLKADOT") ?? "wss://paseo.dotters.network",
    faucet: "https://faucet.polkadot.io/",
    implemented: true,
  },
  tezos: {
    id: "tezos",
    name: "Tezos",
    nativeSymbol: "tez",
    decimals: 6,
    baseUnit: "mutez",
    scheme: "ed25519",
    serialization: "Michelson forge",
    color: "#a855f7",
    network: "testnet",
    endpoint: env("NEXT_PUBLIC_RPC_TEZOS") ?? "https://ghostnet.ecadinfra.com",
    faucet: "https://faucet.ghostnet.teztnets.com/",
    implemented: true,
  },
  cosmos: {
    id: "cosmos",
    name: "Cosmos Hub",
    nativeSymbol: "ATOM",
    decimals: 6,
    baseUnit: "uatom",
    scheme: "ed25519",
    serialization: "Protobuf / Amino",
    color: "#aaaaff",
    network: "testnet",
    endpoint: env("NEXT_PUBLIC_RPC_COSMOS") ?? "https://rpc.sentry-01.theta-testnet.polypore.xyz",
    faucet: "https://discord.com/invite/cosmosnetwork",
    implemented: true,
  },
  cardano: {
    id: "cardano",
    name: "Cardano",
    nativeSymbol: "ADA",
    decimals: 6,
    baseUnit: "lovelace",
    scheme: "ed25519-bip32",
    serialization: "CBOR",
    color: "#0033ad",
    network: "testnet",
    // Koios is free and key-less; Blockfrost requires a project ID. Override
    // with NEXT_PUBLIC_RPC_CARDANO if you want to use Blockfrost — then also
    // set NEXT_PUBLIC_BLOCKFROST_PROJECT_ID for auth.
    endpoint: env("NEXT_PUBLIC_RPC_CARDANO") ?? "https://preprod.koios.rest/api/v1",
    faucet: "https://docs.cardano.org/cardano-testnets/tools/faucet/",
    implemented: true,
  },
  iota: {
    id: "iota",
    name: "IOTA",
    nativeSymbol: "IOTA",
    decimals: 6,
    baseUnit: "micro",
    scheme: "ed25519",
    serialization: "binary",
    color: "#00b6ff",
    network: "testnet",
    endpoint: env("NEXT_PUBLIC_RPC_IOTA") ?? "https://api.testnet.iota.cafe",
    implemented: false,
  },
  monero: {
    id: "monero",
    name: "Monero",
    nativeSymbol: "XMR",
    decimals: 12,
    baseUnit: "piconeros",
    scheme: "ed25519-custom",
    serialization: "RingCT (custom)",
    color: "#ff9d3a",
    network: "testnet",
    endpoint: env("NEXT_PUBLIC_RPC_MONERO") ?? "https://stagenet.community.rino.io:38081",
    implemented: false,
  },
  zcash: {
    id: "zcash",
    name: "Zcash",
    nativeSymbol: "ZEC",
    decimals: 8,
    baseUnit: "zatoshi",
    scheme: "ed25519",
    serialization: "Sapling/Orchard (custom)",
    color: "#f4b400",
    network: "testnet",
    endpoint: env("NEXT_PUBLIC_RPC_ZCASH") ?? "https://lwd.zcash-infra.com:9067",
    implemented: false,
  },
};

export const CHAIN_ORDER: readonly ChainId[] = [
  "solana", "stellar", "algorand", "near", "aptos", "sui",
  "ton", "xrpl", "hedera", "polkadot", "tezos", "cosmos",
  "cardano", "iota", "monero", "zcash",
];

const LOADERS: Record<ChainId, ChainAdapterLoader> = {
  solana: () => import("./adapters/solana").then((m) => m.adapter),
  stellar: () => import("./adapters/stellar").then((m) => m.adapter),
  algorand: () => import("./adapters/algorand").then((m) => m.adapter),
  near: () => import("./adapters/near").then((m) => m.adapter),
  aptos: () => import("./adapters/aptos").then((m) => m.adapter),
  sui: () => import("./adapters/sui").then((m) => m.adapter),
  ton: () => import("./adapters/ton").then((m) => m.adapter),
  xrpl: () => import("./adapters/xrpl").then((m) => m.adapter),
  hedera: () => import("./adapters/hedera").then((m) => m.adapter),
  polkadot: () => import("./adapters/polkadot").then((m) => m.adapter),
  tezos: () => import("./adapters/tezos").then((m) => m.adapter),
  cosmos: () => import("./adapters/cosmos").then((m) => m.adapter),
  cardano: () => import("./adapters/cardano").then((m) => m.adapter),
  iota: () => import("./adapters/iota").then((m) => m.adapter),
  monero: () => import("./adapters/monero").then((m) => m.adapter),
  zcash: () => import("./adapters/zcash").then((m) => m.adapter),
};

const CACHE = new Map<ChainId, Promise<ChainAdapter>>();

export function loadAdapter(id: ChainId): Promise<ChainAdapter> {
  let entry = CACHE.get(id);
  if (!entry) {
    entry = LOADERS[id]();
    CACHE.set(id, entry);
  }
  return entry;
}

export function metaFor(id: ChainId): ChainMeta {
  return CHAIN_META[id];
}

// Format a base-unit bigint into a decimal string with the chain's precision.
export function formatBaseUnits(raw: bigint, decimals: number, max = 6): string {
  if (raw === 0n) return "0";
  const neg = raw < 0n;
  const abs = neg ? -raw : raw;
  const s = abs.toString().padStart(decimals + 1, "0");
  const intPart = s.slice(0, -decimals) || "0";
  let fracPart = s.slice(-decimals).slice(0, max).replace(/0+$/, "");
  fracPart = fracPart || "0";
  const out = fracPart === "0" ? intPart : `${intPart}.${fracPart}`;
  return neg ? `-${out}` : out;
}

// Parse a human-entered decimal string into base units. Throws on malformed input.
export function parseToBaseUnits(input: string, decimals: number): bigint {
  const trimmed = input.trim();
  if (!trimmed || !/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid amount: ${input}`);
  }
  const [intPart, fracPart = ""] = trimmed.split(".");
  if (fracPart.length > decimals) {
    throw new Error(`Too many decimal places (max ${decimals})`);
  }
  const padded = fracPart.padEnd(decimals, "0");
  return BigInt(intPart + padded);
}

export type Asset = {
  symbol: string;
  name: string;
  balance: number;
  priceUsd: number;
  change24h: number;
  color: string;
  network: string;
};

export type Tx = {
  id: string;
  kind: "send" | "receive" | "swap" | "stake";
  asset: string;
  amount: number;
  usd: number;
  counterparty: string;
  timestamp: string;
  status: "confirmed" | "pending" | "failed";
  hash: string;
};

export const WALLET_ADDRESS = "0x7A29C4f3B9D1e8c7A88b4F3aE21bC9D8E0c4F1a3";

export const ASSETS: Asset[] = [
  {
    symbol: "ETH",
    name: "Ethereum",
    balance: 12.4827,
    priceUsd: 3284.12,
    change24h: 2.84,
    color: "#7e8cff",
    network: "ETH-MAINNET",
  },
  {
    symbol: "BTC",
    name: "Bitcoin",
    balance: 0.6418,
    priceUsd: 67120.55,
    change24h: 1.12,
    color: "#ffb400",
    network: "BTC",
  },
  {
    symbol: "SOL",
    name: "Solana",
    balance: 184.21,
    priceUsd: 162.07,
    change24h: -3.42,
    color: "#c6ff3a",
    network: "SOL-MAINNET",
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    balance: 8421.0,
    priceUsd: 1.0,
    change24h: 0.01,
    color: "#00f0ff",
    network: "ETH-MAINNET",
  },
  {
    symbol: "ARB",
    name: "Arbitrum",
    balance: 1240.55,
    priceUsd: 0.84,
    change24h: 5.21,
    color: "#ff2bd6",
    network: "ARBITRUM",
  },
  {
    symbol: "MATIC",
    name: "Polygon",
    balance: 3210.0,
    priceUsd: 0.51,
    change24h: -1.07,
    color: "#a855f7",
    network: "POLYGON",
  },
];

export const TRANSACTIONS: Tx[] = [
  {
    id: "tx_001",
    kind: "receive",
    asset: "ETH",
    amount: 1.25,
    usd: 4105.15,
    counterparty: "0x91b...4Fa2",
    timestamp: "2026-05-08T13:22:00Z",
    status: "confirmed",
    hash: "0xa12c4d…f9b1",
  },
  {
    id: "tx_002",
    kind: "send",
    asset: "USDC",
    amount: 540,
    usd: 540,
    counterparty: "0x3df...91Cc",
    timestamp: "2026-05-08T11:08:00Z",
    status: "confirmed",
    hash: "0x77ee2a…42d0",
  },
  {
    id: "tx_003",
    kind: "swap",
    asset: "SOL → USDC",
    amount: 12.0,
    usd: 1944.84,
    counterparty: "Jupiter v6",
    timestamp: "2026-05-08T09:51:00Z",
    status: "confirmed",
    hash: "0x9c1f8e…aa31",
  },
  {
    id: "tx_004",
    kind: "stake",
    asset: "ETH",
    amount: 4.0,
    usd: 13136.48,
    counterparty: "Lido stETH",
    timestamp: "2026-05-07T20:14:00Z",
    status: "confirmed",
    hash: "0x44b6c1…9012",
  },
  {
    id: "tx_005",
    kind: "send",
    asset: "ARB",
    amount: 250,
    usd: 210,
    counterparty: "0xab2...77Ee",
    timestamp: "2026-05-07T16:02:00Z",
    status: "pending",
    hash: "0xee18de…ab44",
  },
  {
    id: "tx_006",
    kind: "receive",
    asset: "BTC",
    amount: 0.122,
    usd: 8188.7,
    counterparty: "bc1q...7lz4",
    timestamp: "2026-05-06T22:30:00Z",
    status: "confirmed",
    hash: "0x12abcd…0098",
  },
  {
    id: "tx_007",
    kind: "send",
    asset: "MATIC",
    amount: 1000,
    usd: 510,
    counterparty: "0x88a...01bF",
    timestamp: "2026-05-06T08:45:00Z",
    status: "failed",
    hash: "0x000ff1…2200",
  },
  {
    id: "tx_008",
    kind: "swap",
    asset: "USDC → ETH",
    amount: 2000,
    usd: 2000,
    counterparty: "Uniswap v4",
    timestamp: "2026-05-05T14:11:00Z",
    status: "confirmed",
    hash: "0xbb44cc…ae12",
  },
];

export const SPARKLINE = [
  18, 22, 19, 27, 31, 28, 35, 33, 40, 38, 44, 41, 49, 53, 50, 57, 61, 58, 66,
  62, 70, 75, 72, 78, 82, 79, 86, 91, 88, 95,
];

export function totalUsd(assets: Asset[]): number {
  return assets.reduce((s, a) => s + a.balance * a.priceUsd, 0);
}

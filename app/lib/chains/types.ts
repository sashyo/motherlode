// Chain abstraction types — kept SDK-free so it can be imported anywhere
// (including Server Components for metadata-only views) without dragging
// any per-chain crypto bundle along.

export type ChainId =
  | "solana"
  | "stellar"
  | "algorand"
  | "near"
  | "aptos"
  | "sui"
  | "ton"
  | "xrpl"
  | "hedera"
  | "polkadot"
  | "tezos"
  | "cosmos"
  | "cardano"
  | "iota"
  | "monero"
  | "zcash";

export type SignatureScheme =
  | "ed25519"
  | "ed25519-bip32"
  | "ed25519-custom";

// Static, SDK-free metadata about a chain. Safe to ship in the main bundle.
export type ChainMeta = {
  id: ChainId;
  name: string;
  nativeSymbol: string;
  decimals: number;
  // Smallest unit name (lamports, stroops, drops, atto-NEAR, etc.) — surfaces in the UI.
  baseUnit: string;
  // Sig scheme used for the DEFAULT account model on this chain.
  scheme: SignatureScheme;
  // How this chain serializes its transfer transaction (used purely for UI labels).
  serialization: string;
  // Color the UI uses to brand this chain in cards, swatches, status pills.
  color: string;
  // Whether the active network is mainnet or a public testnet.
  network: "mainnet" | "testnet";
  // RPC / API endpoint used for reads + broadcast.
  endpoint: string;
  // Public testnet faucet URL, if applicable.
  faucet?: string;
  // Whether this chain is currently implemented end-to-end.
  // false adapters still derive addresses but throw on broadcast.
  implemented: boolean;
};

export type BalanceResult = {
  // Raw integer balance in base units.
  raw: bigint;
  // Human-formatted balance with decimals applied.
  formatted: string;
};

// A signer callback. Takes the chain ID + the canonical "message to be
// signed" bytes (chain-specific — for Solana it's the compiled message,
// for XRPL the prefix-tagged signing payload, etc.) and returns a 64-byte
// Ed25519 signature.
//
// The chainId is passed through so the signer can route to the matching
// Tide model ID (BasicCustom<{Chain}>:BasicCustom<1>) — the Forseti
// contract dispatches on that to pick the right per-chain validator and
// role check.
export type Signer = (args: { chainId: ChainId; message: Uint8Array }) => Promise<Uint8Array>;

// An unsigned, fully-serialized transfer transaction in chain-canonical form.
// Adapters return this from `buildUnsignedTransfer`. The caller signs the
// `signingPayload` and passes the signature back to `attachSignature`.
export type UnsignedTransfer = {
  // The full unsigned transaction bytes in chain-canonical serialization.
  // For UI display purposes (the "Send" preview).
  serialized: Uint8Array;
  // The exact bytes that must be Ed25519-signed. May be the same as
  // `serialized` (Solana) or a hashed/prefixed subset (XRPL, Stellar, etc.).
  signingPayload: Uint8Array;
  // Estimated/fixed fee in base units (best-effort).
  fee?: bigint;
  // Pre-computed transaction id/hash if the chain produces one before broadcast.
  txHashPreview?: string;
};

export type SignedTransfer = {
  // The fully-formed, broadcastable transaction bytes.
  serialized: Uint8Array;
  // Confirmation hash if the chain finalizes hash before broadcast.
  txHash?: string;
};

export interface ChainAdapter {
  readonly meta: ChainMeta;

  // Derive the chain's user-facing address from the 32-byte Ed25519 public
  // key (the realm pubkey from tidecloak.json). Pure encoding — no privkey
  // required. May still be async because some chains hash via SDK or WASM.
  deriveAddress(publicKey: Uint8Array): Promise<string>;

  // Cheap, synchronous-ish address validation. Used to gate the Send form.
  validateAddress(address: string): boolean;

  // Read the chain's native balance for an address. Returns 0n if the
  // account is unfunded / not yet visible to the indexer.
  getBalance(address: string): Promise<BalanceResult>;

  // Build a fully-serialized unsigned transfer. amount is in BASE UNITS
  // (e.g. lamports for SOL, stroops for XLM). Adapters convert as needed.
  buildUnsignedTransfer(args: {
    publicKey: Uint8Array;
    from: string;
    to: string;
    amount: bigint;
    memo?: string;
  }): Promise<UnsignedTransfer>;

  // Combine the unsigned bytes with an Ed25519 signature into a
  // broadcastable representation.
  attachSignature(args: {
    unsigned: UnsignedTransfer;
    publicKey: Uint8Array;
    signature: Uint8Array;
  }): Promise<SignedTransfer>;

  // Broadcast and return the on-chain transaction hash/id.
  broadcast(signed: SignedTransfer): Promise<string>;

  // Render an explorer URL for a tx hash. Used by the Send confirmation screen
  // and the Activity log.
  explorerTxUrl(txHash: string): string;

  // Render an explorer URL for an address. Used by Receive / Assets cards.
  explorerAddressUrl(address: string): string;
}

// Adapter loader: returns a Promise of the adapter, allowing each adapter
// (and its heavy SDK) to be code-split out of the main bundle.
export type ChainAdapterLoader = () => Promise<ChainAdapter>;

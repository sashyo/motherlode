"use client";

// Active-chain context. Tracks which chain the user is currently viewing,
// derives the per-chain address from the realm Ed25519 public key (read
// from tidecloak.json), and persists the selection across reloads.
//
// The realm pubkey is the same for everyone in this realm — i.e. all users
// of this Tidecloak realm share the same vault addresses. The matching
// private key is held threshold-style by Tide ORKs.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CHAIN_META,
  CHAIN_ORDER,
  loadAdapter,
} from "./registry";
import type {
  ChainAdapter,
  ChainId,
  ChainMeta,
  Signer,
} from "./types";
import { getRealmPublicKey } from "./realmKey";
import { createTideSigner } from "./forseti/signer";

const STORAGE_KEY = "motherlode.activeChain";

type ChainCtx = {
  activeId: ChainId;
  activeMeta: ChainMeta;
  setActive: (id: ChainId) => void;
  // Async getter — returns the cached adapter or loads it on first access.
  getAdapter: (id?: ChainId) => Promise<ChainAdapter>;
  // Async getter — derives the chain-specific address for the realm pubkey.
  getAddress: (id?: ChainId) => Promise<string>;
  // Realm Ed25519 public key (32 bytes) — stable for the lifetime of the
  // app. All chain addresses are derived from this.
  publicKey: Uint8Array;
  publicKeyKid: string;
  // Active signer — routes to Tide's ORK threshold protocol via
  // BasicCustomRequest + the multi-chain Forseti contract.
  signer: Signer;
};

const Ctx = createContext<ChainCtx | null>(null);

export function ChainProvider({ children }: { children: React.ReactNode }) {
  const realm = useMemo(() => getRealmPublicKey(), []);

  const [activeId, setActiveIdState] = useState<ChainId>("solana");

  // Restore selection on mount (client-only).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored && CHAIN_ORDER.includes(stored as ChainId)) {
        setActiveIdState(stored as ChainId);
      }
    } catch {
      // localStorage may be unavailable (private mode); ignore.
    }
  }, []);

  const setActive = useCallback((id: ChainId) => {
    setActiveIdState(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignore
    }
  }, []);

  // Address cache, keyed by chainId. Stable across renders.
  const addressCache = useRef<Map<ChainId, Promise<string>>>(new Map());

  const getAdapter = useCallback(
    (id?: ChainId) => loadAdapter(id ?? activeId),
    [activeId],
  );

  const getAddress = useCallback(
    async (id?: ChainId): Promise<string> => {
      const chainId = id ?? activeId;
      const cached = addressCache.current.get(chainId);
      if (cached) return cached;

      const promise = (async () => {
        const adapter = await loadAdapter(chainId);
        return adapter.deriveAddress(realm.bytes);
      })();

      addressCache.current.set(chainId, promise);
      promise.catch(() => addressCache.current.delete(chainId));
      return promise;
    },
    [activeId, realm.bytes],
  );

  // Tide ORK threshold signer — routes through BasicCustomRequest +
  // Forseti contract. Per-chain authorization (model ID + role) is
  // enforced inside the contract on the ORK side.
  const signer = useMemo<Signer>(() => createTideSigner(), []);

  const value = useMemo<ChainCtx>(
    () => ({
      activeId,
      activeMeta: CHAIN_META[activeId],
      setActive,
      getAdapter,
      getAddress,
      publicKey: realm.bytes,
      publicKeyKid: realm.kid,
      signer,
    }),
    [activeId, setActive, getAdapter, getAddress, realm.bytes, realm.kid, signer],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useChain(): ChainCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useChain must be used within ChainProvider");
  return ctx;
}

// Convenience hook: returns the address (and loading/error state) for a chain.
// Caches across renders via the underlying address cache.
export function useChainAddress(chainId?: ChainId): {
  address: string | null;
  loading: boolean;
  error: string | null;
} {
  const { getAddress, activeId } = useChain();
  const id = chainId ?? activeId;
  const [address, setAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getAddress(id)
      .then((addr) => {
        if (!cancelled) setAddress(addr);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, getAddress]);

  return { address, loading, error };
}

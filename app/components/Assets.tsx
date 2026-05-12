"use client";

import { useEffect, useState } from "react";
import { useChain } from "../lib/chains/ChainContext";
import { CHAIN_META, CHAIN_ORDER } from "../lib/chains/registry";
import type { ChainId } from "../lib/chains/types";

type Row = {
  id: ChainId;
  address: string | null;
  balance: string | null;
  loading: boolean;
  error: string | null;
};

export default function Assets() {
  const { setActive, getAdapter, publicKey } = useChain();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Record<ChainId, Row>>(() => {
    const init = {} as Record<ChainId, Row>;
    for (const id of CHAIN_ORDER) {
      init[id] = { id, address: null, balance: null, loading: true, error: null };
    }
    return init;
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Load each adapter and fetch its address. Balances follow.
      for (const id of CHAIN_ORDER) {
        if (cancelled) return;
        try {
          const adapter = await getAdapter(id);
          const address = await adapter.deriveAddress(publicKey);
          if (cancelled) return;
          setRows((r) => ({ ...r, [id]: { ...r[id], address, loading: true } }));
          // Balance fetch is best-effort and can fail without breaking the row.
          adapter.getBalance(address).then((bal) => {
            if (cancelled) return;
            setRows((r) => ({
              ...r,
              [id]: { ...r[id], balance: bal.formatted, loading: false },
            }));
          }).catch((err) => {
            if (cancelled) return;
            setRows((r) => ({
              ...r,
              [id]: {
                ...r[id],
                balance: "0",
                loading: false,
                error: err instanceof Error ? err.message : String(err),
              },
            }));
          });
        } catch (err) {
          if (cancelled) return;
          setRows((r) => ({
            ...r,
            [id]: {
              ...r[id],
              loading: false,
              error: err instanceof Error ? err.message : String(err),
            },
          }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getAdapter, publicKey]);

  const filtered = CHAIN_ORDER.filter((id) => {
    const m = CHAIN_META[id];
    const q = query.toLowerCase();
    return (
      !q ||
      m.name.toLowerCase().includes(q) ||
      m.nativeSymbol.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-6 space-y-6">
      <section className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-mono text-xs tracking-[0.3em] text-[var(--fg-dim)]">▣ ASSET REGISTRY</h1>
          <div className="font-mono text-2xl text-[var(--fg)] mt-1">
            <span className="glitch" data-text="Multi-chain holdings">
              Multi-chain holdings
            </span>
          </div>
          <div className="font-mono text-[10px] tracking-widest text-[var(--fg-dim)] mt-2">
            {CHAIN_ORDER.length} CHAINS · ALL ED25519-DERIVED FROM REALM PUBKEY
          </div>
        </div>
        <div className="w-72 max-w-full">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="// FILTER"
            className="input-neon"
          />
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((id) => {
          const meta = CHAIN_META[id];
          const row = rows[id];
          return (
            <div
              key={id}
              className="corner-frame bg-[var(--bg-panel)]/60 border border-[var(--border)] hover:border-[var(--border-hot)] transition-colors p-5 group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 flex items-center justify-center font-mono text-xs border-2"
                    style={{ borderColor: meta.color, color: meta.color }}
                  >
                    {meta.nativeSymbol}
                  </div>
                  <div>
                    <div className="font-mono text-sm text-[var(--fg)]">{meta.name}</div>
                    <div className="font-mono text-[10px] tracking-widest text-[var(--fg-dim)] mt-0.5">
                      {meta.serialization}
                    </div>
                  </div>
                </div>
                <div
                  className="font-mono text-[10px] tracking-widest px-1.5 py-0.5 border"
                  style={{
                    borderColor: meta.network === "mainnet" ? "var(--lime)" : "var(--amber)",
                    color: meta.network === "mainnet" ? "var(--lime)" : "var(--amber)",
                  }}
                >
                  {meta.network.toUpperCase()}
                </div>
              </div>

              <div className="mt-5 space-y-1">
                <div className="font-mono text-[10px] tracking-[0.3em] text-[var(--fg-dim)]">BALANCE</div>
                <div className="font-mono text-2xl ticker text-[var(--cyan)] glow-cyan">
                  {row.loading
                    ? "···"
                    : row.balance ?? "0"}
                  <span className="text-sm text-[var(--fg-dim)] ml-2 tracking-widest">
                    {meta.nativeSymbol}
                  </span>
                </div>
                <div className="font-mono text-[10px] tracking-widest text-[var(--fg-dim)] truncate mt-1">
                  {row.address ? `${row.address.slice(0, 16)}…${row.address.slice(-6)}` : "—"}
                </div>
                {!meta.implemented && (
                  <div className="font-mono text-[9px] tracking-widest text-[var(--rose)] mt-1">
                    ⊘ ADAPTER STUB · TX UNAVAILABLE
                  </div>
                )}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  className="btn-neon !py-2 !text-[10px]"
                  onClick={() => setActive(id)}
                  disabled={!meta.implemented}
                >
                  ACTIVATE
                </button>
                <button
                  className="btn-neon magenta !py-2 !text-[10px]"
                  onClick={() => row.address && navigator.clipboard?.writeText(row.address)}
                  disabled={!row.address}
                >
                  COPY ADDR
                </button>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

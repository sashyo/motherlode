"use client";

// Chain switcher — the wallet's primary "what chain am I on right now" control.
// Sits in the top bar, opens a panel with all 16 chains, search filter, and
// per-chain balance preview. Closes on outside-click / Escape / selection.

import { useEffect, useMemo, useRef, useState } from "react";
import { CHAIN_META, CHAIN_ORDER } from "../lib/chains/registry";
import type { ChainId } from "../lib/chains/types";
import { useChain, useChainAddress } from "../lib/chains/ChainContext";

function shortAddr(addr: string, head = 6, tail = 4): string {
  if (addr.length <= head + tail + 2) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export default function ChainSwitcher() {
  const { activeId, activeMeta, setActive } = useChain();
  const { address: activeAddress } = useChainAddress();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CHAIN_ORDER;
    return CHAIN_ORDER.filter((id) => {
      const m = CHAIN_META[id];
      return (
        m.name.toLowerCase().includes(q) ||
        m.nativeSymbol.toLowerCase().includes(q) ||
        id.includes(q)
      );
    });
  }, [query]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-3 px-3 py-1.5 border font-mono text-[11px] tracking-wider transition-colors ${
          open
            ? "border-[var(--cyan)] text-[var(--cyan)] glow-cyan"
            : "border-[var(--border)] text-[var(--fg)] hover:border-[var(--border-hot)]"
        }`}
        title="Switch chain"
      >
        <ChainSwatch color={activeMeta.color} symbol={activeMeta.nativeSymbol} />
        <span className="hidden sm:inline tracking-[0.25em]">
          {activeMeta.name.toUpperCase()}
        </span>
        <span className="hidden md:inline text-[var(--fg-dim)]">
          {activeAddress ? shortAddr(activeAddress, 5, 4) : "···"}
        </span>
        <span className="opacity-70">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[min(420px,calc(100vw-2rem))] z-30 corner-frame box-glow-cyan bg-[var(--bg-panel)]/95 border border-[var(--border-hot)] backdrop-blur">
          <div className="p-3 border-b border-[var(--border)]">
            <div className="font-mono text-[10px] tracking-[0.4em] text-[var(--fg-dim)] mb-2">
              ▣ SELECT CHAIN
            </div>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="// FILTER chain"
              className="input-neon w-full !py-1.5 !text-xs"
              spellCheck={false}
            />
          </div>
          <ul className="max-h-[60vh] overflow-y-auto divide-y divide-[var(--border)]/40">
            {filtered.map((id) => (
              <ChainRow
                key={id}
                id={id}
                active={id === activeId}
                onPick={() => {
                  setActive(id);
                  setOpen(false);
                  setQuery("");
                }}
              />
            ))}
            {filtered.length === 0 && (
              <li className="px-4 py-6 font-mono text-xs text-[var(--fg-dim)] text-center">
                ⊘ NO MATCH
              </li>
            )}
          </ul>
          <div className="p-3 border-t border-[var(--border)] flex items-center justify-between font-mono text-[9px] tracking-[0.3em] text-[var(--fg-dim)]">
            <span>{CHAIN_ORDER.length} CHAINS</span>
            <span>ED25519 / TIDE-DERIVED SEEDS</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ChainRow({
  id,
  active,
  onPick,
}: {
  id: ChainId;
  active: boolean;
  onPick: () => void;
}) {
  const meta = CHAIN_META[id];
  const { address, loading } = useChainAddress(id);

  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
          active
            ? "bg-[var(--cyan)]/10 border-l-2 border-[var(--cyan)]"
            : "border-l-2 border-transparent hover:bg-white/3 hover:border-[var(--border-hot)]"
        }`}
      >
        <ChainSwatch color={meta.color} symbol={meta.nativeSymbol} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div
              className={`font-mono text-sm ${active ? "text-[var(--cyan)]" : "text-[var(--fg)]"}`}
            >
              {meta.name}
            </div>
            <div
              className="font-mono text-[9px] tracking-widest px-1 py-px border"
              style={{
                borderColor: meta.network === "mainnet" ? "var(--lime)" : "var(--amber)",
                color: meta.network === "mainnet" ? "var(--lime)" : "var(--amber)",
              }}
            >
              {meta.network.toUpperCase()}
            </div>
            {!meta.implemented && (
              <div className="font-mono text-[9px] tracking-widest px-1 py-px border border-[var(--rose)]/60 text-[var(--rose)]">
                STUB
              </div>
            )}
          </div>
          <div className="font-mono text-[10px] tracking-widest text-[var(--fg-dim)] mt-0.5 truncate">
            {loading
              ? "DERIVING…"
              : address
                ? `${shortAddr(address, 8, 6)} · ${meta.serialization}`
                : `${meta.scheme.toUpperCase()} · ${meta.serialization}`}
          </div>
        </div>
        {active && <span className="text-[var(--cyan)] font-mono">▸</span>}
      </button>
    </li>
  );
}

function ChainSwatch({ color, symbol }: { color: string; symbol: string }) {
  return (
    <span
      className="w-9 h-9 shrink-0 flex items-center justify-center font-mono text-[10px] tracking-wider border"
      style={{ borderColor: color, color }}
    >
      {symbol.slice(0, 4)}
    </span>
  );
}

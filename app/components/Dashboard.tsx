"use client";

import { useEffect, useState } from "react";
import { SPARKLINE, TRANSACTIONS } from "../lib/mock";
import Sparkline from "./Sparkline";
import { useChain } from "../lib/chains/ChainContext";
import { CHAIN_META, CHAIN_ORDER } from "../lib/chains/registry";
import type { ChainId } from "../lib/chains/types";

export default function Dashboard({
  onNav,
}: {
  onNav: (v: "send" | "receive" | "assets" | "activity") => void;
}) {
  const { activeId, activeMeta, getAdapter, publicKey } = useChain();
  const [activeBalance, setActiveBalance] = useState<string>("···");
  const [implementedCount, setImplementedCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setActiveBalance("···");
    (async () => {
      try {
        const adapter = await getAdapter(activeId);
        const address = await adapter.deriveAddress(publicKey);
        const bal = await adapter.getBalance(address);
        if (!cancelled) setActiveBalance(bal.formatted);
      } catch {
        if (!cancelled) setActiveBalance("0");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId, getAdapter, publicKey]);

  useEffect(() => {
    setImplementedCount(CHAIN_ORDER.filter((id) => CHAIN_META[id].implemented).length);
  }, []);

  return (
    <div className="p-6 space-y-6">
      {/* Hero */}
      <section className="corner-frame box-glow-cyan scanline bg-[var(--bg-panel)]/60 p-6 lg:p-8 relative">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div>
            <div className="font-mono text-[10px] tracking-[0.4em] text-[var(--fg-dim)] mb-3">
              ▣ ACTIVE / {activeMeta.name.toUpperCase()} BALANCE
            </div>
            <div className="ticker font-mono text-5xl lg:text-6xl glow-cyan" style={{ color: activeMeta.color }}>
              {activeBalance}
              <span className="text-2xl text-[var(--fg-dim)] ml-3 tracking-widest">
                {activeMeta.nativeSymbol}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-3 font-mono text-xs">
              <span className="px-2 py-1 border border-[var(--cyan)]/50 text-[var(--cyan)]">
                {activeMeta.network.toUpperCase()}
              </span>
              <span className="text-[var(--fg-dim)] tracking-widest">{activeMeta.serialization}</span>
              <span className="text-[var(--fg-dim)]">·</span>
              <span className="text-[var(--fg-dim)] tracking-widest">{implementedCount}/{CHAIN_ORDER.length} ADAPTERS</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={() => onNav("send")} className="btn-neon magenta">
              ⇧ Transmit
            </button>
            <button onClick={() => onNav("receive")} className="btn-neon">
              ⇩ Receive
            </button>
            <button onClick={() => onNav("assets")} className="btn-neon lime">
              ◇ All Chains
            </button>
          </div>
        </div>

        <div className="mt-6">
          <Sparkline data={SPARKLINE} />
          <div className="flex justify-between mt-2 font-mono text-[10px] tracking-widest text-[var(--fg-dim)]">
            <span>30D</span>
            <span>· · ·</span>
            <span>NOW</span>
          </div>
        </div>
      </section>

      {/* Two-column lower */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 corner-frame bg-[var(--bg-panel)]/60 border border-[var(--border)] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-mono text-xs tracking-[0.3em] text-[var(--fg-dim)]">
              ▣ CHAIN MATRIX
            </h2>
            <button
              onClick={() => onNav("assets")}
              className="font-mono text-[10px] tracking-widest text-[var(--cyan)] hover:glow-cyan"
            >
              VIEW ALL ▸
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {CHAIN_ORDER.slice(0, 12).map((id) => (
              <ChainTile key={id} id={id} active={id === activeId} />
            ))}
          </div>
        </div>

        <div className="corner-frame bg-[var(--bg-panel)]/60 border border-[var(--border)] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-mono text-xs tracking-[0.3em] text-[var(--fg-dim)]">
              ▣ RECENT TX
            </h2>
            <button
              onClick={() => onNav("activity")}
              className="font-mono text-[10px] tracking-widest text-[var(--cyan)] hover:glow-cyan"
            >
              ALL ▸
            </button>
          </div>
          <ul className="space-y-3">
            {TRANSACTIONS.slice(0, 5).map((tx) => (
              <li key={tx.id} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <KindGlyph kind={tx.kind} />
                  <div className="min-w-0">
                    <div className="font-mono text-xs text-[var(--fg)] truncate">
                      {tx.kind === "swap" ? tx.asset : `${tx.kind.toUpperCase()} ${tx.asset}`}
                    </div>
                    <div className="font-mono text-[10px] tracking-widest text-[var(--fg-dim)] truncate">
                      {tx.counterparty}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <StatusPill status={tx.status} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function ChainTile({ id, active }: { id: ChainId; active: boolean }) {
  const { setActive } = useChain();
  const meta = CHAIN_META[id];
  return (
    <button
      onClick={() => setActive(id)}
      className={`p-3 border text-left transition-colors ${
        active
          ? "bg-[var(--cyan)]/10 border-[var(--cyan)] glow-cyan"
          : "border-[var(--border)] hover:border-[var(--border-hot)]"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className="w-7 h-7 flex items-center justify-center font-mono text-[10px] tracking-wider border"
          style={{ borderColor: meta.color, color: meta.color }}
        >
          {meta.nativeSymbol.slice(0, 4)}
        </span>
        <div className="font-mono text-xs text-[var(--fg)] truncate">{meta.name}</div>
      </div>
      <div className="font-mono text-[9px] tracking-widest text-[var(--fg-dim)] mt-2 truncate">
        {meta.serialization}
      </div>
    </button>
  );
}

export function KindGlyph({ kind }: { kind: "send" | "receive" | "swap" | "stake" }) {
  const map: Record<typeof kind, { ch: string; color: string }> = {
    send: { ch: "↗", color: "var(--magenta)" },
    receive: { ch: "↙", color: "var(--lime)" },
    swap: { ch: "⇄", color: "var(--cyan)" },
    stake: { ch: "◇", color: "var(--amber)" },
  };
  const m = map[kind];
  return (
    <span
      className="w-7 h-7 flex items-center justify-center border font-mono text-sm shrink-0"
      style={{ borderColor: m.color, color: m.color }}
    >
      {m.ch}
    </span>
  );
}

export function StatusPill({ status }: { status: "confirmed" | "pending" | "failed" }) {
  const map = {
    confirmed: { c: "var(--lime)", t: "CONFIRMED" },
    pending: { c: "var(--amber)", t: "PENDING" },
    failed: { c: "var(--rose)", t: "FAILED" },
  } as const;
  const m = map[status];
  return (
    <span
      className="font-mono text-[9px] tracking-[0.2em] px-1.5 py-0.5 border inline-block mt-0.5"
      style={{ borderColor: m.c, color: m.c }}
    >
      {m.t}
    </span>
  );
}

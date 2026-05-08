"use client";

import { ASSETS, SPARKLINE, TRANSACTIONS, totalUsd } from "../lib/mock";
import Sparkline from "./Sparkline";

const fmtUsd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export default function Dashboard({
  onNav,
}: {
  onNav: (v: "send" | "receive" | "assets" | "activity") => void;
}) {
  const total = totalUsd(ASSETS);
  const change = 1.84; // mocked aggregate %
  const top = [...ASSETS].sort((a, b) => b.balance * b.priceUsd - a.balance * a.priceUsd).slice(0, 4);

  return (
    <div className="p-6 space-y-6">
      {/* Hero */}
      <section className="corner-frame box-glow-cyan scanline bg-[var(--bg-panel)]/60 p-6 lg:p-8 relative">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div>
            <div className="font-mono text-[10px] tracking-[0.4em] text-[var(--fg-dim)] mb-3">
              ▣ TOTAL ASSETS / USD
            </div>
            <div className="ticker font-mono text-5xl lg:text-6xl text-[var(--cyan)] glow-cyan">
              {fmtUsd(total)}
            </div>
            <div className="mt-3 flex items-center gap-3 font-mono text-xs">
              <span
                className={`px-2 py-1 border ${
                  change >= 0
                    ? "border-[var(--lime)]/50 text-[var(--lime)]"
                    : "border-[var(--rose)]/50 text-[var(--rose)]"
                }`}
              >
                {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%
              </span>
              <span className="text-[var(--fg-dim)] tracking-widest">24H</span>
              <span className="text-[var(--fg-dim)]">·</span>
              <span className="text-[var(--fg-dim)] tracking-widest">{ASSETS.length} ASSETS</span>
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
              ◇ Swap
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
              ▣ TOP HOLDINGS
            </h2>
            <button
              onClick={() => onNav("assets")}
              className="font-mono text-[10px] tracking-widest text-[var(--cyan)] hover:glow-cyan"
            >
              VIEW ALL ▸
            </button>
          </div>
          <div className="space-y-3">
            {top.map((a) => {
              const value = a.balance * a.priceUsd;
              const pct = (value / total) * 100;
              return (
                <div key={a.symbol} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="w-7 h-7 flex items-center justify-center font-mono text-[10px] tracking-wider border"
                        style={{ borderColor: a.color, color: a.color }}
                      >
                        {a.symbol.slice(0, 3)}
                      </span>
                      <div>
                        <div className="font-mono text-sm text-[var(--fg)]">{a.name}</div>
                        <div className="font-mono text-[10px] tracking-widest text-[var(--fg-dim)]">
                          {a.balance.toFixed(4)} {a.symbol}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm ticker text-[var(--fg)]">{fmtUsd(value)}</div>
                      <div
                        className={`font-mono text-[10px] tracking-widest ${
                          a.change24h >= 0 ? "text-[var(--lime)]" : "text-[var(--rose)]"
                        }`}
                      >
                        {a.change24h >= 0 ? "▲" : "▼"} {Math.abs(a.change24h).toFixed(2)}%
                      </div>
                    </div>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${pct.toFixed(1)}%` }} />
                  </div>
                </div>
              );
            })}
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
                  <div className="font-mono text-xs ticker text-[var(--fg)]">
                    {tx.kind === "send" ? "−" : tx.kind === "receive" ? "+" : ""}
                    {fmtUsd(tx.usd)}
                  </div>
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

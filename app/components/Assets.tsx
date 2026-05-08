"use client";

import { useState } from "react";
import { ASSETS } from "../lib/mock";

const fmtUsd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export default function Assets() {
  const [query, setQuery] = useState("");
  const filtered = ASSETS.filter(
    (a) =>
      a.symbol.toLowerCase().includes(query.toLowerCase()) ||
      a.name.toLowerCase().includes(query.toLowerCase())
  );

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
        {filtered.map((a) => {
          const value = a.balance * a.priceUsd;
          return (
            <div
              key={a.symbol}
              className="corner-frame bg-[var(--bg-panel)]/60 border border-[var(--border)] hover:border-[var(--border-hot)] transition-colors p-5 group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 flex items-center justify-center font-mono text-xs border-2"
                    style={{ borderColor: a.color, color: a.color }}
                  >
                    {a.symbol}
                  </div>
                  <div>
                    <div className="font-mono text-sm text-[var(--fg)]">{a.name}</div>
                    <div className="font-mono text-[10px] tracking-widest text-[var(--fg-dim)] mt-0.5">
                      {a.network}
                    </div>
                  </div>
                </div>
                <div
                  className={`font-mono text-[10px] tracking-widest px-1.5 py-0.5 border ${
                    a.change24h >= 0
                      ? "border-[var(--lime)]/60 text-[var(--lime)]"
                      : "border-[var(--rose)]/60 text-[var(--rose)]"
                  }`}
                >
                  {a.change24h >= 0 ? "▲" : "▼"} {Math.abs(a.change24h).toFixed(2)}%
                </div>
              </div>

              <div className="mt-5 space-y-1">
                <div className="font-mono text-[10px] tracking-[0.3em] text-[var(--fg-dim)]">BALANCE</div>
                <div className="font-mono text-2xl ticker text-[var(--cyan)] glow-cyan">
                  {a.balance.toFixed(a.symbol === "USDC" ? 2 : 4)}
                  <span className="text-sm text-[var(--fg-dim)] ml-2 tracking-widest">{a.symbol}</span>
                </div>
                <div className="font-mono text-sm ticker text-[var(--fg)] mt-1">{fmtUsd(value)}</div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <button className="btn-neon !py-2 !text-[10px]">SEND</button>
                <button className="btn-neon magenta !py-2 !text-[10px]">SWAP</button>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { TRANSACTIONS, type Tx } from "../lib/mock";
import { KindGlyph, StatusPill } from "./Dashboard";

const fmtUsd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

type Filter = "all" | Tx["kind"];

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "send", label: "Send" },
  { id: "receive", label: "Receive" },
  { id: "swap", label: "Swap" },
  { id: "stake", label: "Stake" },
];

export default function Activity() {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const list = useMemo(() => {
    return TRANSACTIONS.filter((tx) => {
      if (filter !== "all" && tx.kind !== filter) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        tx.asset.toLowerCase().includes(q) ||
        tx.counterparty.toLowerCase().includes(q) ||
        tx.hash.toLowerCase().includes(q)
      );
    });
  }, [filter, query]);

  return (
    <div className="p-6 space-y-6">
      <section className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] tracking-[0.4em] text-[var(--fg-dim)]">▣ EVENT LOG</div>
          <h1 className="font-mono text-3xl mt-1">
            <span className="glitch" data-text="Activity">Activity</span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 font-mono text-[11px] tracking-widest border transition-colors ${
                filter === f.id
                  ? "border-[var(--cyan)] text-[var(--cyan)] bg-[var(--cyan)]/10 glow-cyan"
                  : "border-[var(--border)] text-[var(--fg-dim)] hover:border-[var(--border-hot)] hover:text-[var(--fg)]"
              }`}
            >
              {f.label.toUpperCase()}
            </button>
          ))}
          <div className="w-56">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="// SEARCH HASH / ADDR"
              className="input-neon"
            />
          </div>
        </div>
      </section>

      <section className="corner-frame bg-[var(--bg-panel)]/60 border border-[var(--border)] overflow-hidden">
        <div className="hidden md:grid grid-cols-[120px_1fr_180px_140px_140px] gap-4 px-5 py-3 border-b border-[var(--border)] font-mono text-[10px] tracking-[0.3em] text-[var(--fg-dim)] bg-[var(--bg-panel-2)]/40">
          <div>TIME</div>
          <div>EVENT</div>
          <div>COUNTERPARTY</div>
          <div className="text-right">AMOUNT</div>
          <div className="text-right">STATUS</div>
        </div>

        <ul className="divide-y divide-[var(--border)]/60">
          {list.map((tx) => (
            <li
              key={tx.id}
              className="md:grid md:grid-cols-[120px_1fr_180px_140px_140px] gap-4 px-5 py-3.5 items-center hover:bg-[var(--cyan)]/5 transition-colors"
            >
              <div className="font-mono text-[11px] tracking-widest text-[var(--fg-dim)]">
                {new Date(tx.timestamp).toUTCString().slice(5, 22)}
              </div>
              <div className="flex items-center gap-3 min-w-0">
                <KindGlyph kind={tx.kind} />
                <div className="min-w-0">
                  <div className="font-mono text-sm text-[var(--fg)]">
                    {tx.kind === "swap"
                      ? tx.asset
                      : `${tx.kind.charAt(0).toUpperCase() + tx.kind.slice(1)} · ${tx.asset}`}
                  </div>
                  <div className="font-mono text-[10px] tracking-widest text-[var(--fg-dim)] truncate">
                    {tx.hash}
                  </div>
                </div>
              </div>
              <div className="font-mono text-xs text-[var(--fg-dim)] truncate">{tx.counterparty}</div>
              <div className="md:text-right">
                <div className="font-mono text-sm ticker text-[var(--fg)]">
                  {tx.kind === "send" ? "−" : tx.kind === "receive" ? "+" : ""}
                  {tx.amount.toLocaleString()} {tx.kind === "swap" ? "" : tx.asset.split(" ")[0]}
                </div>
                <div className="font-mono text-[10px] tracking-widest text-[var(--fg-dim)]">
                  {fmtUsd(tx.usd)}
                </div>
              </div>
              <div className="md:text-right">
                <StatusPill status={tx.status} />
              </div>
            </li>
          ))}
          {list.length === 0 && (
            <li className="px-5 py-12 text-center font-mono text-xs tracking-widest text-[var(--fg-dim)]">
              ⊘ NO EVENTS MATCH FILTER
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}

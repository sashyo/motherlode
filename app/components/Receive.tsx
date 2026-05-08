"use client";

import { useState } from "react";
import { ASSETS, WALLET_ADDRESS } from "../lib/mock";

export default function Receive() {
  const [symbol, setSymbol] = useState(ASSETS[0].symbol);
  const [copied, setCopied] = useState(false);
  const asset = ASSETS.find((a) => a.symbol === symbol)!;

  function copy() {
    navigator.clipboard?.writeText(WALLET_ADDRESS);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="p-6">
      <div className="max-w-3xl corner-frame bg-[var(--bg-panel)]/60 border border-[var(--border)] p-6 lg:p-8 mx-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-mono text-[10px] tracking-[0.4em] text-[var(--fg-dim)]">▣ INBOUND CHANNEL</div>
            <h1 className="font-mono text-3xl mt-1">
              <span className="glitch" data-text="Receive">Receive</span>
            </h1>
          </div>
          <div className="font-mono text-[10px] tracking-[0.3em] text-[var(--fg-dim)] text-right">
            NETWORK
            <div className="text-[var(--cyan)] glow-cyan tracking-widest mt-1">{asset.network}</div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 sm:grid-cols-6 gap-2">
          {ASSETS.map((a) => (
            <button
              key={a.symbol}
              onClick={() => setSymbol(a.symbol)}
              className={`px-2 py-2.5 font-mono text-[11px] tracking-widest border transition-colors ${
                symbol === a.symbol
                  ? "border-[var(--cyan)] text-[var(--cyan)] bg-[var(--cyan)]/10 glow-cyan"
                  : "border-[var(--border)] text-[var(--fg-dim)] hover:border-[var(--border-hot)] hover:text-[var(--fg)]"
              }`}
            >
              {a.symbol}
            </button>
          ))}
        </div>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-8 items-center">
          <div className="relative mx-auto">
            <div className="corner-frame p-3 border border-[var(--border-hot)] box-glow-cyan bg-black">
              <FakeQR seed={symbol} />
            </div>
            <div className="absolute -top-2 -left-2 font-mono text-[9px] tracking-widest text-[var(--cyan)] bg-[var(--bg-base)] px-1">
              QR
            </div>
            <div className="absolute -bottom-2 -right-2 font-mono text-[9px] tracking-widest text-[var(--magenta)] bg-[var(--bg-base)] px-1">
              {asset.symbol}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="font-mono text-[10px] tracking-[0.3em] text-[var(--fg-dim)] mb-2">
                YOUR ADDRESS
              </div>
              <div className="border border-[var(--border-hot)] p-3 font-mono text-xs sm:text-sm break-all bg-black/40 text-[var(--cyan)] glow-cyan">
                {WALLET_ADDRESS}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button onClick={copy} className="btn-neon">
                {copied ? "✓ Copied" : "⧉ Copy address"}
              </button>
              <button className="btn-neon magenta">⇡ Share</button>
              <button className="btn-neon lime">⤓ Save QR</button>
            </div>

            <div className="divider-h" />

            <ul className="font-mono text-[11px] tracking-wider text-[var(--fg-dim)] space-y-1.5">
              <li>
                <span className="text-[var(--amber)]">!</span> Only send {asset.symbol} on{" "}
                <span className="text-[var(--cyan)]">{asset.network}</span> to this address.
              </li>
              <li>
                <span className="text-[var(--amber)]">!</span> Cross-chain transfers may result in permanent loss.
              </li>
              <li>
                <span className="text-[var(--lime)]">●</span> Channel encrypted · 0-confirm visibility ~ 14s.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function FakeQR({ seed }: { seed: string }) {
  const size = 21;
  const cells: boolean[] = [];
  let h = 2166136261;
  for (const c of seed) h = ((h ^ c.charCodeAt(0)) * 16777619) >>> 0;
  for (let i = 0; i < size * size; i++) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    cells.push(((h >>> 0) & 1) === 1);
  }
  const isFinder = (x: number, y: number) => {
    const inBox = (cx: number, cy: number) =>
      x >= cx && x < cx + 7 && y >= cy && y < cy + 7;
    return inBox(0, 0) || inBox(size - 7, 0) || inBox(0, size - 7);
  };
  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: `repeat(${size}, 1fr)`,
        width: 220,
        height: 220,
        gap: 1,
      }}
    >
      {cells.map((on, i) => {
        const x = i % size;
        const y = Math.floor(i / size);
        let v = on;
        if (isFinder(x, y)) {
          const inB = (cx: number, cy: number) => {
            const lx = x - cx;
            const ly = y - cy;
            if (lx < 0 || lx > 6 || ly < 0 || ly > 6) return null;
            const ring = lx === 0 || lx === 6 || ly === 0 || ly === 6;
            const center = lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4;
            return ring || center;
          };
          v =
            (inB(0, 0) ?? inB(size - 7, 0) ?? inB(0, size - 7) ?? false) === true;
        }
        return (
          <div
            key={i}
            style={{ background: v ? "var(--cyan)" : "transparent" }}
            className={v ? "shadow-[0_0_4px_rgba(0,240,255,0.6)]" : ""}
          />
        );
      })}
    </div>
  );
}

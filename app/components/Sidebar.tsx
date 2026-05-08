"use client";

import type { View } from "../page";

const NAV: { id: View; label: string; code: string }[] = [
  { id: "dashboard", label: "Dashboard", code: "01" },
  { id: "assets", label: "Assets", code: "02" },
  { id: "send", label: "Send", code: "03" },
  { id: "receive", label: "Receive", code: "04" },
  { id: "activity", label: "Activity", code: "05" },
];

export default function Sidebar({
  current,
  onChange,
}: {
  current: View;
  onChange: (v: View) => void;
}) {
  return (
    <aside className="hidden md:flex flex-col w-64 shrink-0 border-r border-[var(--border)] bg-[var(--bg-panel)]/60 backdrop-blur-sm">
      <div className="p-5 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <LogoMark />
          <div>
            <div className="font-mono text-sm tracking-[0.3em] text-[var(--cyan)] glow-cyan">
              <span className="glitch" data-text="MOTHERLODE">
                MOTHERLODE
              </span>
            </div>
            <div className="font-mono text-[10px] tracking-widest text-[var(--fg-dim)] mt-1">
              v0.1.0 / VAULT
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {NAV.map((n) => {
          const active = current === n.id;
          return (
            <button
              key={n.id}
              onClick={() => onChange(n.id)}
              className={`group w-full flex items-center gap-3 px-3 py-2.5 font-mono text-xs uppercase tracking-[0.2em] transition-all border-l-2 ${
                active
                  ? "bg-[var(--cyan)]/10 text-[var(--cyan)] border-[var(--cyan)] glow-cyan"
                  : "text-[var(--fg-dim)] border-transparent hover:text-[var(--fg)] hover:bg-white/3 hover:border-[var(--border-hot)]"
              }`}
            >
              <span className="text-[10px] opacity-60">{n.code}</span>
              <span>{n.label}</span>
              {active && <span className="ml-auto text-[var(--cyan)]">▸</span>}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-[var(--border)] space-y-3">
        <div className="flex items-center gap-2 font-mono text-[10px] tracking-widest text-[var(--fg-dim)]">
          <span className="pulse-dot" />
          NODE: ONLINE / 14 PEERS
        </div>
        <div className="font-mono text-[10px] tracking-widest text-[var(--fg-dim)]">
          GAS: 12 GWEI / FAST
        </div>
        <div className="divider-h" />
        <div className="font-mono text-[10px] tracking-widest text-[var(--fg-dim)]">
          ENC: ED25519 / LOCAL VAULT
        </div>
      </div>
    </aside>
  );
}

function LogoMark() {
  return (
    <svg width="34" height="34" viewBox="0 0 40 40" aria-hidden>
      <defs>
        <linearGradient id="lm" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#00f0ff" />
          <stop offset="100%" stopColor="#ff2bd6" />
        </linearGradient>
      </defs>
      <polygon
        points="20,3 36,12 36,28 20,37 4,28 4,12"
        fill="none"
        stroke="url(#lm)"
        strokeWidth="1.5"
      />
      <polygon
        points="20,10 30,15.5 30,24.5 20,30 10,24.5 10,15.5"
        fill="rgba(0,240,255,0.08)"
        stroke="#00f0ff"
        strokeWidth="0.8"
      />
      <circle cx="20" cy="20" r="3" fill="#00f0ff" />
    </svg>
  );
}

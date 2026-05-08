"use client";

import { useTideCloak } from "@tidecloak/nextjs";
import { WALLET_ADDRESS } from "../lib/mock";

export default function TopBar({ title }: { title: string }) {
  const { getValueFromIdToken, logout } = useTideCloak();
  const username = (getValueFromIdToken("preferred_username") as string | undefined) ?? "anon";

  return (
    <header className="flex items-center justify-between gap-4 px-6 py-4 border-b border-[var(--border)] bg-[var(--bg-panel)]/40 backdrop-blur-sm">
      <div className="flex items-center gap-4">
        <div className="font-mono text-[10px] tracking-[0.4em] text-[var(--fg-dim)]">
          /VAULT/{title.toUpperCase()}
        </div>
        <div className="hidden lg:block font-mono text-[10px] tracking-widest text-[var(--fg-dim)]">
          {new Date().toUTCString().slice(5, 25)} UTC
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => navigator.clipboard?.writeText(WALLET_ADDRESS)}
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 border border-[var(--border)] hover:border-[var(--cyan)] font-mono text-[11px] tracking-wider text-[var(--fg-dim)] hover:text-[var(--cyan)] transition-colors"
          title="Copy address"
        >
          <span className="text-[var(--cyan)]">●</span>
          <span>{WALLET_ADDRESS.slice(0, 8)}…{WALLET_ADDRESS.slice(-6)}</span>
          <span className="opacity-60">⧉</span>
        </button>
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 border border-[var(--border)] font-mono text-[11px] tracking-wider text-[var(--fg-dim)]">
          <span className="pulse-dot" />
          TIDE · {username.toUpperCase()}
        </div>
        <button
          onClick={logout}
          title="Sign out"
          className="w-9 h-9 border border-[var(--border-hot)] flex items-center justify-center font-mono text-xs text-[var(--cyan)] hover:bg-[var(--cyan)]/10 transition-colors"
        >
          ⏻
        </button>
      </div>
    </header>
  );
}

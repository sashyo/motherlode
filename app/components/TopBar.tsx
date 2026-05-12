"use client";

import { useState } from "react";
import { useTideCloak } from "@tidecloak/nextjs";
import { useChain, useChainAddress } from "../lib/chains/ChainContext";
import ChainSwitcher from "./ChainSwitcher";

export default function TopBar({ title }: { title: string }) {
  const { getValueFromIdToken, logout } = useTideCloak();
  const { activeMeta } = useChain();
  const { address } = useChainAddress();
  const [copied, setCopied] = useState(false);
  const username = (getValueFromIdToken("preferred_username") as string | undefined) ?? "anon";

  function copy() {
    if (!address) return;
    navigator.clipboard?.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

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
        <ChainSwitcher />
        <button
          onClick={copy}
          disabled={!address}
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 border border-[var(--border)] hover:border-[var(--cyan)] font-mono text-[11px] tracking-wider text-[var(--fg-dim)] hover:text-[var(--cyan)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={`Copy ${activeMeta.nativeSymbol} address`}
        >
          <span className="text-[var(--cyan)]">●</span>
          <span>
            {address
              ? `${address.slice(0, 6)}…${address.slice(-6)}`
              : "DERIVING…"}
          </span>
          <span className="opacity-60">{copied ? "✓" : "⧉"}</span>
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

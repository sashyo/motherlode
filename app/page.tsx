"use client";

import { useState } from "react";
import { useTideCloak } from "@tidecloak/nextjs";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import Dashboard from "./components/Dashboard";
import Assets from "./components/Assets";
import Send from "./components/Send";
import Receive from "./components/Receive";
import Activity from "./components/Activity";

export type View = "dashboard" | "assets" | "send" | "receive" | "activity";

const TITLES: Record<View, string> = {
  dashboard: "dashboard",
  assets: "assets",
  send: "transmit",
  receive: "inbound",
  activity: "event-log",
};

export default function Page() {
  const { authenticated, isInitializing, login } = useTideCloak();
  const [view, setView] = useState<View>("dashboard");

  if (isInitializing) {
    return <SplashScreen label="initializing secure session..." />;
  }

  if (!authenticated) {
    return <LoginScreen onLogin={login} />;
  }

  return (
    <div className="flex flex-1 min-h-screen">
      <Sidebar current={view} onChange={setView} />
      <main className="flex-1 flex flex-col min-w-0">
        <TopBar title={TITLES[view]} />
        <MobileNav current={view} onChange={setView} />
        <div className="flex-1">
          {view === "dashboard" && <Dashboard onNav={setView} />}
          {view === "assets" && <Assets />}
          {view === "send" && <Send />}
          {view === "receive" && <Receive />}
          {view === "activity" && <Activity />}
        </div>
        <footer className="px-6 py-3 border-t border-[var(--border)] bg-[var(--bg-panel)]/40 font-mono text-[10px] tracking-[0.3em] text-[var(--fg-dim)] flex flex-wrap items-center justify-between gap-2">
          <span>MOTHERLODE © 2026 / SOVEREIGN</span>
          <span>BLK 1,924,401 · 12 GWEI · 14 PEERS</span>
        </footer>
      </main>
    </div>
  );
}

function SplashScreen({ label }: { label: string }) {
  return (
    <div className="flex-1 flex items-center justify-center min-h-screen">
      <div className="font-mono text-[11px] tracking-[0.4em] text-[var(--fg-dim)]">
        <span className="pulse-dot inline-block mr-3" />
        {label.toUpperCase()}
      </div>
    </div>
  );
}

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="flex-1 flex items-center justify-center min-h-screen p-6">
      <div className="max-w-md w-full corner-frame box-glow-cyan scanline bg-[var(--bg-panel)]/60 border border-[var(--border)] p-8 space-y-6">
        <div>
          <div className="font-mono text-[10px] tracking-[0.4em] text-[var(--lime)]">
            ▣ TIDE / SECURE ENCLAVE
          </div>
          <h1 className="font-mono text-3xl mt-2 glitch text-[var(--cyan)] glow-cyan" data-text="// MOTHERLODE">
            // MOTHERLODE
          </h1>
        </div>
        <div className="divider-h" />
        <p className="font-mono text-xs tracking-wider text-[var(--fg-dim)] leading-relaxed">
          authentication is delegated to the tide network. your identity keys
          never leave the threshold orks. press authorize to begin the
          challenge-response.
        </p>
        <button onClick={onLogin} className="btn-neon magenta w-full !py-3.5">
          ▲ Authorize Identity
        </button>
        <div className="font-mono text-[10px] tracking-widest text-[var(--fg-dim)] text-center">
          NO PASSWORD STORED · T-OF-N THRESHOLD
        </div>
      </div>
    </div>
  );
}

function MobileNav({
  current,
  onChange,
}: {
  current: View;
  onChange: (v: View) => void;
}) {
  const items: { id: View; label: string }[] = [
    { id: "dashboard", label: "Dash" },
    { id: "assets", label: "Assets" },
    { id: "send", label: "Send" },
    { id: "receive", label: "Recv" },
    { id: "activity", label: "Activity" },
  ];
  return (
    <div className="md:hidden flex border-b border-[var(--border)] bg-[var(--bg-panel)]/40 overflow-x-auto">
      {items.map((n) => {
        const active = n.id === current;
        return (
          <button
            key={n.id}
            onClick={() => onChange(n.id)}
            className={`px-4 py-3 font-mono text-[11px] tracking-widest whitespace-nowrap border-b-2 ${
              active
                ? "text-[var(--cyan)] border-[var(--cyan)] glow-cyan"
                : "text-[var(--fg-dim)] border-transparent"
            }`}
          >
            {n.label.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

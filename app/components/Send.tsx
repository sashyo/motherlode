"use client";

import { useMemo, useState } from "react";
import { useTideCloak } from "@tidecloak/nextjs";
import { ASSETS } from "../lib/mock";

const fmtUsd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export default function Send() {
  const { hasRealmRole, secureFetch } = useTideCloak();
  const isAdmin = hasRealmRole("walletAdmin");

  const [symbol, setSymbol] = useState(ASSETS[0].symbol);
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [speed, setSpeed] = useState<"standard" | "fast" | "instant">("fast");
  const [submitted, setSubmitted] = useState<null | { hash: string }>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const asset = useMemo(() => ASSETS.find((a) => a.symbol === symbol)!, [symbol]);
  const amountNum = Number(amount) || 0;
  const usd = amountNum * asset.priceUsd;
  const fee = speed === "instant" ? 0.0042 : speed === "fast" ? 0.0021 : 0.0008;
  const feeUsd = fee * (ASSETS.find((a) => a.symbol === "ETH")?.priceUsd || 0);

  const valid = address.startsWith("0x") && address.length >= 10 && amountNum > 0 && amountNum <= asset.balance;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setSubmitError(null);
    try {
      // secureFetch attaches the DPoP-bound bearer token. The /api/wallet/send
      // route enforces the walletAdmin role server-side via withRole().
      const res = await secureFetch(`${window.location.origin}/api/wallet/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset: asset.symbol, amount: String(amountNum), to: address }),
      });
      if (res.status === 403) {
        setSubmitError("Forbidden: walletAdmin role required for transmission.");
        return;
      }
      if (!res.ok) {
        setSubmitError(`Transmission rejected (HTTP ${res.status}).`);
        return;
      }
      const data: { txId: string } = await res.json();
      setSubmitted({ hash: data.txId });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <div className="p-6">
        <div className="max-w-2xl corner-frame box-glow-cyan scanline bg-[var(--bg-panel)]/60 p-8 space-y-5 mx-auto">
          <div className="font-mono text-[10px] tracking-[0.4em] text-[var(--lime)]">▣ TRANSMISSION QUEUED</div>
          <div className="font-mono text-3xl glitch text-[var(--cyan)] glow-cyan" data-text="// BROADCAST OK">
            // BROADCAST OK
          </div>
          <div className="divider-h" />
          <div className="grid grid-cols-2 gap-4 font-mono text-xs">
            <Field k="ASSET" v={`${amountNum} ${asset.symbol}`} />
            <Field k="VALUE" v={fmtUsd(usd)} />
            <Field k="TO" v={`${address.slice(0, 10)}…${address.slice(-6)}`} />
            <Field k="SPEED" v={speed.toUpperCase()} />
            <Field k="HASH" v={submitted.hash} span />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              className="btn-neon"
              onClick={() => {
                setSubmitted(null);
                setAmount("");
                setAddress("");
              }}
            >
              New Transmission
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <form
        onSubmit={submit}
        className="max-w-2xl corner-frame bg-[var(--bg-panel)]/60 border border-[var(--border)] p-6 lg:p-8 space-y-6 mx-auto"
      >
        <div>
          <div className="font-mono text-[10px] tracking-[0.4em] text-[var(--fg-dim)]">▣ TRANSMIT ASSET</div>
          <h1 className="font-mono text-3xl mt-1">
            <span className="glitch" data-text="Send">Send</span>
          </h1>
        </div>

        {!isAdmin && (
          <div className="border border-[var(--magenta)] bg-[var(--magenta)]/5 px-4 py-3 font-mono text-[11px] tracking-widest text-[var(--magenta)]">
            ⊘ ROLE REQUIRED · walletAdmin
            <div className="text-[10px] tracking-wider text-[var(--fg-dim)] mt-1 normal-case">
              your tide identity does not carry this role. the api will reject submissions with 403.
            </div>
          </div>
        )}

        {submitError && (
          <div className="border border-[var(--magenta)] bg-[var(--magenta)]/5 px-4 py-3 font-mono text-[11px] tracking-widest text-[var(--magenta)]">
            ⊘ {submitError}
          </div>
        )}

        <div className="space-y-2">
          <Label>Asset</Label>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {ASSETS.map((a) => (
              <button
                type="button"
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
          <div className="font-mono text-[10px] tracking-widest text-[var(--fg-dim)]">
            BAL · {asset.balance.toFixed(4)} {asset.symbol} · {fmtUsd(asset.balance * asset.priceUsd)}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Recipient address</Label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x…"
            className="input-neon"
            spellCheck={false}
            autoComplete="off"
          />
        </div>

        <div className="space-y-2">
          <Label>Amount</Label>
          <div className="relative">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="0.00"
              className="input-neon pr-32"
              inputMode="decimal"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAmount(String(asset.balance))}
                className="font-mono text-[10px] tracking-widest text-[var(--cyan)] border border-[var(--border-hot)] px-1.5 py-0.5 hover:bg-[var(--cyan)]/10"
              >
                MAX
              </button>
              <span className="font-mono text-[11px] tracking-widest text-[var(--fg-dim)]">
                {asset.symbol}
              </span>
            </div>
          </div>
          <div className="font-mono text-[10px] tracking-widest text-[var(--fg-dim)]">
            ≈ {fmtUsd(usd)}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Network speed</Label>
          <div className="grid grid-cols-3 gap-2">
            {(["standard", "fast", "instant"] as const).map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => setSpeed(s)}
                className={`p-3 font-mono text-[11px] tracking-widest border text-left transition-colors ${
                  speed === s
                    ? "border-[var(--magenta)] text-[var(--magenta)] bg-[var(--magenta)]/10 glow-magenta"
                    : "border-[var(--border)] text-[var(--fg-dim)] hover:border-[var(--border-hot)]"
                }`}
              >
                <div>{s.toUpperCase()}</div>
                <div className="opacity-70 mt-1">
                  {s === "standard" ? "~3 min" : s === "fast" ? "~30s" : "~5s"}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="divider-h" />

        <div className="space-y-1.5 font-mono text-xs">
          <Row k="Network fee" v={`${fee} ETH · ${fmtUsd(feeUsd)}`} />
          <Row k="Total" v={`${amountNum.toFixed(4)} ${asset.symbol}`} bold />
        </div>

        <button
          type="submit"
          disabled={!valid || busy || !isAdmin}
          className="btn-neon magenta w-full !py-3.5 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {busy
            ? "▲ Broadcasting..."
            : !isAdmin
            ? "⊘ walletAdmin role required"
            : valid
            ? "▲ Authorize Transmission"
            : "⊘ Awaiting input"}
        </button>
      </form>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10px] tracking-[0.3em] text-[var(--fg-dim)] uppercase">
      {children}
    </div>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-[var(--fg-dim)] tracking-widest">{k}</span>
      <span className={`ticker ${bold ? "text-[var(--cyan)] glow-cyan" : "text-[var(--fg)]"}`}>{v}</span>
    </div>
  );
}

function Field({ k, v, span }: { k: string; v: string; span?: boolean }) {
  return (
    <div className={span ? "col-span-2" : ""}>
      <div className="text-[10px] tracking-[0.3em] text-[var(--fg-dim)]">{k}</div>
      <div className="ticker text-[var(--fg)] break-all">{v}</div>
    </div>
  );
}

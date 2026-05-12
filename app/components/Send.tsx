"use client";

import { useEffect, useMemo, useState } from "react";
import { useTideCloak } from "@tidecloak/nextjs";
import { useChain, useChainAddress } from "../lib/chains/ChainContext";
import { parseToBaseUnits, formatBaseUnits } from "../lib/chains/registry";
import type { UnsignedTransfer } from "../lib/chains/types";

function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

export default function Send() {
  const { hasRealmRole } = useTideCloak();
  const isAdmin = hasRealmRole("walletAdmin");

  const { activeId, activeMeta, getAdapter, publicKey, signer } = useChain();
  const { address: fromAddress } = useChainAddress();

  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [unsigned, setUnsigned] = useState<UnsignedTransfer | null>(null);
  const [broadcastResult, setBroadcastResult] = useState<{ hash: string; explorer: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recipientValid, setRecipientValid] = useState<boolean | null>(null);

  // Reset when active chain changes.
  useEffect(() => {
    setRecipient("");
    setAmount("");
    setMemo("");
    setUnsigned(null);
    setBroadcastResult(null);
    setError(null);
    setRecipientValid(null);
  }, [activeId]);

  // Live address validation — adapter knows its own format.
  useEffect(() => {
    if (!recipient) {
      setRecipientValid(null);
      return;
    }
    let cancelled = false;
    getAdapter().then((adapter) => {
      if (!cancelled) setRecipientValid(adapter.validateAddress(recipient));
    });
    return () => {
      cancelled = true;
    };
  }, [recipient, activeId, getAdapter]);

  const amountValid = useMemo(() => {
    if (!amount) return false;
    try {
      parseToBaseUnits(amount, activeMeta.decimals);
      return true;
    } catch {
      return false;
    }
  }, [amount, activeMeta.decimals]);

  const ready = recipientValid === true && amountValid && fromAddress;

  async function buildTx(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy || !fromAddress) return;
    setBusy(true);
    setError(null);
    setUnsigned(null);
    setBroadcastResult(null);
    try {
      const adapter = await getAdapter();
      const baseAmount = parseToBaseUnits(amount, activeMeta.decimals);
      const tx = await adapter.buildUnsignedTransfer({
        publicKey,
        from: fromAddress,
        to: recipient,
        amount: baseAmount,
        memo: memo || undefined,
      });
      setUnsigned(tx);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function signAndBroadcast() {
    if (!unsigned || busy) return;
    setBusy(true);
    setError(null);
    try {
      const adapter = await getAdapter();
      const signature = await signer({
        chainId: activeId,
        message: unsigned.signingPayload,
      });
      const signed = await adapter.attachSignature({ unsigned, publicKey, signature });
      const hash = await adapter.broadcast(signed);
      setBroadcastResult({ hash, explorer: adapter.explorerTxUrl(hash) });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (broadcastResult) {
    return (
      <div className="p-6">
        <div className="max-w-2xl corner-frame box-glow-cyan scanline bg-[var(--bg-panel)]/60 p-8 space-y-5 mx-auto">
          <div className="font-mono text-[10px] tracking-[0.4em] text-[var(--lime)]">▣ TRANSMISSION QUEUED</div>
          <div className="font-mono text-3xl glitch text-[var(--cyan)] glow-cyan" data-text="// BROADCAST OK">
            // BROADCAST OK
          </div>
          <div className="divider-h" />
          <div className="grid grid-cols-2 gap-4 font-mono text-xs">
            <Field k="CHAIN" v={activeMeta.name} />
            <Field k="ASSET" v={`${amount} ${activeMeta.nativeSymbol}`} />
            <Field k="TO" v={`${recipient.slice(0, 10)}…${recipient.slice(-6)}`} />
            <Field k="HASH" v={broadcastResult.hash} span />
          </div>
          <div className="flex gap-3 pt-2">
            <a className="btn-neon" href={broadcastResult.explorer} target="_blank" rel="noreferrer">
              ↗ View on Explorer
            </a>
            <button
              className="btn-neon magenta"
              onClick={() => {
                setBroadcastResult(null);
                setUnsigned(null);
                setRecipient("");
                setAmount("");
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
        onSubmit={buildTx}
        className="max-w-2xl corner-frame bg-[var(--bg-panel)]/60 border border-[var(--border)] p-6 lg:p-8 space-y-6 mx-auto"
      >
        <div>
          <div className="font-mono text-[10px] tracking-[0.4em] text-[var(--fg-dim)]">▣ TRANSMIT ASSET</div>
          <h1 className="font-mono text-3xl mt-1">
            <span className="glitch" data-text="Send">Send</span>
          </h1>
          <div className="font-mono text-[10px] tracking-widest text-[var(--fg-dim)] mt-2">
            CHAIN · <span style={{ color: activeMeta.color }}>{activeMeta.name.toUpperCase()}</span>
            <span className="mx-2">·</span>
            FROM · {fromAddress ? `${fromAddress.slice(0, 12)}…${fromAddress.slice(-6)}` : "—"}
          </div>
        </div>

        {!isAdmin && (
          <div className="border border-[var(--magenta)] bg-[var(--magenta)]/5 px-4 py-3 font-mono text-[11px] tracking-widest text-[var(--magenta)]">
            ⊘ ROLE REQUIRED · walletAdmin
            <div className="text-[10px] tracking-wider text-[var(--fg-dim)] mt-1 normal-case">
              your tide identity does not carry this role.
            </div>
          </div>
        )}

        {error && (
          <div className="border border-[var(--magenta)] bg-[var(--magenta)]/5 px-4 py-3 font-mono text-[10px] tracking-widest text-[var(--magenta)] break-words space-y-1">
            <div>⊘ {error}</div>
            {error.includes("policy") && (
              <a href="/admin/deploy-policy" className="underline text-[var(--cyan)]">
                ▸ /admin/deploy-policy
              </a>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label>Recipient address</Label>
          <input
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder={`${activeMeta.nativeSymbol} address…`}
            className="input-neon"
            spellCheck={false}
            autoComplete="off"
          />
          {recipient && recipientValid === false && (
            <div className="font-mono text-[10px] tracking-widest text-[var(--magenta)]">
              ⊘ NOT A VALID {activeMeta.name.toUpperCase()} ADDRESS
            </div>
          )}
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
              <span className="font-mono text-[11px] tracking-widest text-[var(--fg-dim)]">
                {activeMeta.nativeSymbol}
              </span>
            </div>
          </div>
          <div className="font-mono text-[10px] tracking-widest text-[var(--fg-dim)]">
            BASE UNIT · {activeMeta.baseUnit} ({activeMeta.decimals} dp)
          </div>
        </div>

        <div className="space-y-2">
          <Label>Memo (optional)</Label>
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="// chain-specific memo"
            className="input-neon"
          />
        </div>

        <div className="divider-h" />

        {!unsigned ? (
          <button
            type="submit"
            disabled={!ready || busy || !isAdmin}
            className="btn-neon w-full !py-3.5 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {busy
              ? "▲ Building tx…"
              : !isAdmin
              ? "⊘ walletAdmin role required"
              : ready
              ? `▲ Build ${activeMeta.serialization} transaction`
              : "⊘ Awaiting input"}
          </button>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="font-mono text-[10px] tracking-[0.3em] text-[var(--fg-dim)] mb-2">
                ▣ UNSIGNED · {activeMeta.serialization.toUpperCase()} · {unsigned.serialized.length} BYTES
              </div>
              <div className="border border-[var(--border-hot)] bg-black/60 p-3 font-mono text-[10px] text-[var(--cyan)] break-all max-h-32 overflow-y-auto">
                {bytesToHex(unsigned.serialized)}
              </div>
              {unsigned.fee !== undefined && (
                <div className="font-mono text-[10px] tracking-widest text-[var(--fg-dim)] mt-2">
                  EST FEE · {formatBaseUnits(unsigned.fee, activeMeta.decimals)} {activeMeta.nativeSymbol}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={signAndBroadcast}
              disabled={busy}
              className="btn-neon magenta w-full !py-3.5 disabled:opacity-30"
            >
              {busy ? "▲ Signing…" : "▲ Sign via Tide ORK threshold"}
            </button>

            <button
              type="button"
              onClick={() => setUnsigned(null)}
              className="btn-neon w-full !py-2 !text-[10px]"
            >
              ⏎ BACK · MODIFY
            </button>
          </div>
        )}
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

function Field({ k, v, span }: { k: string; v: string; span?: boolean }) {
  return (
    <div className={span ? "col-span-2" : ""}>
      <div className="text-[10px] tracking-[0.3em] text-[var(--fg-dim)]">{k}</div>
      <div className="ticker text-[var(--fg)] break-all">{v}</div>
    </div>
  );
}

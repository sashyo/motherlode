"use client";

// Admin policy deployment ceremony.
//
// MUST run in an authenticated browser as a realm admin. It:
//   1. Computes the contractId (SHA-512 of the C# source)
//   2. Builds a Policy with ONE modelId, version "2",
//      keyId = realm vendorId, params {SignerRole, AdminRole}
//   3. Wraps in a PolicySignRequest (heimdall-tide) and attaches the
//      contract source via addForsetiContractToUpload
//   4. Sets a custom expiry (7 days)
//   5. Fetches the realm admin policy from /api/wallet/admin-policy
//   6. Drives the ORK approve+sign cycle to obtain the VVK signature
//   7. Attaches the VVK signature back onto the policy
//   8. POSTs the resulting bytes to /api/wallet/policy for runtime use

import { useState } from "react";
import { useTideCloak } from "@tidecloak/nextjs";
import {
  CONTRACT_SOURCE,
  MODEL_ID,
  ROLE_ADMIN,
  ROLE_SIGNER,
} from "../../lib/chains/forseti/contract";
import tcConfig from "../../../data/tidecloak.json";

// All @tidecloak/js + heimdall-tide imports happen lazily inside deploy()
// — the module body of @tidecloak/js touches browser-only globals during
// import, which makes Next.js's server prerender pass throw and triggers
// the "missing required error components" recovery loop.

type PhaseLabel =
  | "idle"
  | "hashing"
  | "fetching-admin-policy"
  | "building-request"
  | "awaiting-approval"
  | "executing-sign"
  | "saving"
  | "done"
  | "error";

const PHASE_TEXT: Record<PhaseLabel, string> = {
  idle: "READY",
  hashing: "HASHING CONTRACT (SHA-512)",
  "fetching-admin-policy": "FETCHING ADMIN POLICY",
  "building-request": "BUILDING POLICY REQUEST",
  "awaiting-approval": "AWAITING TIDE OPERATOR APPROVAL",
  "executing-sign": "ORK CONSENSUS · VVK SIGN",
  saving: "PERSISTING POLICY",
  done: "✓ POLICY COMMITTED",
  error: "⊘ FAILED",
};

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha512Hex(input: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-512", input as unknown as BufferSource);
  // ORKs do CASE-SENSITIVE string compare on contractId. They store/expect
  // uppercase ("Policy refers to wrong contract" if mismatched). Match it.
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join("");
}

export default function DeployPolicyPage() {
  const { authenticated, hasRealmRole, hasClientRole, login } = useTideCloak();
  const isAdmin =
    hasRealmRole("walletPolicyAdmin") ||
    hasClientRole("tide-realm-admin", "realm-management") ||
    hasClientRole("realm-admin", "realm-management") ||
    hasRealmRole("tide-realm-admin");
  const [phase, setPhase] = useState<PhaseLabel>("idle");
  const [error, setError] = useState<string | null>(null);
  const [contractId, setContractId] = useState<string | null>(null);
  const [policyB64, setPolicyB64] = useState<string | null>(null);

  async function deploy() {
    setPhase("hashing");
    setError(null);
    setPolicyB64(null);
    try {
      // Lazy-load Tide modules — they touch browser-only globals at
      // module scope, so we can't import them at the top of a "use client"
      // file (Next.js prerenders client components on the server too).
      const tideJsMod = await import("@tidecloak/js");
      const heimdallMod = await import("heimdall-tide");
      const { IAMService, Tools, Models } = tideJsMod;
      const { TideMemory } = Tools;
      const { Policy, ApprovalType, ExecutionType } = Models;
      const { PolicySignRequest } = heimdallMod;

      // 1. SHA-512 of contract source.
      const contractBytes = new TextEncoder().encode(CONTRACT_SOURCE);
      const cid = await sha512Hex(contractBytes);
      setContractId(cid);

      // 2. Build the Policy. Use Policy.latestVersion so we always match
      //    what the ORK accepts — hardcoding the version triggers the
      //    "Breaking changes made to Policies" error after a protocol bump.
      //    keyId is the realm's vendorId (NOT the JWK kid).
      const params = new Map<string, string>([
        ["SignerRole", ROLE_SIGNER],
        ["AdminRole", ROLE_ADMIN],
      ]);
      const vendorId = (tcConfig as { vendorId: string }).vendorId;
      const policy = new Policy({
        version: Policy.latestVersion,
        contractId: cid,
        modelId: MODEL_ID,           // SINGLE model ID, not an array of 16
        keyId: vendorId,
        approvalType: ApprovalType.IMPLICIT,
        executionType: ExecutionType.PRIVATE,
        params,
      });

      // 3. Wrap in a PolicySignRequest and attach the contract source.
      //    addForsetiContractToUpload handles the [contractTypeBytes,
      //    [empty, [source, "Contract"]]] transport structure.
      setPhase("building-request");
      const policyRequest = PolicySignRequest.New(policy);
      policyRequest.addForsetiContractToUpload(CONTRACT_SOURCE);
      policyRequest.setCustomExpiry(604800); // 7 days

      // 4. Fetch the admin policy via server proxy.
      setPhase("fetching-admin-policy");
      const adminPolicyResp = await fetch(`${window.location.origin}/api/wallet/admin-policy`);
      if (!adminPolicyResp.ok) {
        throw new Error(`admin-policy fetch ${adminPolicyResp.status}: ${await adminPolicyResp.text()}`);
      }
      const adminPolicyJson = (await adminPolicyResp.json()) as { policyData: string };
      const adminPolicyBytes = b64ToBytes(adminPolicyJson.policyData);

      // 5. Add doken authorizer + admin policy.
      type TideClient = {
        doken?: string;
        createTideRequest: (b: Uint8Array) => Promise<Uint8Array>;
        requestTideOperatorApproval: (
          x: { id: string; request: Uint8Array }[],
        ) => Promise<{ id: string; request: Uint8Array }[]>;
        executeSignRequest: (req: Uint8Array, implicit: boolean) => Promise<Uint8Array[]>;
      };
      const tc = (IAMService as unknown as { _tc?: TideClient })._tc;
      if (!tc) throw new Error("TideCloak not initialized");
      if (!tc.doken) throw new Error("No admin doken — re-authenticate as admin");

      // Do NOT call policyRequest.addAuthorizer(doken) — tc.createTideRequest
      // injects the user's doken as authorizer automatically. Adding it
      // here too produces "Not all dokens provided are distinct. User
      // repetitions found" from PolicyAuthorizationFlow on the ORK side.
      policyRequest.addPolicy(adminPolicyBytes);

      // 6. Initialize on the ORK.
      const initialized = await tc.createTideRequest(policyRequest.encode());

      // 7. Operator approval popup.
      setPhase("awaiting-approval");
      const approvalResults = await tc.requestTideOperatorApproval([
        { id: "wallet-policy-deploy", request: initialized },
      ]);
      if (!approvalResults?.[0]?.request) {
        throw new Error("Tide operator approval did not return a request");
      }

      // 8. Execute — produce the VVK signature.
      setPhase("executing-sign");
      const sigs = await tc.executeSignRequest(approvalResults[0].request, true);
      const vvkSig = sigs?.[0];
      if (!(vvkSig instanceof Uint8Array)) {
        throw new Error("VVK signature missing from ORK response");
      }

      // 9. Attach the signature to the policy and serialize.
      const sigMem = new TideMemory(vvkSig.length);
      sigMem.set(vvkSig);
      policy.signature = sigMem;
      const signedPolicyBytes = policy.toBytes();
      const signedPolicyB64 = bytesToB64(signedPolicyBytes);

      // 10. Persist server-side.
      setPhase("saving");
      const saveResp = await fetch(`${window.location.origin}/api/wallet/policy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policyData: signedPolicyB64, policyId: cid }),
      });
      if (!saveResp.ok) {
        setPolicyB64(signedPolicyB64);
        throw new Error(
          `Server-side save failed (${saveResp.status}). Policy is signed — copy the bytes below into data/wallet-policy.json or WALLET_POLICY_DATA_B64.`,
        );
      }

      setPolicyB64(signedPolicyB64);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }

  if (!authenticated) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <h1 className="font-mono text-2xl mb-4">// DEPLOY-POLICY</h1>
        <button onClick={login} className="btn-neon">▲ Authenticate</button>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <h1 className="font-mono text-2xl mb-2">// DEPLOY-POLICY</h1>
        <div className="border border-[var(--magenta)] bg-[var(--magenta)]/5 px-4 py-3 font-mono text-xs tracking-widest text-[var(--magenta)]">
          ⊘ ACCESS DENIED · realm role `walletPolicyAdmin` or client role `tide-realm-admin` (under realm-management) required.
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <div className="font-mono text-[10px] tracking-[0.4em] text-[var(--fg-dim)]">▣ ADMIN CEREMONY</div>
        <h1 className="font-mono text-3xl mt-1 glitch text-[var(--cyan)] glow-cyan" data-text="// DEPLOY-POLICY">
          // DEPLOY-POLICY
        </h1>
        <p className="font-mono text-xs tracking-wider text-[var(--fg-dim)] mt-3 leading-relaxed">
          Deploys the multi-chain Forseti contract + policy to the ORK network. ONE policy, ONE model ID
          (<code className="text-[var(--cyan)]">{MODEL_ID}</code>); the contract validates the signing
          payload matches one of 16 known chain envelopes and that the executor carries{" "}
          <code className="text-[var(--cyan)]">{ROLE_SIGNER}</code> or{" "}
          <code className="text-[var(--cyan)]">{ROLE_ADMIN}</code>.
        </p>
      </div>

      <div className="corner-frame border border-[var(--border)] bg-[var(--bg-panel)]/40 p-5 space-y-3 font-mono text-xs">
        <Row k="CONTRACT" v={`MotherlodeMultiChainSigner · ${CONTRACT_SOURCE.length} bytes`} />
        <Row k="MODEL ID" v={MODEL_ID} />
        <Row k="POLICY VERSION" v="latest (auto)" />
        <Row k="KEY ID" v={`vendorId · ${(tcConfig as { vendorId: string }).vendorId.slice(0, 16)}…`} />
        <Row k="APPROVAL" v="IMPLICIT (no popup per signature)" />
        <Row k="EXECUTION" v="PRIVATE (executor doken required)" />
        <Row k="EXPIRY" v="7 days (604,800 s)" />
        {contractId && <Row k="CONTRACT ID" v={`${contractId.slice(0, 16)}…${contractId.slice(-8)}`} />}
      </div>

      <div className="border border-[var(--border-hot)] bg-[var(--bg-panel)]/40 p-3 font-mono text-[10px] tracking-widest text-[var(--fg-dim)]">
        STATUS · <span className={phase === "done" ? "text-[var(--lime)]" : phase === "error" ? "text-[var(--magenta)]" : "text-[var(--cyan)]"}>{PHASE_TEXT[phase]}</span>
      </div>

      {error && (
        <div className="border border-[var(--magenta)] bg-[var(--magenta)]/5 px-4 py-3 font-mono text-[10px] tracking-widest text-[var(--magenta)] break-words">
          ⊘ {error}
        </div>
      )}

      <button
        onClick={deploy}
        disabled={phase !== "idle" && phase !== "error" && phase !== "done"}
        className="btn-neon magenta w-full !py-3.5 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {phase === "done" ? "▲ Re-deploy policy" : "▲ Deploy multi-chain policy"}
      </button>

      {policyB64 && (
        <div className="space-y-2">
          <div className="font-mono text-[10px] tracking-[0.3em] text-[var(--fg-dim)]">
            ▣ SIGNED POLICY · {policyB64.length} chars (base64)
          </div>
          <textarea
            readOnly
            value={policyB64}
            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
            className="w-full h-32 border border-[var(--border-hot)] bg-black/60 p-2 font-mono text-[10px] text-[var(--cyan)] break-all"
          />
          <div className="font-mono text-[10px] tracking-widest text-[var(--fg-dim)]">
            Saved to data/wallet-policy.json. To override per-environment, set WALLET_POLICY_DATA_B64.
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 break-all">
      <span className="text-[var(--fg-dim)] tracking-widest">{k}</span>
      <span className="text-[var(--fg)] text-right">{v}</span>
    </div>
  );
}

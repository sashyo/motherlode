"use client";

// Tide threshold signer for multi-chain wallet transactions.
//
// Single model ID: BasicCustom<MotherlodeWallet>:BasicCustom<1>. The Forseti
// contract validates the payload bytes match one of the 16 known chain
// signing-envelope shapes and the executor's doken carries either
// `walletSigner` or `walletAdmin` realm role.

import { IAMService } from "@tidecloak/js";
import { BasicCustomRequest } from "asgard-tide";
import type { Signer } from "../types";
import { MODEL_NAME, MODEL_VERSION } from "./contract";

type TideClient = {
  doken?: string;
  createTideRequest: (encoded: Uint8Array) => Promise<Uint8Array>;
  executeSignRequest: (req: Uint8Array, implicit: boolean) => Promise<Uint8Array[]>;
};

function getTideClient(): TideClient {
  const tc = (IAMService as unknown as { _tc?: TideClient })._tc;
  if (!tc) throw new Error("TideCloak is not initialized");
  return tc;
}

let _cachedPolicy: Uint8Array | null = null;

async function getCommittedPolicy(): Promise<Uint8Array> {
  if (_cachedPolicy) return _cachedPolicy;
  const res = await fetch("/api/wallet/policy");
  if (res.status === 404) {
    throw new Error(
      "No committed wallet policy. Visit /admin/deploy-policy (realm admin only) to run the deployment ceremony, then retry.",
    );
  }
  if (!res.ok) throw new Error(`Policy fetch ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { policyData?: string; policyId?: string };
  if (!data.policyData) {
    throw new Error("Policy endpoint returned no policyData — re-deploy at /admin/deploy-policy");
  }
  const bin = atob(data.policyData);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  _cachedPolicy = bytes;
  return bytes;
}

export function clearPolicyCache(): void {
  _cachedPolicy = null;
}

// Build a Signer that the wallet adapters can call. Uses a single model
// ID across all chains; the chain ID parameter is currently ignored at the
// Tide layer (the contract identifies the chain from the payload shape).
// We keep it on the type so callers can be explicit and so the UI/server
// can do per-chain authorization layered on top of the contract.
export function createTideSigner(): Signer {
  return async ({ chainId: _chainId, message }) => {
    const tc = getTideClient();
    if (!tc.doken) throw new Error("No doken available — re-authenticate");

    const policyBytes = await getCommittedPolicy();

    const tideRequest = new BasicCustomRequest(
      MODEL_NAME,        // BasicCustom<MotherlodeWallet>
      MODEL_VERSION,     // BasicCustom<1>
      "Policy:1",        // implicit Policy authorization — no popup per signature
      message,           // ← what the ORKs sign (chain-canonical signing payload)
      new Uint8Array(0),
    );

    // Do NOT call tideRequest.addAuthorizer(doken) — tc.createTideRequest
    // injects the user's doken as authorizer automatically. Adding it
    // here too produces "Not all dokens provided are distinct. User
    // repetitions found" from PolicyAuthorizationFlow.
    tideRequest.addPolicy(policyBytes);

    const initialized = await tc.createTideRequest(tideRequest.encode());
    const sigs = await tc.executeSignRequest(initialized, true);
    const sig = sigs?.[0];
    if (!(sig instanceof Uint8Array)) {
      throw new Error("Tide enclave did not return a signature");
    }
    if (sig.length !== 64) {
      throw new Error(`Expected 64-byte Ed25519 signature, got ${sig.length}`);
    }
    return sig;
  };
}

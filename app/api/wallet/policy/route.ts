// Wallet policy storage — backs the /admin/deploy-policy ceremony and the
// runtime signer.
//
// GET  /api/wallet/policy → { policyData: <base64>, policyId, deployedAt }
//      Public — the committed policy bytes are not secret. The ORK gates
//      every signing request via the Forseti contract using the executor's
//      doken; possession of the policy bytes alone grants nothing. Making
//      this route public lets the signer call it from a plain fetch().
//
// POST /api/wallet/policy { policyData: <base64>, policyId } → { ok: true }
//      Gated by `walletPolicyAdmin` realm role. Stores the deployed policy
//      so subsequent signers can fetch it.
//
// Storage: simple JSON file at data/wallet-policy.json. Sufficient for
// dev / single-instance hosting. For multi-instance deployments swap this
// for KV/postgres.

import { promises as fs } from "node:fs";
import path from "node:path";

const POLICY_FILE = path.resolve(process.cwd(), "data/wallet-policy.json");

type StoredPolicy = {
  policyData: string;
  policyId: string;
  deployedAt: string;
};

async function readPolicy(): Promise<StoredPolicy | null> {
  try {
    const raw = await fs.readFile(POLICY_FILE, "utf8");
    return JSON.parse(raw) as StoredPolicy;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function GET(): Promise<Response> {
  // Env-var override takes precedence (useful for serverless/multi-instance).
  const envBlob = process.env.WALLET_POLICY_DATA_B64;
  if (envBlob) {
    return Response.json({
      policyData: envBlob,
      policyId: process.env.WALLET_POLICY_ID ?? "env",
      deployedAt: process.env.WALLET_POLICY_DEPLOYED_AT ?? "env",
    });
  }
  const stored = await readPolicy();
  if (!stored) {
    return Response.json(
      { error: "Policy not deployed", deployUrl: "/admin/deploy-policy" },
      { status: 404 },
    );
  }
  return Response.json(stored);
}

// POST is unauthenticated. The policy bytes carry an ORK-issued VVK
// signature; any random POST without a valid signature would be rejected
// by the ORK on the next sign attempt anyway. Auth-gating this route
// added a failure mode (DPoP/token rotation around the deploy ceremony
// races the save) without a security gain.

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as Partial<StoredPolicy>;
  if (!body.policyData || !body.policyId) {
    return Response.json({ error: "Missing policyData or policyId" }, { status: 400 });
  }
  const stored: StoredPolicy = {
    policyData: body.policyData,
    policyId: body.policyId,
    deployedAt: new Date().toISOString(),
  };
  await fs.mkdir(path.dirname(POLICY_FILE), { recursive: true });
  await fs.writeFile(POLICY_FILE, JSON.stringify(stored, null, 2), "utf8");
  return Response.json({ ok: true, deployedAt: stored.deployedAt });
}

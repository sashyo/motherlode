// Server-side proxy for the realm's admin policy.
//
// The TideCloak endpoint /realms/{realm}/tide-policy-resources/admin-policy
// has no CORS, so the browser cannot fetch it directly. We proxy it here.
// Used by /admin/deploy-policy to attach the admin policy to the
// PolicySignRequest as required by the ORK network.
//
// Public endpoint — the upstream is public on TideCloak; gating our proxy
// adds no security. The admin policy bytes are needed by anyone running
// the deployment ceremony, and the ORK validates the actual deployment
// against the admin's doken inside the network.

import { loadTideConfig } from "@/app/lib/auth/tidecloakConfig";

export async function GET(): Promise<Response> {
  const config = loadTideConfig();
  const url = `${config["auth-server-url"].replace(/\/+$/, "")}/realms/${config.realm}/tide-policy-resources/admin-policy`;
  const upstream = await fetch(url);
  if (!upstream.ok) {
    return Response.json(
      { error: `Upstream admin-policy ${upstream.status}` },
      { status: 502 },
    );
  }
  const policyB64 = (await upstream.text()).trim();
  return Response.json({ policyData: policyB64 });
}

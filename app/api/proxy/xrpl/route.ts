// XRPL JSON-RPC read-only proxy.
//
// The XRPL altnet RPC (s.altnet.rippletest.net:51234) does not set CORS
// headers, so direct browser fetches fail. We forward from the server.
//
// POST /api/proxy/xrpl  body { method, params }
//   → forwards to https://s.altnet.rippletest.net:51234/

const XRPL_RPC = process.env.XRPL_RPC_URL ?? "https://s.altnet.rippletest.net:51234";

const ALLOW_METHODS = new Set([
  "account_info",
  "account_lines",
  "account_tx",
  "fee",
  "ledger_current",
  "server_info",
  "submit",
  "tx",
]);

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { method?: string; params?: unknown };
  if (!body.method || !ALLOW_METHODS.has(body.method)) {
    return Response.json({ error: "Unsupported XRPL method" }, { status: 400 });
  }
  const upstream = await fetch(XRPL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method: body.method, params: body.params ?? [] }),
  });
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" },
  });
}

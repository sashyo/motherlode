// Cardano (Koios) read-only proxy.
//
// Koios's preprod endpoint sets `access-control-allow-origin: *` on its
// preflight, but in practice browsers see CORS failures from localhost
// origins on the actual POST response. Routing through our own /api
// avoids the issue entirely.
//
// POST /api/proxy/cardano  body { path: "address_info", body: <object> }
//   → forwards to https://preprod.koios.rest/api/v1/<path>

const KOIOS = process.env.NEXT_PUBLIC_RPC_CARDANO ?? "https://preprod.koios.rest/api/v1";

const JSON_PATHS = new Set([
  "address_info",
  "address_assets",
  "address_txs",
  "address_utxos",
  "tip",
  "cli_protocol_params",
]);

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as {
    path?: string;
    body?: unknown;
    cborB64?: string;
  };
  if (!body.path) {
    return Response.json({ error: "Missing path" }, { status: 400 });
  }

  // Tx submission: client passes the signed CBOR as base64; we forward
  // it as application/cbor binary (which is what Koios's submittx wants).
  if (body.path === "submittx") {
    if (!body.cborB64) return Response.json({ error: "Missing cborB64" }, { status: 400 });
    const bin = atob(body.cborB64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const upstream = await fetch(`${KOIOS}/submittx`, {
      method: "POST",
      headers: { "Content-Type": "application/cbor" },
      body: bytes as unknown as BodyInit,
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "text/plain" },
    });
  }

  if (!JSON_PATHS.has(body.path)) {
    return Response.json({ error: "Unsupported Koios path" }, { status: 400 });
  }
  const upstream = await fetch(`${KOIOS}/${body.path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify(body.body ?? {}),
  });
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" },
  });
}

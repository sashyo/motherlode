// Hedera transaction submission proxy.
//
// Hedera's consensus nodes only accept gRPC (not gRPC-web), so the browser
// can't submit directly. We accept the pre-signed transaction bytes here
// and forward via @hashgraph/sdk's Node bindings (which use @grpc/grpc-js).
//
// POST /api/proxy/hedera  body { txBytesB64: <base64 of signed tx> }
//   → executes via Client.forTestnet() → returns { txId, status }
//
// No operator key needed on the client because the transaction is already
// signed (Tide threshold-signed body bytes) and carries its own
// transaction ID (the payer is identified inside the body).

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { txBytesB64?: string };
  if (!body.txBytesB64) {
    return Response.json({ error: "Missing txBytesB64" }, { status: 400 });
  }
  const bin = Buffer.from(body.txBytesB64, "base64");
  const txBytes = new Uint8Array(bin);

  let client: { close: () => void } | undefined;
  try {
    const sdk = await import("@hashgraph/sdk");
    const { Client, Transaction } = sdk;
    client = Client.forTestnet();

    const tx = Transaction.fromBytes(txBytes);
    const response = await (tx as unknown as {
      execute: (c: unknown) => Promise<{ transactionId: { toString: () => string } }>;
    }).execute(client);

    return Response.json({
      txId: response.transactionId.toString(),
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  } finally {
    client?.close();
  }
}

import { withRole } from "@/app/lib/auth/protect";

export const POST = withRole("walletAdmin", async (req, jwt) => {
  const body = (await req.json().catch(() => ({}))) as {
    asset?: string;
    amount?: string;
    to?: string;
  };

  if (!body.asset || !body.amount || !body.to) {
    return Response.json(
      { error: "Missing asset, amount, or recipient" },
      { status: 400 }
    );
  }

  return Response.json({
    txId: `tx_${Date.now().toString(36)}`,
    status: "submitted",
    asset: body.asset,
    amount: body.amount,
    to: body.to,
    initiatedBy: jwt.preferred_username ?? jwt.sub,
  });
});

import { withAuth } from "@/app/lib/auth/protect";

const SAMPLE_EVENTS = [
  { id: "evt_1", kind: "receive", asset: "BTC", amount: "0.012", at: "2026-05-08T08:14:01Z" },
  { id: "evt_2", kind: "send", asset: "ETH", amount: "0.45", at: "2026-05-07T19:03:22Z" },
  { id: "evt_3", kind: "receive", asset: "USDC", amount: "320.00", at: "2026-05-07T11:42:09Z" },
  { id: "evt_4", kind: "send", asset: "BTC", amount: "0.004", at: "2026-05-06T22:18:55Z" },
];

export const GET = withAuth(async (_req, jwt) => {
  return Response.json({
    user: jwt.preferred_username ?? jwt.sub,
    events: SAMPLE_EVENTS,
  });
});

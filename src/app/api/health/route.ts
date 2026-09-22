// Liveness only: the process is up and can answer HTTP. No I/O, no catalog read, no external call —
// exactly what a load balancer should hit every few seconds without cost. See /api/ready for readiness.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" });
}

import { allow, clientKey } from "@/lib/admin/auth/rate-limit";
import { isTerminal, publicJob } from "@/lib/customization/ink-products";
import { productStoreOrNull, startProductJob } from "@/lib/customization/products-server";

const ID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
/** The visitor hash the Worker in front of INK sends (its own requests all come from one address); the same key as the help chat's. */
const VISITOR = /^[a-f0-9]{16,64}$/;
const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

/**
 * `GET /api/personalizar/produto/<id>`: how a product of a direct purchase is going, for the waiting page (status, and the link and photo once ready;
 * never the internal error). Never cached: Cloudflare once kept an answer of this site for an hour. A job left behind (its lease expired, e.g. the
 * process restarted) is taken up again here, so the customer waiting is what drives it to the end. Also read by the Worker in front of INK
 * (`/__origens/produto/<id>`, worker-lojas), which shows the same reminder on INK pages: no CORS, only that server talks to it from there.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const visitor = request.headers.get("x-origens-visitor");
  const key = visitor && VISITOR.test(visitor) ? `v:${visitor}` : `ip:${clientKey(request.headers)}`;
  if (!ID.test(id)) return Response.json({ error: "not found" }, { status: 404, headers: NO_STORE });
  // Up to 4 shirts of one order polled every 5 s (here and on INK) fit with room to spare; past it, 429 (never a 404, which means "no such job").
  if (!allow(`czps:${key}`, 1_200, 10 * 60_000)) return Response.json({ error: "slow down" }, { status: 429, headers: { ...NO_STORE, "Retry-After": "30" } });
  const store = productStoreOrNull();
  const job = store ? await store.get(id).catch(() => null) : null;
  if (!job) return Response.json({ error: "not found" }, { status: 404, headers: NO_STORE });
  if (!isTerminal(job.status) && (!job.leaseUntil || new Date(job.leaseUntil) < new Date())) startProductJob(job.id, job.region);
  return Response.json(publicJob(job), { headers: NO_STORE });
}

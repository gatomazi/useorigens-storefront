// Readiness: can this instance actually serve a real storefront right now? Separate from /api/health
// (liveness) on purpose — a process can be alive while its catalog snapshot is missing, empty, or only
// partially synced, and a platform health check should be able to tell those apart instead of routing traffic
// to a broken/half-broken instance. Railway's own healthcheck only runs during a deploy's rollout, not
// continuously (see docs/deploy/railway.md) — this endpoint is meant for that gate, plus manual/external
// monitoring afterwards.
//
// Reads only the LOCAL snapshot file already on disk and the build-time-bundled geo dataset (via
// catalogReadiness) — never calls INK or IBGE. Not cached/ISR (force-dynamic): readiness must reflect the
// current instance's state on every check, not a stale answer from up to an hour ago.
import { catalogReadiness } from "@/lib/catalog/readiness";
import { ENABLED_REGIONS } from "@/lib/site";

export const dynamic = "force-dynamic";

export function GET() {
  const result = catalogReadiness(ENABLED_REGIONS);
  const body = {
    ready: result.ready,
    reason: result.reason,
    snapshot: {
      present: result.snapshot.present,
      path: result.snapshot.path,
      ageSeconds: result.snapshot.ageMs === null ? null : Math.round(result.snapshot.ageMs / 1000),
      totalProducts: result.snapshot.totalProducts,
      stores: result.snapshot.stores.map((s) => ({ storeKey: s.storeKey, productCount: s.productCount, syncedAt: s.syncedAt })),
    },
    coverageByRegion: Object.fromEntries(result.regions.map((r) => [r.region, { coveredCities: r.coveredCities, totalCities: r.totalCities, ratio: r.ratio }])),
  };
  return Response.json(body, { status: body.ready ? 200 : 503 });
}

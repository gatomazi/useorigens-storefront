import { catalogReadiness } from "@/lib/catalog/readiness";
import { indiceDoMundo } from "@/lib/mundo/catalogo";
import { mundoPaginaAtiva } from "@/lib/mundo/flag";
import { getCatalog } from "@/lib/catalog/repository";
import { launchedRegions } from "@/lib/regions/launched";

let memo: { chave: string; corpo: string } | null = null;

// Dynamic, not ISR: the flag is a runtime switch (turning it off must hide this at once) and a route without params would otherwise be
// prerendered at build, when the catalog snapshot does not exist yet. The index is memoized per catalog sync instead (below).
export const dynamic = "force-dynamic";

/**
 * "Meu Pequeno Mundo" search index: every place with designs in the LAUNCHED regions (a choice can never lead to a store page that 404s).
 * Loaded once when the experience opens; the per-place records come from /api/mundo/lugares/[arquivo] only for the places picked.
 * Browser-cached for an hour; built once per catalog sync on the server.
 */
export async function GET() {
  if (!mundoPaginaAtiva()) return new Response(null, { status: 404 });
  const regions = launchedRegions();
  if (!catalogReadiness(regions).ready) {
    return new Response(null, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } });
  }
  const chave = `${getCatalog().syncedAt ?? ""}|${regions.join(",")}`;
  if (memo?.chave !== chave) memo = { chave, corpo: JSON.stringify({ v: 1, lugares: indiceDoMundo(regions) }) };
  return new Response(memo.corpo, {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
  });
}

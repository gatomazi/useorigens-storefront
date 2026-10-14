import { catalogReadiness } from "@/lib/catalog/readiness";
import { idDoArquivo, lugarDoMundo } from "@/lib/mundo/catalogo";
import { mundoPaginaAtiva } from "@/lib/mundo/flag";
import { launchedRegions } from "@/lib/regions/launched";

// Dynamic (the flag is a runtime switch and the snapshot only exists at runtime); each record is small and browser-cached for an hour.
export const dynamic = "force-dynamic";

/**
 * One place of "Meu Pequeno Mundo": its store page (same-origin path), one product per design family and the IBGE reference point.
 * `arquivo` is `<file key>.json` — the same name the standalone prototype reads from disk (`4205407.json`, `df-ra-plano-piloto.json`).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ arquivo: string }> }) {
  if (!mundoPaginaAtiva()) return new Response(null, { status: 404 });
  const { arquivo } = await params;
  const regions = launchedRegions();
  const id = arquivo.endsWith(".json") ? idDoArquivo(arquivo.slice(0, -5), regions) : null;
  if (!id) return new Response(null, { status: 404 });
  if (!catalogReadiness(regions).ready) {
    return new Response(null, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } });
  }
  const lugar = lugarDoMundo(id, regions);
  if (!lugar) return new Response(null, { status: 404 });
  return Response.json(lugar, { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } });
}

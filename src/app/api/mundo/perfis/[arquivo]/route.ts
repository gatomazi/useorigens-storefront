import { mundoPaginaAtiva } from "@/lib/mundo/flag";
import { perfilDoMundo } from "@/lib/mundo/perfis";

export const dynamic = "force-dynamic"; // the flag is read per request (see src/lib/mundo/flag.ts)

/**
 * One curated city profile (`<file key>.json`, the same name the standalone prototype reads from contexto/perfis/). Shipped with the
 * build, so a catalog sync can never change or erase it. 404 = the place has no profile and keeps the regional scenery.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ arquivo: string }> }) {
  if (!mundoPaginaAtiva()) return new Response(null, { status: 404 });
  const { arquivo } = await params;
  const perfil = arquivo.endsWith(".json") ? perfilDoMundo(arquivo.slice(0, -5)) : null;
  if (!perfil) return new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=3600" } });
  return Response.json(perfil, { headers: { "Cache-Control": "public, max-age=3600" } });
}

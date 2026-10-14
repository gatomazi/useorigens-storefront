import perfis from "../../../../../data/mundo/perfis-cidades.json";
import { mundoPaginaAtiva } from "@/lib/mundo/flag";

export const dynamic = "force-dynamic"; // the flag is read per request (see src/lib/mundo/flag.ts)

/**
 * Curated city profiles of "Meu Pequeno Mundo" (data/mundo/perfis-cidades.json, versioned, reviewed by people — never generated).
 * Shipped with the build, so a catalog sync can never change or erase them. The experience validates every field again on load.
 */
export async function GET() {
  if (!mundoPaginaAtiva()) return new Response(null, { status: 404 });
  return Response.json(perfis, { headers: { "Cache-Control": "public, max-age=3600" } });
}

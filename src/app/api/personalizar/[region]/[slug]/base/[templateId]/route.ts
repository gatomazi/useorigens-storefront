import { loadArtworkBase } from "@/lib/customization/artwork-server";
import { studioTemplateIds } from "@/lib/customization/studio-arts";
import { publishedFor } from "@/lib/pages/public";
import { liveCustomizer } from "@/lib/site-config/pages";

/**
 * `GET /api/personalizar/sul/placa/base/<templateId>`: one base of a published model (the art, its fonts and its fields), for the live banner, which
 * loads it only once it is on screen. A GET and not a Server Action, so it is cached and never meets the Cloudflare rule on `Next-Action` requests.
 * Only the model's own bases are served. Bases are immutable, so the answer is cached for good.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ region: string; slug: string; templateId: string }> }) {
  const { region, slug, templateId } = await params;
  const found = publishedFor(region);
  const model = found ? liveCustomizer(found.bundle.docs[found.region], slug) : undefined;
  const missing = () => new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=60" } });
  if (!model || !studioTemplateIds(model).includes(templateId)) return missing();
  const base = await loadArtworkBase(templateId).catch(() => null);
  if (!base) return missing();
  return Response.json(base, { headers: { "Cache-Control": "public, max-age=31536000, immutable" } });
}

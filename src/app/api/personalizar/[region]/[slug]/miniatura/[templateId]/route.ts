import { artThumbnail } from "@/lib/customization/thumbnail-server";
import { studioTemplateIds } from "@/lib/customization/studio-arts";
import { publishedFor } from "@/lib/pages/public";
import { liveCustomizer } from "@/lib/site-config/pages";

/**
 * `GET /api/personalizar/sul/natal-em-familia/miniatura/<templateId>`: the thumbnail of one base of a published model, for its art picker.
 * Only the model's own bases are served, never another saved template. Bases are immutable, so the image is cached for good.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ region: string; slug: string; templateId: string }> }) {
  const { region, slug, templateId } = await params;
  const found = publishedFor(region);
  const model = found ? liveCustomizer(found.bundle.docs[found.region], slug) : undefined;
  const missing = () => new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=60" } });
  if (!model || !studioTemplateIds(model).includes(templateId)) return missing();
  const image = await artThumbnail(templateId).catch(() => null);
  if (!image) return missing();
  return new Response(new Uint8Array(image), { headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable" } });
}

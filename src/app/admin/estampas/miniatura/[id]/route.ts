import { adminSurface, currentActor } from "@/lib/admin/auth/guard";
import { artThumbnail } from "@/lib/customization/thumbnail-server";

export const dynamic = "force-dynamic";
/** The art-picker thumbnail of any saved base, for the admin preview of a model that is not published yet. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store" };
  const config = await adminSurface();
  if (!config || !(await currentActor(config))) return new Response(null, { status: 404, headers });
  const image = await artThumbnail((await params).id).catch(() => null);
  return image ? new Response(new Uint8Array(image), { headers: { ...headers, "Content-Type": "image/webp" } }) : new Response(null, { status: 404, headers });
}

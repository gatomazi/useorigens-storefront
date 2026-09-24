import { headers } from "next/headers";
import { checkDevAdminRequest } from "@/lib/admin/dev-guard";
import { readUpload } from "@/lib/admin/media";

export const dynamic = "force-dynamic";

/** Serves a locally uploaded image, DEV ONLY (same guard as the whole admin). The name must be a 24-hex id + ".webp"; nothing else reaches the disk. */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  if (!checkDevAdminRequest(await headers()).ok) return new Response(null, { status: 404 });
  const { file } = await params;
  const match = /^([0-9a-f]{24})\.webp$/.exec(file);
  const bytes = match ? await readUpload(match[1]) : null;
  if (!bytes) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/webp", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" } });
}

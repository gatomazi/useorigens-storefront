import { adminSurface, currentActor } from "@/lib/admin/auth/guard";
import { readUpload } from "@/lib/admin/media";
import { platform } from "@/lib/admin/platform";
import { OBJECT_KEY_RE } from "@/lib/admin/media/s3";

export const dynamic = "force-dynamic";

const HEADERS = { "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store", "Content-Security-Policy": "default-src 'none'; sandbox" };
const notFound = () => new Response(null, { status: 404 });

/**
 * Media for signed-in editors only (same guard as the whole admin; anything else is a plain 404):
 *   /admin/media/<24 hex>.webp             a local sandbox upload (development)
 *   /admin/media/<sha256>/<width>.webp     an object of the private bucket that belongs to a known upload (production drafts and library)
 * Nothing from the request other than a validated id or hash ever reaches the disk or the bucket.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string[] }> }) {
  const config = await adminSurface();
  if (!config || !(await currentActor(config))) return notFound();
  const { file } = await params;

  if (file.length === 1) {
    const match = /^([0-9a-f]{24})\.webp$/.exec(file[0]);
    const bytes = config.mode === "dev" && match ? await readUpload(match[1]) : null;
    return bytes ? new Response(new Uint8Array(bytes), { headers: { ...HEADERS, "Content-Type": "image/webp" } }) : notFound();
  }
  const key = `media/${file.join("/")}`;
  const { media } = platform();
  if (file.length !== 2 || !OBJECT_KEY_RE.test(key) || !media.knows || !media.read || !(await media.knows(key.split("/")[1]))) return notFound();
  try {
    const object = await media.read(key);
    return object ? new Response(new Uint8Array(object.body), { headers: { ...HEADERS, "Content-Type": "image/webp" } }) : notFound();
  } catch {
    return new Response(null, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}

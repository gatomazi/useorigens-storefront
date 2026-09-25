import { bucketFromEnv } from "@/lib/admin/media/bucket-env";
import { MediaCache, publishedMediaKeys, servePublishedMedia } from "@/lib/media/public-media";
import { readPublished } from "@/lib/site-config/published";

export const dynamic = "force-dynamic";

const cache = new MediaCache();
let manifest: { checksum: string; keys: Set<string> } | null = null;

/** Public images of the CMS (see src/lib/media/public-media.ts). The bucket is private; only published objects are ever returned. */
export async function GET(request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const state = readPublished(); // a local file, cached by mtime: no database, no bucket listing
  const checksum = state.source === "published" ? state.checksum : "seed";
  if (!manifest || manifest.checksum !== checksum) manifest = { checksum, keys: publishedMediaKeys(state.bundle) };
  return servePublishedMedia({ segments: (await params).key, published: manifest.keys, objects: bucketFromEnv(), cache, ifNoneMatch: request.headers.get("if-none-match") });
}

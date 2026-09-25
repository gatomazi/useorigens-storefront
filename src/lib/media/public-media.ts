import type { ObjectStore } from "../admin/media/s3";
import { MEDIA_PATH } from "../site-config/media-hosts";
import type { PublishedBundle } from "../site-config/schema";

/**
 * The storefront's own `/media/<sha256>/<width>.webp` route: the ONLY way a visitor reaches an uploaded image (the bucket itself is private).
 * Rules, all enforced here and unit-tested:
 *   - the path must be exactly the layout the CMS writes: no traversal, no other prefix, no query, nothing user-supplied reaches the bucket;
 *   - it must be listed in the PUBLISHED manifest (the bundle's media table, read from the local published.json): an unpublished upload, a
 *     draft, another object of the bucket or a guessed hash is a 404, indistinguishable from "does not exist";
 *   - no database and no per-request listing: the manifest is local, the bytes come from the bucket and are kept in a small in-memory LRU;
 *   - the object name is a content hash, so the answer is immutable and cacheable for a year; errors are never cacheable.
 */
export function publishedMediaKeys(bundle: PublishedBundle): Set<string> {
  const keys = new Set<string>();
  for (const m of Object.values(bundle.media)) {
    for (const src of [m.src, ...(m.variants ?? []).map((v) => v.src)]) if (MEDIA_PATH.test(src)) keys.add(src.slice(1));
  }
  return keys;
}

const HEADERS = {
  "Content-Type": "image/webp",
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "public, max-age=31536000, immutable",
  "Content-Security-Policy": "default-src 'none'; sandbox",
} as const;
const NOT_FOUND = () => new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

export class MediaCache {
  private items = new Map<string, Buffer>();
  private bytes = 0;
  constructor(private readonly maxBytes: number = 32 * 1024 * 1024) {}
  get(key: string): Buffer | undefined {
    const v = this.items.get(key);
    if (v) {
      this.items.delete(key);
      this.items.set(key, v); // most recently used goes last
    }
    return v;
  }
  set(key: string, value: Buffer): void {
    if (value.length > this.maxBytes / 4) return; // never let one object evict the rest
    this.items.set(key, value);
    this.bytes += value.length;
    for (const [k, v] of this.items) {
      if (this.bytes <= this.maxBytes) break;
      this.items.delete(k);
      this.bytes -= v.length;
    }
  }
  get size(): number {
    return this.items.size;
  }
}

export async function servePublishedMedia(input: { segments: string[]; published: Set<string>; objects: ObjectStore | null; cache: MediaCache; ifNoneMatch?: string | null }): Promise<Response> {
  const path = `/media/${input.segments.join("/")}`;
  if (!MEDIA_PATH.test(path)) return NOT_FOUND();
  const key = path.slice(1);
  if (!input.published.has(key)) return NOT_FOUND();
  const etag = `"${key.split("/")[1].slice(0, 16)}-${key.split("/")[2].replace(".webp", "")}"`;
  if (input.ifNoneMatch === etag) return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": HEADERS["Cache-Control"] } });

  let body = input.cache.get(key);
  if (!body) {
    if (!input.objects) return NOT_FOUND();
    try {
      const object = await input.objects.get(key);
      if (!object) return NOT_FOUND();
      body = object.body;
      input.cache.set(key, body);
    } catch {
      // The bucket failed: never cache that answer, and never break a page (the section falls back to its colour/gradient).
      return new Response(null, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
  }
  return new Response(new Uint8Array(body), { headers: { ...HEADERS, ETag: etag, "Content-Length": String(body.length) } });
}

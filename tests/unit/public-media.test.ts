import { describe, expect, test } from "vitest";
import type { ObjectStore } from "@/lib/admin/media/s3";
import { MediaCache, publishedMediaKeys, servePublishedMedia } from "@/lib/media/public-media";
import { buildSeedBundle } from "@/lib/site-config/seed";
import type { PublishedBundle } from "@/lib/site-config/schema";

const SHA = "c".repeat(64);
const OTHER = "d".repeat(64);
const key = (sha: string, w: number) => `media/${sha}/${w}.webp`;
const bundle = (): PublishedBundle => {
  const b = buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null });
  b.media["upload:A"] = { src: `/${key(SHA, 1080)}`, width: 1080, height: 400, variants: [{ w: 640, src: `/${key(SHA, 640)}` }, { w: 1080, src: `/${key(SHA, 1080)}` }] };
  return b;
};
const objects = (present: string[] = [key(SHA, 640), key(SHA, 1080), key(OTHER, 640)]) => {
  const gets: string[] = [];
  const store: ObjectStore = {
    async put() {},
    async get(k) { gets.push(k); return present.includes(k) ? { body: Buffer.from(`bytes:${k}`), contentType: "image/webp" } : null; },
    async exists() { return true; },
    async remove() { throw new Error("never"); },
  };
  return { store, gets };
};
const serve = (segments: string[], o: ReturnType<typeof objects> | null, cache = new MediaCache(), extra: { ifNoneMatch?: string | null } = {}) =>
  servePublishedMedia({ segments, published: publishedMediaKeys(bundle()), objects: o?.store ?? null, cache, ...extra });

describe("public media route", () => {
  test("given a published object, when requested, then it is served as immutable, nosniff, sandboxed WebP with an ETag", async () => {
    const r = await serve([SHA, "640.webp"], objects());
    expect(r.status).toBe(200);
    expect(Object.fromEntries(r.headers)).toMatchObject({ "content-type": "image/webp", "x-content-type-options": "nosniff", "cache-control": "public, max-age=31536000, immutable" });
    expect(r.headers.get("content-security-policy")).toContain("sandbox");
    expect(Buffer.from(await r.arrayBuffer()).toString()).toBe(`bytes:${key(SHA, 640)}`);
    expect(r.headers.get("etag")).toBeTruthy();
  });

  test("given an object that is in the bucket but NOT in the published manifest, when requested, then it is a 404 (drafts and other objects are never readable)", async () => {
    const o = objects();
    const r = await serve([OTHER, "640.webp"], o);
    expect(r.status).toBe(404);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(o.gets).toEqual([]); // the bucket was not even asked
  });

  test("given traversal, other extensions, other prefixes, encoded tricks or too many segments, when requested, then 404 and no bucket access", async () => {
    const o = objects();
    for (const segs of [["..", "etc", "passwd"], [SHA, "640.svg"], [SHA, "640.webp", "extra"], ["short", "640.webp"], [SHA.toUpperCase(), "640.webp"], [SHA, "..%2f640.webp"], [SHA, "640.webp?x=1"], [SHA, "6400000.webp"], [""], []]) {
      expect((await serve(segs, o)).status, segs.join("/")).toBe(404);
    }
    expect(o.gets).toEqual([]);
  });

  test("given the same object twice, when requested, then the second comes from memory and a matching If-None-Match is a 304", async () => {
    const o = objects();
    const cache = new MediaCache();
    const first = await serve([SHA, "1080.webp"], o, cache);
    await serve([SHA, "1080.webp"], o, cache);
    expect(o.gets).toHaveLength(1);
    const etag = first.headers.get("etag")!;
    const again = await serve([SHA, "1080.webp"], o, cache, { ifNoneMatch: etag });
    expect(again.status).toBe(304);
  });

  test("given the bucket fails or is not configured, when requested, then it is a non-cacheable 502 / 404 and never an exception", async () => {
    const broken: ReturnType<typeof objects> = { gets: [], store: { async put() {}, async get() { throw new Error("boom"); }, async exists() { return true; }, async remove() {} } };
    const r = await serve([SHA, "640.webp"], broken);
    expect(r.status).toBe(502);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect((await serve([SHA, "640.webp"], null)).status).toBe(404);
    expect((await serve([SHA, "1080.webp"], objects([]))).status).toBe(404); // published but missing from the bucket
  });

  test("given a bundle, when its manifest is built, then only same-origin /media entries and their variants count", () => {
    const b = bundle();
    b.media["legacy:x"] = { src: "/banners/sul/hero.png", width: 10, height: 10 };
    expect([...publishedMediaKeys(b)].sort()).toEqual([key(SHA, 1080), key(SHA, 640)].sort());
  });

  test("given a small cache, when it fills, then the least recently used entries go first and a huge object is never kept", () => {
    const c = new MediaCache(100);
    c.set("a", Buffer.alloc(20));
    c.set("b", Buffer.alloc(20));
    c.set("c", Buffer.alloc(20));
    c.get("a");
    c.set("d", Buffer.alloc(20));
    c.set("e", Buffer.alloc(20));
    c.set("f", Buffer.alloc(20));
    expect(c.get("a")).toBeDefined();
    expect(c.get("b")).toBeUndefined();
    c.set("huge", Buffer.alloc(60));
    expect(c.get("huge")).toBeUndefined();
  });
});

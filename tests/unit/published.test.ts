import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { readPublished, siteConfigDir } from "@/lib/site-config/published";
import { sanitizeBundle } from "@/lib/site-config/sanitize";
import { buildSeedBundle } from "@/lib/site-config/seed";
import type { PublishedBundle, Section } from "@/lib/site-config/schema";

const ENV = { metaPixelId: "1558923262073052", ga4MeasurementId: "G-8GYTEJ1F77" };
const seed = () => buildSeedBundle(ENV);
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const sul = (b: PublishedBundle): Section[] => b.docs.sul.home!.sections;
const newSection = (id: string, anchor: string): Section => ({
  id, anchor, headingId: `${anchor}-title`, template: "product-carousel", active: true, title: "Nova", subtitle: "x",
  layout: { variant: "standard", tone: "light", surface: "plain" },
  source: { kind: "ink-category", store: "use-sul", collectionId: 152188, order: "category", limit: 6 },
  analyticsSource: "homeTerra",
  appearance: { fill: { kind: "none" }, focal: { mobile: { x: 50, y: 50 }, desktop: { x: 50, y: 50 } }, overlay: { preset: "none" } },
});

describe("tolerant published reader (sanitize)", () => {
  test("given the seed itself as a published bundle, when sanitized, then nothing is dropped", () => {
    const r = sanitizeBundle(seed(), seed());
    expect(r.diagnostics).toEqual([]);
    expect(sul(r.bundle!).map((s) => s.anchor)).toEqual(sul(seed()).map((s) => s.anchor));
  });

  test("given non-objects or an incompatible version, when sanitized, then there is no bundle (the caller uses the seed)", () => {
    for (const raw of [null, 5, "x", []]) expect(sanitizeBundle(raw, seed()).bundle).toBeNull();
    const v2 = { ...seed(), schemaVersion: 2 };
    const r = sanitizeBundle(v2, seed());
    expect(r.bundle).toBeNull();
    expect(r.diagnostics[0]).toContain("incompatible schemaVersion 2");
  });

  test("given an invalid optional section, when sanitized, then only that section is dropped and the rest of the home survives", () => {
    const b = clone(seed());
    sul(b).splice(3, 0, { ...newSection("bad", "bad-one"), cta: { label: "Ver", dest: { kind: "external", url: "https://evil.example/x" } } });
    const r = sanitizeBundle(b, seed());
    expect(sul(r.bundle!).map((s) => s.id)).not.toContain("bad");
    expect(sul(r.bundle!).length).toBe(sul(seed()).length);
    expect(r.diagnostics.join()).toContain("dropped");
  });

  test("given a valid new section, when sanitized, then it is kept in place", () => {
    const b = clone(seed());
    sul(b).splice(3, 0, newSection("colecao-1", "colecao-1"));
    expect(sul(sanitizeBundle(b, seed()).bundle!).map((s) => s.id)[3]).toBe("colecao-1");
  });

  test("given an invalid hero or footer, when sanitized, then the whole scope falls back to the seed document", () => {
    const b = clone(seed());
    (sul(b)[0] as { title: string }).title = "";
    const r = sanitizeBundle(b, seed());
    expect(sul(r.bundle!)[0].title).toBe(sul(seed())[0].title);
    expect(r.diagnostics.join()).toContain("using the seed");
  });

  test("given duplicate anchors, when sanitized, then the later one is dropped", () => {
    const b = clone(seed());
    sul(b).splice(3, 0, newSection("dup-a", "terra"));
    const r = sanitizeBundle(b, seed());
    expect(sul(r.bundle!).filter((s) => s.anchor === "terra")).toHaveLength(1);
  });

  test("given an image the media table does not know, when sanitized, then the image is dropped and the section keeps its fill", () => {
    const b = clone(seed());
    sul(b)[0].appearance.image = { mobile: { assetId: "ghost", alt: "", decorative: true }, desktop: sul(b)[0].appearance.image!.desktop };
    const r = sanitizeBundle(b, seed());
    expect(sul(r.bundle!)[0].appearance.image?.mobile).toBeUndefined();
    expect(sul(r.bundle!)[0].appearance.image?.desktop).toBeDefined();
    expect(sul(r.bundle!)[0].appearance.fill).toEqual(sul(seed())[0].appearance.fill);
  });

  test("given a scope document that is missing, when sanitized, then that scope uses the seed", () => {
    const b = clone(seed()) as unknown as { docs: Record<string, unknown> };
    delete b.docs.norte;
    const r = sanitizeBundle(b, seed());
    expect(r.bundle!.docs.norte).toEqual(seed().docs.norte);
  });

  test("given a corrupt media entry, when sanitized, then it is ignored (traversal paths never reach an <img>)", () => {
    const b = clone(seed());
    b.media["evil"] = { src: "/banners/../../etc/passwd", width: 10, height: 10 };
    expect(sanitizeBundle(b, seed()).bundle!.media["evil"]).toBeUndefined();
  });
});

describe("published.json reader (file)", () => {
  let dir: string;
  let file: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "published-"));
    file = path.join(dir, "published.json");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  const write = (v: unknown) => writeFile(file, typeof v === "string" ? v : JSON.stringify(v));

  test("given no file, when read, then the seed is used with the reason (never a blank page)", () => {
    const r = readPublished(file);
    expect(r.source).toBe("seed");
    expect(sul(r.bundle).map((s) => s.anchor)).toEqual(sul(seed()).map((s) => s.anchor));
  });

  test("given a corrupt file, when read, then the seed is used", async () => {
    await write("{oops");
    expect(readPublished(file).source).toBe("seed");
  });

  test("given a version-incompatible file, when read, then the seed is used with that reason", async () => {
    await write({ ...seed(), schemaVersion: 9 });
    const r = readPublished(file);
    expect(r.source).toBe("seed");
    expect(r.source === "seed" && r.reason).toContain("incompatible");
  });

  test("given a valid file, when read, then it is used, with a checksum", async () => {
    const b = clone(seed());
    b.releaseId = "7";
    sul(b).splice(3, 0, newSection("colecao-1", "colecao-1"));
    await write(b);
    const r = readPublished(file);
    expect(r.source).toBe("published");
    expect(r.bundle.releaseId).toBe("7");
    expect(sul(r.bundle).map((s) => s.id)).toContain("colecao-1");
    expect(r.source === "published" && r.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  test("given a file that changes on disk, when read again, then the new content is served (cache follows mtime)", async () => {
    const a = clone(seed());
    a.releaseId = "1";
    await write(a);
    expect(readPublished(file).bundle.releaseId).toBe("1");
    const b = clone(seed());
    b.releaseId = "2";
    await write(b);
    await utimes(file, new Date(Date.now() + 5000), new Date(Date.now() + 5000));
    expect(readPublished(file).bundle.releaseId).toBe("2");
  });

  test("given the file is deleted after being read, when read again, then it falls back to the seed", async () => {
    await write(seed());
    expect(readPublished(file).source).toBe("published");
    await rm(file);
    expect(readPublished(file).source).toBe("seed");
  });

  test("given a relative SITE_CONFIG_DIR, when the directory is resolved, then it is refused", () => {
    const env = process.env;
    process.env = { ...env, SITE_CONFIG_DIR: "relative/dir" };
    try {
      expect(() => siteConfigDir()).toThrow(/absolute/);
    } finally {
      process.env = env;
    }
  });

  test("given a valid enablement list, when sanitized, then it is kept as it is", () => {
    const b = clone(seed());
    b.docs.sul.collections = { enabled: [{ store: "use-sul", collectionId: 152122 }] };
    const r = sanitizeBundle(b, seed());
    expect(r.diagnostics).toEqual([]);
    expect(r.bundle!.docs.sul.collections).toEqual({ enabled: [{ store: "use-sul", collectionId: 152122 }] });
  });

  test("given a malformed enablement list, when sanitized, then only the list is dropped and the whole home survives", () => {
    const b = clone(seed());
    (b.docs.sul as { collections?: unknown }).collections = { enabled: [{ store: "use-mars", collectionId: "x" }] };
    const r = sanitizeBundle(b, seed());
    expect(r.diagnostics.join(" ")).toContain("collections list is invalid");
    expect(r.bundle!.docs.sul.collections).toBeUndefined();
    expect(sul(r.bundle!).map((s) => s.anchor)).toEqual(sul(seed()).map((s) => s.anchor));
  });
});

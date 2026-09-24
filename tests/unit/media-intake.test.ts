import sharp from "sharp";
import { describe, expect, test } from "vitest";
import { processImage, safeLabel } from "@/lib/admin/media/process";
import { allowedMediaOrigins, isAllowedMediaSrc, MEDIA_ORIGIN } from "@/lib/site-config/media-hosts";
import { parseMediaInfo, validateBundle } from "@/lib/site-config/schema";
import { sanitizeBundle } from "@/lib/site-config/sanitize";
import { buildSeedBundle } from "@/lib/site-config/seed";

const SHA = "b".repeat(64);
const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 40, b: 40 } } }).png().toBuffer();

describe("image intake", () => {
  test("given a wide PNG, when processed, then WebP variants ascend, the largest is capped at 2400, and luminance is measured", async () => {
    const r = await processImage(await png(3000, 1000));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.image.variants.map((v) => v.w)).toEqual([640, 1080, 1600, 2400]);
    expect(r.image).toMatchObject({ width: 2400, height: 800, format: "png" });
    expect(r.image.avgLuminance).toBeGreaterThan(0.2);
    expect(r.image.avgLuminance).toBeLessThan(0.6);
    for (const v of r.image.variants) expect((await sharp(v.data).metadata()).format).toBe("webp");
  });

  test("given a small image, when processed, then it is never enlarged: only widths below it, plus itself", async () => {
    const r = await processImage(await png(700, 400));
    expect(r.ok && r.image.variants.map((v) => v.w)).toEqual([640, 700]);
  });

  test("given identical uploads, when hashed, then the digest is stable (deduplication key)", async () => {
    const buf = await png(300, 200);
    const [a, b] = await Promise.all([processImage(buf), processImage(buf)]);
    expect(a.ok && b.ok && a.image.sha256 === b.image.sha256).toBe(true);
  });

  test("given an SVG, a fake PNG, an empty file or an oversized one, when processed, then each is refused with a reason", async () => {
    const svg = await processImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>1</script></svg>'));
    expect(svg).toMatchObject({ ok: false });
    expect(await processImage(Buffer.from("this is not a png at all"))).toMatchObject({ ok: false });
    expect(await processImage(Buffer.alloc(0))).toEqual({ ok: false, error: "arquivo vazio" });
    expect(await processImage(Buffer.alloc(8 * 1024 * 1024 + 1, 1))).toEqual({ ok: false, error: "arquivo acima de 8 MB" });
  });

  test("given a GIF, when processed, then it is refused (only PNG, JPEG, WebP and AVIF)", async () => {
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).gif().toBuffer();
    expect(await processImage(gif)).toMatchObject({ ok: false, error: expect.stringContaining("formato não permitido") });
  });

  test("given an image above 6000 px a side, when processed, then it is refused before any resize", async () => {
    const wide = await sharp({ create: { width: 6001, height: 8, channels: 3, background: "#000" } }).png().toBuffer();
    expect(await processImage(wide)).toEqual({ ok: false, error: "imagem acima de 6000 px de lado" });
  });

  test("given an EXIF-rotated JPEG, when processed, then the orientation is applied to the output dimensions", async () => {
    const rotated = await sharp({ create: { width: 800, height: 200, channels: 3, background: "#123456" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const r = await processImage(rotated);
    expect(r.ok && [r.image.width, r.image.height]).toEqual([200, 800]);
  });

  test("given a hostile file name, when labelled, then only a short safe subset survives", () => {
    expect(safeLabel("../../etc/passwd.png")).toBe("passwd");
    expect(safeLabel('<img src=x onerror=alert(1)>.png')).toBe("img srcx onerroralert1");
    expect(safeLabel("")).toBe("imagem");
  });
});

describe("published media hosts", () => {
  const good = `${MEDIA_ORIGIN}/media/${SHA}/1080.webp`;
  test("given the media origin's object layout, when checked, then it is allowed; local /public paths too", () => {
    expect(isAllowedMediaSrc(good)).toBe(true);
    expect(isAllowedMediaSrc("/banners/sul/hero-mobile.png")).toBe(true);
  });

  test("given any other host, scheme, path shape, credentials or query, when checked, then it is refused", () => {
    for (const bad of [`https://evil.example/media/${SHA}/1080.webp`, `http://media.useorigens.com.br/media/${SHA}/1080.webp`, `${MEDIA_ORIGIN}/other/${SHA}.webp`, `${MEDIA_ORIGIN}/media/${SHA}/1080.svg`, `${MEDIA_ORIGIN}/media/${SHA}/1080.webp?x=1`, `https://user:pw@media.useorigens.com.br/media/${SHA}/1080.webp`, "//evil.example/x.png", "/a/../b.png", "javascript:alert(1)", 5, null]) expect(isAllowedMediaSrc(bad), String(bad)).toBe(false);
  });

  test("given an owner-configured extra origin, when checked, then only that exact origin is added", () => {
    const env = { MEDIA_EXTRA_ORIGINS: "http://127.0.0.1:4600, https://staging-media.example.com" };
    expect(allowedMediaOrigins(env)).toEqual([MEDIA_ORIGIN, "http://127.0.0.1:4600", "https://staging-media.example.com"]);
    expect(isAllowedMediaSrc(`http://127.0.0.1:4600/media/${SHA}/640.webp`, env)).toBe(true);
    expect(isAllowedMediaSrc(`http://127.0.0.1:4601/media/${SHA}/640.webp`, env)).toBe(false);
  });

  test("given a media entry with variants, when parsed, then valid ones are kept and malformed ones are dropped", () => {
    const info = { src: good, width: 2400, height: 800, variants: [{ w: 640, src: `${MEDIA_ORIGIN}/media/${SHA}/640.webp` }, { w: 2400, src: good }] };
    expect(parseMediaInfo(info)).toEqual(info);
    expect(parseMediaInfo({ ...info, variants: [] })).toBeNull();
    expect(parseMediaInfo({ ...info, variants: [{ w: 10, src: good }] })).toBeNull();
    expect(parseMediaInfo({ ...info, variants: [{ w: 640, src: "https://evil.example/x.webp" }] })).toBeNull();
    expect(parseMediaInfo({ src: good, width: 0, height: 5 })).toBeNull();
  });

  test("given a bundle whose media table points at a foreign host, when validated strictly, then it is refused; the tolerant reader ignores that entry only", () => {
    const seed = buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null });
    const bad = { ...seed, media: { ...seed.media, "upload:X": { src: "https://evil.example/media/x.webp", width: 10, height: 10 } } };
    expect(validateBundle(bad).ok).toBe(false);
    const r = sanitizeBundle(bad, seed);
    expect(r.bundle).not.toBeNull();
    expect(r.bundle!.media["upload:X"]).toBeUndefined();
    expect(r.diagnostics.join(" ")).toContain("upload:X");
  });
});

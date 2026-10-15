import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { pickHoverPhoto, readUmaPencaHover, syncUmaPencaHover, umaPencaHoverPhotos } from "@/lib/umapenca/hover";
import { umaPencaLookup } from "@/lib/umapenca/carousel";
import type { UmaPencaArticle, UmaPencaSnapshot } from "@/lib/umapenca/types";

const IMG = (name: string, ext = "jpg") => `https://umapenca.imgix.net/430102/${name}.${ext}`;
const MAIN = `${IMG("map-side")}?auto=compress,format&cs=origin&q=65`;

// Same shape as the gallery JSON the real product page embeds (artigos.useorigens.com.br/caneca/la-de-porto-alegre-430102.html).
function page(images: object[]): string {
  return `<html><script>var product = {"id":430102,"name":"Caneca L\\u00e1 de Porto Alegre","images":${JSON.stringify(images)},"tags":["a]b"]};</script></html>`;
}
const REAL_GALLERY = [
  { id: 1, type_id: 1, main: false, order: 1, url: IMG("print-file", "png"), is_video: false },
  { id: 2, type_id: 6, main: false, order: 1, url: IMG("other-side"), is_video: false },
  { id: 3, type_id: 6, main: true, order: 2, url: IMG("map-side"), is_video: false },
  { id: 4, type_id: 6, main: false, order: 3, url: IMG("both-sides"), is_video: false },
];

describe("pickHoverPhoto", () => {
  test("given the real gallery, then it is the first mockup that is not the card's photo — never the print file", () => {
    expect(pickHoverPhoto(page(REAL_GALLERY), MAIN)).toBe(IMG("other-side"));
  });

  test("the card's own photo is skipped even when the page does not flag it as main, and gallery order wins over array order", () => {
    const gallery = [
      { type_id: 6, order: 3, url: IMG("both-sides") },
      { type_id: 6, order: 1, url: IMG("map-side") },
      { type_id: 6, order: 2, url: IMG("other-side") },
    ];
    expect(pickHoverPhoto(page(gallery), MAIN)).toBe(IMG("other-side"));
  });

  test("no second photo, a video, a foreign host or no gallery at all is null", () => {
    expect(pickHoverPhoto(page([REAL_GALLERY[0], REAL_GALLERY[2]]), MAIN)).toBeNull();
    expect(pickHoverPhoto(page([{ type_id: 6, order: 1, url: IMG("clip"), is_video: true }]), MAIN)).toBeNull();
    expect(pickHoverPhoto(page([{ type_id: 6, order: 1, url: "https://evil.example/x.jpg" }]), MAIN)).toBeNull();
    expect(pickHoverPhoto("<html>store page</html>", MAIN)).toBeNull();
    expect(pickHoverPhoto('"images":[{"url":', MAIN)).toBeNull();
  });
});

const article = (id: string): UmaPencaArticle => ({ id, kind: "caneca", title: `Caneca ${id}`, description: "", url: `https://artigos.useorigens.com.br/caneca/x-${id}.html`, imageUrl: MAIN, additionalImageUrls: [], price: 69.9, salePrice: null, color: null });

describe("syncUmaPencaHover (manual, fetch-once)", () => {
  let dir: string;
  let snapshotPath: string;
  let filePath: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "umapenca-hover-"));
    snapshotPath = path.join(dir, "umapenca-snapshot.json");
    filePath = path.join(dir, "umapenca-hover.json");
    const snapshot: UmaPencaSnapshot = { version: 1, syncedAt: "2026-10-07T00:00:00.000Z", articles: [article("1"), article("2")] };
    writeFileSync(snapshotPath, JSON.stringify(snapshot));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const okPage = () => vi.fn(async () => new Response(page(REAL_GALLERY), { status: 200 }));
  const now = () => new Date("2026-10-07T12:00:00.000Z");

  test("fetches each product page once and stores the photo; a second run fetches nothing", async () => {
    const fetchImpl = okPage();
    const first = await syncUmaPencaHover({ fetchImpl, filePath, snapshotPath, now });
    expect(first).toEqual({ ok: true, fetched: [{ id: "1", url: IMG("other-side") }, { id: "2", url: IMG("other-side") }], kept: 0, missing: [] });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(JSON.parse(readFileSync(filePath, "utf8"))).toEqual({ version: 1, photos: { "1": { url: IMG("other-side"), fetchedAt: now().toISOString() }, "2": { url: IMG("other-side"), fetchedAt: now().toISOString() } } });

    const again = okPage();
    expect(await syncUmaPencaHover({ fetchImpl: again, filePath, snapshotPath, now })).toEqual({ ok: true, fetched: [], kept: 2, missing: [] });
    expect(again).not.toHaveBeenCalled();
  });

  test("refresh fetches again, and a page that fails keeps the photo it already had", async () => {
    await syncUmaPencaHover({ fetchImpl: okPage(), filePath, snapshotPath, now });
    const fetchImpl = vi.fn(async (url: string | URL | Request) => (String(url).includes("x-1") ? new Response("gone", { status: 404 }) : new Response(page(REAL_GALLERY.slice(0, 2)), { status: 200 })));
    const result = await syncUmaPencaHover({ refresh: true, fetchImpl: fetchImpl as typeof fetch, filePath, snapshotPath, now });
    expect(result).toEqual({ ok: true, fetched: [{ id: "2", url: IMG("other-side") }], kept: 0, missing: [{ id: "1", reason: "product page answered HTTP 404" }] });
    expect(readUmaPencaHover(filePath)?.photos["1"]?.url).toBe(IMG("other-side"));
  });

  test("without a feed snapshot nothing is fetched", async () => {
    const fetchImpl = okPage();
    expect(await syncUmaPencaHover({ fetchImpl, filePath, snapshotPath: path.join(dir, "none.json") })).toEqual({ ok: false, error: "no Uma Penca snapshot yet — run the feed sync first" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("hover photos on the cards", () => {
  test("only photos on an allowed image host are served", () => {
    const file = { version: 1 as const, photos: { "1": { url: IMG("other-side"), fetchedAt: "" }, "2": { url: "https://evil.example/x.jpg", fetchedAt: "" } } };
    expect(umaPencaHoverPhotos(() => file)).toEqual({ "1": IMG("other-side") });
    expect(umaPencaHoverPhotos(() => null)).toEqual({});
  });

  test("a carousel item carries the hover photo when its article has one, and no key at all otherwise", () => {
    const snapshot: UmaPencaSnapshot = { version: 1, syncedAt: "", articles: [article("1"), article("2")] };
    const result = umaPencaLookup("sul", () => snapshot, () => ({ "1": IMG("other-side") }))(["caneca"], 10);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.items[0].hoverImageUrl).toBe(IMG("other-side"));
    expect("hoverImageUrl" in result.items[1]).toBe(false);
  });
});

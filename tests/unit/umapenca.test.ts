import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { articleKindOf, parsePrice, parseUmaPencaFeed } from "@/lib/umapenca/parse";
import { isUmaPencaImageUrl, isUmaPencaProductUrl } from "@/lib/umapenca/hosts";
import { readUmaPencaSnapshot } from "@/lib/umapenca/snapshot";
import { shouldPromoteArticles, syncUmaPenca } from "@/lib/umapenca/sync";

const IMG = "https://umapenca.imgix.net/316674/54b90870-31d3-4b69-8e01-f6bff4cc7c18.jpg?auto=compress,format&amp;cs=origin&amp;q=65";

// Same shape as the real Uma Penca Google feed (Atom + g: namespace, CDATA text).
function entry(fields: Record<string, string>): string {
  const g = { id: "316674", title: "<![CDATA[ Caneca Full Stack Fuel ]]>", description: "<![CDATA[ ]]>", link: "https://umapenca.com/useorigens/caneca/full-stack-fuel-316674.html", image_link: `<![CDATA[ ${IMG.replaceAll("&amp;", "&")} ]]>`, brand: "Use Origens", condition: "new", availability: "in stock", price: "59.99 BRL", color: "Multicolorido", category: "<![CDATA[ Caneca ]]>", google_product_category: "2169", product_type: "<![CDATA[ ]]>", additional_image_link: "<![CDATA[ ]]>", ...fields };
  return `<entry>${Object.entries(g).map(([k, v]) => `<g:${k}>${v}</g:${k}>`).join("")}</entry>`;
}
const feed = (...entries: string[]) =>
  `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:g="http://base.google.com/ns/1.0"><title>Use Origens</title><link rel="self" href="https://umapenca.com/useorigens/"/>${entries.join("")}</feed>`;

describe("Uma Penca feed parser", () => {
  test("given the real feed shape, then an entry becomes an article with CDATA unwrapped and the price in BRL", () => {
    const { articles, excluded, entryCount } = parseUmaPencaFeed(feed(entry({})));
    expect(entryCount).toBe(1);
    expect(excluded).toEqual([]);
    expect(articles).toEqual([
      {
        id: "316674",
        kind: "caneca",
        title: "Caneca Full Stack Fuel",
        description: "",
        url: "https://umapenca.com/useorigens/caneca/full-stack-fuel-316674.html",
        imageUrl: IMG.replaceAll("&amp;", "&"),
        additionalImageUrls: [],
        price: 59.99,
        salePrice: null,
        color: "Multicolorido",
      },
    ]);
  });

  test("given an ecobag, a sale price and entity-encoded text, then kind, sale price and text are read as-is", () => {
    const { articles } = parseUmaPencaFeed(
      feed(entry({ id: "9", title: "Ecobag Torres &amp; Mar", category: "<![CDATA[ Bolsas ]]>", product_type: "Ecobag", price: "79.90 BRL", sale_price: "69.90 BRL" })),
    );
    expect(articles[0]).toMatchObject({ id: "9", kind: "ecobag", title: "Ecobag Torres & Mar", price: 79.9, salePrice: 69.9 });
  });

  test("given entries that cannot be shown, then each is excluded with a reason and never repaired", () => {
    const { articles, excluded } = parseUmaPencaFeed(
      feed(
        entry({ id: "1", category: "Camiseta", title: "Camiseta Tijucas" }),
        entry({ id: "2", availability: "out of stock" }),
        entry({ id: "3", link: "https://evil.example/caneca" }),
        entry({ id: "4", image_link: "https://cdn.example/x.jpg" }),
        entry({ id: "5" }),
        entry({ id: "5" }),
      ),
    );
    expect(articles.map((a) => a.id)).toEqual(["5"]);
    expect(excluded.map((e) => [e.id, e.reason.split(":")[0]])).toEqual([
      ["1", "not a caneca or ecobag"],
      ["2", "out of stock"],
      ["3", "link is not an https umapenca.com URL"],
      ["4", "image is not on an allowed Uma Penca image host"],
      ["5", "duplicate id"],
    ]);
  });

  test("given the real Use Origens feed (no g:category, empty product_type, links on artigos.useorigens.com.br, integer price), then its mug is kept", () => {
    const xml = readFileSync(path.join(import.meta.dirname, "../fixtures/umapenca-google-feed.xml"), "utf8");
    const { articles, excluded } = parseUmaPencaFeed(xml);
    expect(excluded).toEqual([]);
    expect(articles).toEqual([
      {
        id: "426949",
        kind: "caneca",
        title: "Caneca Lá de Aceguá",
        description: "",
        url: "https://artigos.useorigens.com.br/caneca/la-de-acegua-426949.html",
        imageUrl: "https://umapenca.imgix.net/426949/29a74b83-76b8-42a4-a873-f1d3bcab0255.jpg?auto=compress,format&cs=origin&q=65",
        additionalImageUrls: [],
        price: 90,
        salePrice: null,
        color: "Multicolorido",
      },
    ]);
  });

  test("given the real Meta feed (the one in use: it carries g:category), then it yields exactly the same article as the Google feed", () => {
    const read = (name: string) => parseUmaPencaFeed(readFileSync(path.join(import.meta.dirname, `../fixtures/${name}`), "utf8"));
    const meta = read("umapenca-facebook-feed.xml");
    expect(meta.excluded).toEqual([]);
    expect(meta.articles).toEqual(read("umapenca-google-feed.xml").articles);
    expect(articleKindOf(["Caneca", "", "Lá de Aceguá"])).toBe("caneca"); // the category alone decides, whatever the title says
  });

  test("given a title that does not name the kind, then the product URL's first segment decides", () => {
    const { articles } = parseUmaPencaFeed(feed(entry({ title: "Lá de Aceguá", category: "", link: "https://artigos.useorigens.com.br/ecobag/la-de-acegua-1.html" })));
    expect(articles[0]?.kind).toBe("ecobag");
  });

  test("given an RSS <item> feed, then it is read the same way", () => {
    expect(parseUmaPencaFeed(`<rss><channel>${entry({}).replace(/^<entry>|<\/entry>$/g, "").replace(/^/, "<item>")}</item></channel></rss>`).articles).toHaveLength(1);
  });

  test("prices and kinds are never invented", () => {
    expect(parsePrice("59.99 BRL")).toBe(59.99);
    expect(parsePrice("59,99")).toBe(59.99);
    expect(parsePrice("12.00 USD")).toBeNull();
    expect(parsePrice("")).toBeNull();
    expect(articleKindOf(["", "", "Caneca Gênio"])).toBe("caneca");
    expect(articleKindOf(["Eco Bag"])).toBe("ecobag");
    expect(articleKindOf(["Camiseta", "Boné"])).toBeNull();
  });

  test("hosts: only https umapenca.com links and the imgix photo hosts pass", () => {
    expect(isUmaPencaProductUrl("https://umapenca.com/useorigens/x.html")).toBe(true);
    expect(isUmaPencaProductUrl("https://loja.umapenca.com/x")).toBe(true);
    expect(isUmaPencaProductUrl("https://artigos.useorigens.com.br/caneca/la-de-acegua-426949.html")).toBe(true);
    expect(isUmaPencaProductUrl("https://www.useorigens.com.br/caneca/x.html")).toBe(false);
    expect(isUmaPencaProductUrl("https://artigos.useorigens.com.br.evil.io/x")).toBe(false);
    expect(isUmaPencaProductUrl("http://umapenca.com/x")).toBe(false);
    expect(isUmaPencaProductUrl("https://umapenca.com.evil.io/x")).toBe(false);
    expect(isUmaPencaImageUrl("https://uma-penca.imgix.net/a.png")).toBe(true);
    expect(isUmaPencaImageUrl("https://imgix.net/a.png")).toBe(false);
  });
});

describe("Uma Penca sync", () => {
  let dir: string;
  let file: string;
  const env = process.env;
  const respond = (body: string, status = 200) => vi.fn(async () => new Response(body, { status }));

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "umapenca-"));
    file = path.join(dir, "umapenca-snapshot.json");
    process.env = { ...env, UMAPENCA_FEED_URL: "https://umapenca.com/useorigens/abc/feed/google.xml" };
  });
  afterEach(() => {
    process.env = env;
    rmSync(dir, { recursive: true, force: true });
  });

  test("given no feed URL, then nothing is fetched", async () => {
    delete process.env.UMAPENCA_FEED_URL;
    const fetchImpl = respond("");
    expect(await syncUmaPenca({ fetchImpl, filePath: file })).toEqual({ ok: false, error: "UMAPENCA_FEED_URL is not configured" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("given the HTML page Uma Penca serves while the feed is not live, then it is an error, never an empty shelf", async () => {
    expect(await syncUmaPenca({ fetchImpl: respond("<!DOCTYPE html><html>…</html>", 404), filePath: file })).toMatchObject({ ok: false, error: "feed answered HTTP 404" });
    expect(await syncUmaPenca({ fetchImpl: respond("<!DOCTYPE html><html>…</html>"), filePath: file })).toMatchObject({ ok: false, error: expect.stringContaining("not an Atom/RSS feed") });
    expect(readUmaPencaSnapshot(file)).toBeNull();
  });

  test("given a valid feed, then the snapshot is written once and a second identical run changes nothing", async () => {
    const xml = feed(entry({ id: "1" }), entry({ id: "2", title: "Ecobag Floripa", category: "Ecobag" }));
    const first = await syncUmaPenca({ fetchImpl: respond(xml), filePath: file, now: () => new Date("2026-10-03T12:00:00Z") });
    expect(first).toMatchObject({ ok: true, changed: true, articleCount: 2 });
    const snapshot = readUmaPencaSnapshot(file);
    expect(snapshot?.syncedAt).toBe("2026-10-03T12:00:00.000Z");
    expect(snapshot?.articles.map((a) => [a.kind, a.id])).toEqual([
      ["caneca", "1"],
      ["ecobag", "2"],
    ]);
    expect(await syncUmaPenca({ fetchImpl: respond(xml), filePath: file })).toMatchObject({ ok: true, changed: false });
  });

  test("given a feed that suddenly comes back empty, then the last good snapshot is kept", async () => {
    await syncUmaPenca({ fetchImpl: respond(feed(entry({ id: "1" }))), filePath: file });
    expect(await syncUmaPenca({ fetchImpl: respond(feed()), filePath: file })).toMatchObject({ ok: false });
    expect(readUmaPencaSnapshot(file)?.articles).toHaveLength(1);
  });

  test("regression gate", () => {
    expect(shouldPromoteArticles(0, 0)).toEqual({ promote: true });
    expect(shouldPromoteArticles(3, 1)).toEqual({ promote: true });
    expect(shouldPromoteArticles(10, 4).promote).toBe(false);
    expect(shouldPromoteArticles(10, 6)).toEqual({ promote: true });
  });
});

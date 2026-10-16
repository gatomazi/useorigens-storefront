import { describe, expect, test } from "vitest";
import { resolveSource } from "@/lib/site-config/sources";
import { umaPencaLookup } from "@/lib/umapenca/carousel";
import { parseUmaPencaFeed } from "@/lib/umapenca/parse";
import { articlePlace, isArticleOfRegion } from "@/lib/umapenca/region";
import type { UmaPencaArticle, UmaPencaSnapshot } from "@/lib/umapenca/types";

describe("Uma Penca article region, from the title", () => {
  test("a place that exists in a single region decides it, with its UF; an RA of the DF and a state count as places", () => {
    expect(articlePlace("Caneca Lá de Guarapuava")).toEqual({ ok: true, region: "sul", uf: "PR" });
    expect(articlePlace("Caneca Lá de Manaus")).toEqual({ ok: true, region: "norte", uf: "AM" });
    expect(articlePlace("Caneca Lá de Goiânia")).toEqual({ ok: true, region: "centro-oeste", uf: "GO" });
    expect(articlePlace("Caneca Lá da Ceilândia")).toEqual({ ok: true, region: "centro-oeste", uf: "DF" });
    expect(articlePlace("Caneca Lá de Mato Grosso do Sul")).toEqual({ ok: true, region: "centro-oeste", uf: "MS" });
    // "Paraná" is also a municipality of Tocantins: the state needs its UF like any repeated name.
    expect(articlePlace("Caneca Lá do Paraná")).toMatchObject({ ok: false });
    expect(articlePlace("Caneca Lá do Paraná – PR")).toEqual({ ok: true, region: "sul", uf: "PR" });
    expect(articlePlace("Lá de Aceguá")).toEqual({ ok: true, region: "sul", uf: "RS" });
    expect(articlePlace("CANECA LÁ DE PORTO VELHO")).toEqual({ ok: true, region: "norte", uf: "RO" });
  });

  test("a name repeated across regions is refused without the UF, and decided by it in any common spelling", () => {
    for (const title of ["Caneca Lá de Palmas", "Caneca Lá de Rio Branco", "Caneca Lá de Santa Maria", "Caneca Lá de Taguatinga"]) {
      const r = articlePlace(title);
      expect(r.ok, title).toBe(false);
      expect(!r.ok && r.reason).toContain("put the UF at the end of the title");
    }
    for (const title of ["Caneca Lá de Palmas | TO", "Caneca Lá de Palmas|TO", "Caneca Lá de Palmas – TO", "Caneca Lá de Palmas - TO", "Caneca Lá de Palmas/TO", "Caneca Lá de Palmas (TO)", "Caneca Lá de Palmas TO"]) {
      expect(articlePlace(title), title).toEqual({ ok: true, region: "norte", uf: "TO" });
    }
    // The store's naming puts the UF on every title, repeated name or not.
    expect(articlePlace("Caneca Lá de Aceguá | RS")).toEqual({ ok: true, region: "sul", uf: "RS" });
    expect(articlePlace("Caneca Lá da Ceilândia | DF")).toEqual({ ok: true, region: "centro-oeste", uf: "DF" });
    expect(articlePlace("Caneca Lá de Palmas – PR")).toEqual({ ok: true, region: "sul", uf: "PR" });
    expect(articlePlace("Caneca Lá de Rio Branco – AC")).toEqual({ ok: true, region: "norte", uf: "AC" });
    expect(articlePlace("Caneca Lá de Santa Maria – DF")).toEqual({ ok: true, region: "centro-oeste", uf: "DF" });
  });

  test("a UF that does not agree with the place, a UF of no storefront region, or an unknown place is refused — never guessed", () => {
    expect(articlePlace("Caneca Lá de Curitiba | SC")).toMatchObject({ ok: false, reason: expect.stringContaining("not a place of SC") });
    expect(articlePlace("Caneca Lá de Campinas – SP")).toMatchObject({ ok: false, reason: expect.stringContaining("UF SP") });
    expect(articlePlace("Caneca Lá de Curitba")).toMatchObject({ ok: false, reason: expect.stringContaining("not a known city") });
  });

  test("a title that names no place is a generic article, shown in every region (also an article of a snapshot older than the split)", () => {
    expect(articlePlace("Caneca Full Stack Fuel")).toEqual({ ok: true, region: null, uf: null });
    expect(isArticleOfRegion({ region: null }, "norte")).toBe(true);
    expect(isArticleOfRegion({}, "norte")).toBe(true);
    expect(isArticleOfRegion({ region: "sul" }, "sul")).toBe(true);
    expect(isArticleOfRegion({ region: "sul" }, "norte")).toBe(false);
  });
});

describe("Uma Penca feed split by region", () => {
  const IMG = "https://umapenca.imgix.net/1/x.jpg";
  const entry = (id: string, title: string) =>
    `<entry><g:id>${id}</g:id><g:title><![CDATA[${title}]]></g:title><g:link>https://artigos.useorigens.com.br/caneca/${id}.html</g:link><g:image_link>${IMG}</g:image_link><g:availability>in stock</g:availability><g:price>72.90 BRL</g:price><g:category><![CDATA[Caneca]]></g:category></entry>`;
  const xml = `<feed>${[entry("1", "Caneca Lá de Guarapuava"), entry("2", "Caneca Lá de Manaus"), entry("3", "Caneca Lá de Palmas"), entry("4", "Caneca Lá de Palmas | TO"), entry("5", "Caneca Lá de Cuiabá"), entry("6", "Caneca Use Origens")].join("")}</feed>`;

  test("the parser stores region and UF, and leaves out the ambiguous one with the reason", () => {
    const { articles, excluded } = parseUmaPencaFeed(xml);
    expect(articles.map((a) => [a.id, a.region, a.uf])).toEqual([
      ["1", "sul", "PR"],
      ["2", "norte", "AM"],
      ["4", "norte", "TO"],
      ["5", "centro-oeste", "MT"],
      ["6", null, null],
    ]);
    expect(excluded).toEqual([{ id: "3", title: "Caneca Lá de Palmas", reason: expect.stringMatching(/^region unknown: "Palmas" exists in PR, TO/) }]);
  });

  test("each region's carousel gets its own articles plus the generic ones", () => {
    const snapshot: UmaPencaSnapshot = { version: 1, syncedAt: "2026-10-16T00:00:00.000Z", articles: parseUmaPencaFeed(xml).articles as UmaPencaArticle[] };
    const ids = (region: string) => {
      const r = resolveSource({ kind: "umapenca", articleKinds: ["caneca"], limit: 24 }, { terra: [], recreations: [], lenda: [], dizeres: [], ddd: [] }, undefined, umaPencaLookup(region, () => snapshot, () => ({})));
      return r.status === "ok" ? r.items.map((i) => i.id) : r;
    };
    expect(ids("sul")).toEqual(["1", "6"]);
    expect(ids("norte")).toEqual(["2", "4", "6"]);
    expect(ids("centro-oeste")).toEqual(["5", "6"]);
  });
});

import { describe, expect, test } from "vitest";
import { cleanInkProductUrl, productShareText, storefrontShareUrl, whatsappShareHref } from "@/lib/share/url";
import { GARMENT_TYPES } from "@/lib/catalog/garments";
import { SIZE_GUIDES, sizeGuidesFor } from "@/lib/catalog/size-guides";

const HOSTS: ReadonlySet<string> = new Set(["www.usesul.com.br", "www.usenorte.com.br", "www.usecentro.com.br"]);
const PDP = "https://www.usesul.com.br/usesul/product/florianopolis-origem-sc-0faeb956-3b10-4a06-8f93-2c9cff8d1afb";

describe("cleanInkProductUrl", () => {
  test("given a verified INK product URL, then it is returned unchanged", () => {
    expect(cleanInkProductUrl(PDP, HOSTS)).toBe(PDP);
  });

  test("given cart, session, list, tracking and opening parameters plus a fragment, then all of them are dropped", () => {
    const dirty = `${PDP}?cart_ref=abc&ls=tok.sig&origens_src=reco&origens_p=1&origens_open_cart=1&ctx=x&utm_source=ig&fbclid=1&model=Feminino#reviews`;
    expect(cleanInkProductUrl(dirty, HOSTS)).toBe(PDP);
  });

  test("given a host outside the allowlist, a look-alike host, http, credentials or a port, then null (never an open redirect)", () => {
    expect(cleanInkProductUrl("https://evil.example/usesul/product/x", HOSTS)).toBeNull();
    expect(cleanInkProductUrl("https://www.usesul.com.br.evil.example/usesul/product/x", HOSTS)).toBeNull();
    expect(cleanInkProductUrl("http://www.usesul.com.br/usesul/product/x", HOSTS)).toBeNull();
    expect(cleanInkProductUrl("https://user:pw@www.usesul.com.br/usesul/product/x", HOSTS)).toBeNull();
    expect(cleanInkProductUrl("https://www.usesul.com.br:8443/usesul/product/x", HOSTS)).toBeNull();
  });

  test("given an allowed host but not a product page (home, cart, list), then null — never a substitute link", () => {
    expect(cleanInkProductUrl("https://www.usesul.com.br/usesul", HOSTS)).toBeNull();
    expect(cleanInkProductUrl("https://www.usesul.com.br/usesul/cart", HOSTS)).toBeNull();
    expect(cleanInkProductUrl("https://www.usesul.com.br/usesul/product/", HOSTS)).toBeNull();
    expect(cleanInkProductUrl("https://www.usesul.com.br/usesul/product/a/b", HOSTS)).toBeNull();
  });

  test("given empty or malformed input, then null", () => {
    expect(cleanInkProductUrl(null, HOSTS)).toBeNull();
    expect(cleanInkProductUrl("", HOSTS)).toBeNull();
    expect(cleanInkProductUrl("not a url", HOSTS)).toBeNull();
  });
});

describe("storefrontShareUrl", () => {
  test("given a canonical path, then origin + path, without query or hash", () => {
    expect(storefrontShareUrl("https://www.useorigens.com.br", "/sul/sc/florianopolis")).toBe("https://www.useorigens.com.br/sul/sc/florianopolis");
    expect(storefrontShareUrl("https://www.useorigens.com.br", "/sul/sc/florianopolis?peca=oversized&cart_ref=x#top")).toBe("https://www.useorigens.com.br/sul/sc/florianopolis");
  });

  test("given a protocol-relative or relative path, or a non-https site origin, then null", () => {
    expect(storefrontShareUrl("https://www.useorigens.com.br", "//evil.example/x")).toBeNull();
    expect(storefrontShareUrl("https://www.useorigens.com.br", "sul/sc")).toBeNull();
    expect(storefrontShareUrl("http://www.useorigens.com.br", "/sul")).toBeNull();
  });
});

describe("share text", () => {
  test("given a t-shirt base (or none: the classic piece), then 'Olha essa camiseta'; any other piece, the neutral sentence", () => {
    expect(productShareText("Origem de Florianópolis")).toBe("Olha essa camiseta da Use Origens: Origem de Florianópolis");
    expect(productShareText("Origem Oversized de Florianópolis", 178)).toMatch(/^Olha essa camiseta/);
    expect(productShareText("Origem Moletom Capuz de Florianópolis", 119)).toBe("Olha o que encontrei na Use Origens: Origem Moletom Capuz de Florianópolis");
    expect(productShareText("Origem Body Infantil", 165)).toMatch(/^Olha o que encontrei/);
  });

  test("given a WhatsApp link, then wa.me with no recipient and the whole message encoded", () => {
    const href = whatsappShareHref("Olha essa camiseta da Use Origens: Origem & Cia", PDP);
    const url = new URL(href);
    expect(url.host).toBe("wa.me");
    expect(url.pathname).toBe("/");
    expect(url.searchParams.get("text")).toBe(`Olha essa camiseta da Use Origens: Origem & Cia ${PDP}`);
  });
});

describe("size guides", () => {
  test("given every base garment in the catalog, then each has at least one official table", () => {
    for (const type of GARMENT_TYPES) expect(sizeGuidesFor([type.id]).length, type.label).toBeGreaterThan(0);
  });

  test("given the classic tee, then Clássica and Baby Look (INK models Masculino/Feminino), never mixed with another base", () => {
    expect(sizeGuidesFor([1]).map((g) => [g.id, g.inkModel])).toEqual([
      ["camiseta-classica", "Masculino"],
      ["camiseta-baby-look", "Feminino"],
    ]);
  });

  test("given an unknown product_type, then no table at all (the guide falls back to the product page, never generic numbers)", () => {
    expect(sizeGuidesFor([999])).toEqual([]);
  });

  test("given every table, then each row has one value per column, ids are unique and images come from INK's size_table path", () => {
    expect(new Set(SIZE_GUIDES.map((g) => g.id)).size).toBe(SIZE_GUIDES.length);
    for (const g of SIZE_GUIDES) {
      for (const row of g.rows) expect(row.values.length, `${g.id} ${row.size}`).toBe(g.columns.length);
      expect(g.image.desktop).toMatch(/^https:\/\/gcp-images\.majestic\.ink\.rsvcloud\.com\/images\/size_table\/[0-9a-f]{32}\.webp$/);
      expect(g.sourcePage).toMatch(/^https:\/\/www\.usesul\.com\.br\/usesul\/product\/[a-z0-9-]+$/);
    }
  });

  test("given the two checked bases, then the values transcribed from the official images (2026-10-05)", () => {
    const classica = SIZE_GUIDES.find((g) => g.id === "camiseta-classica")!;
    expect(classica.columns.map((c) => c.label)).toEqual(["Comprimento", "Abdômen", "Ombro", "Manga"]);
    expect(classica.rows.find((r) => r.size === "GG")!.values).toEqual([75, 59, 51.5, 22.5]);
    const oversized = SIZE_GUIDES.find((g) => g.id === "oversized")!;
    expect(oversized.rows.map((r) => r.size)).toEqual(["P", "M", "G", "GG", "3G"]);
    expect(oversized.rows.find((r) => r.size === "P")!.values).toEqual([73, 27, 60, 18.5]);
  });
});

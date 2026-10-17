import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { ADMIN_SEARCH_INDEX, MAX_ADMIN_RESULTS, normalizeSearch, searchAdmin } from "@/lib/admin/search-index";

const first = (q: string, opts: { region?: string; owner?: boolean } = {}) => searchAdmin(q, { region: opts.region ?? "sul", owner: opts.owner })[0]?.href;
const panel = path.join(process.cwd(), "src", "app", "admin", "(panel)");

describe("panel search: the words people use lead to the right page and block", () => {
  test.each([
    ["frete grátis", "/admin/tema-ink#ink-incentivo"],
    ["frete", "/admin/tema-ink#ink-incentivo"],
    ["incentivo", "/admin/tema-ink#ink-incentivo"],
    ["cores", "/admin/aparencia#theme-sul"],
    ["paleta", "/admin/aparencia#theme-sul"],
    ["tema da home", "/admin/home#tema-da-home"],
    ["editorial", "/admin/home#tema-da-home"],
    ["faixa", "/admin/faixa"],
    ["barra do topo", "/admin/faixa"],
    ["cupom", "/admin/promocoes"],
    ["promoção", "/admin/promocoes"],
    ["pódio", "/admin/estados#podio"],
    ["menu", "/admin/navegacao"],
    ["banner", "/admin/midia"],
    ["imagem", "/admin/midia"],
    ["cores do carrinho", "/admin/tema-ink#ink-aparencia"],
    ["pixel", "/admin/tracking"],
    ["meta", "/admin/tracking"],
    ["ga4", "/admin/tracking"],
    ["publicar", "/admin/publicar"],
    ["personalização", "/admin/personalizacao"],
    ["localidade", "/admin/personalizacao"],
    ["caneca", "/admin/personalizacao"],
    ["coleção", "/admin/colecoes"],
    ["estado", "/admin/estados"],
  ])("given %j, then the first result is %s", (q, href) => {
    expect(first(q)).toBe(href);
  });

  test("given checkout or sincronizar, then the first result is on the right page", () => {
    expect(first("checkout")).toMatch(/^\/admin\/tema-ink#/);
    expect(first("sincronizar")).toMatch(/^\/admin\/sincronizacao/);
  });

  test("given capitals, accents or none, then the result is the same", () => {
    expect(first("PROMOÇÕES")).toBe(first("promocoes"));
    expect(first("Pódio")).toBe(first("podio"));
    expect(normalizeSearch("  Frete   Grátis! ")).toBe("frete gratis");
  });

  test("given the start of a word, then it already finds (search as you type)", () => {
    expect(first("fre")).toBe("/admin/tema-ink#ink-incentivo");
    expect(first("sincro")).toMatch(/^\/admin\/sincronizacao/);
  });

  test("given words of an entry in any order, then it is found", () => {
    expect(searchAdmin("carrinho frete", { region: "sul" }).map((r) => r.href)).toContain("/admin/tema-ink#ink-incentivo");
  });

  test("given a block drawn per region, then the link points at the region being edited", () => {
    expect(first("cores", { region: "norte" })).toBe("/admin/aparencia#theme-norte");
  });

  test("given an owner-only page, then only the owner finds it", () => {
    expect(first("pessoas")).not.toBe("/admin/usuarios");
    expect(first("pessoas", { owner: true })).toBe("/admin/usuarios");
  });

  test("given nothing or nonsense, then there are no results; given a common word, then at most the limit", () => {
    expect(searchAdmin("", { region: "sul" })).toEqual([]);
    expect(searchAdmin("   ", { region: "sul" })).toEqual([]);
    expect(searchAdmin("xyzzy", { region: "sul" })).toEqual([]);
    expect(searchAdmin("a", { region: "sul" }).length).toBeLessThanOrEqual(MAX_ADMIN_RESULTS);
  });
});

describe("panel search index: every entry points at something that exists", () => {
  test("given each entry, then its page is a route of the panel", () => {
    for (const e of ADMIN_SEARCH_INDEX) {
      const rel = e.href.replace(/^\/admin/, "");
      expect(existsSync(path.join(panel, rel, "page.tsx")), e.href).toBe(true);
    }
  });

  test("given each anchored entry, then the anchor is an id written in the panel's code (its page or the components it draws)", () => {
    const sources = [
      ...ADMIN_SEARCH_INDEX.map((e) => path.join(panel, e.href.replace(/^\/admin/, ""), "page.tsx")),
      ...["HomeThemeCard", "PodioCard", "StatePageCards", "CollectionMenuCard", "CollectionNotesCard", "NavigationEditor", "TopBarEditor", "ThemeEditor"].map((c) => path.join(process.cwd(), "src", "components", "admin", `${c}.tsx`)),
    ];
    const code = [...new Set(sources)].map((f) => readFileSync(f, "utf8")).join("\n");
    for (const e of ADMIN_SEARCH_INDEX.filter((x) => x.anchor)) {
      // The colour editors (`theme-{region}`, `theme-global`) are drawn as id={`theme-${scope}`}; everything else is a literal id.
      const id = e.anchor!.startsWith("theme-") ? "theme-${scope}" : e.anchor!;
      expect(code.includes(`id="${id}"`) || code.includes("id={`" + id + "`}"), `${e.title}: #${e.anchor}`).toBe(true);
    }
  });

  test("given the index, then every entry has a title, a place and words to be found by", () => {
    for (const e of ADMIN_SEARCH_INDEX) {
      expect(e.title.length, e.href).toBeGreaterThan(0);
      expect(e.where.length, e.title).toBeGreaterThan(0);
      expect(e.keywords.length, e.title).toBeGreaterThan(0);
    }
  });
});

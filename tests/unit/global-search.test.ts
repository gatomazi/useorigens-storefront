import { describe, expect, test } from "vitest";
import type { CollectionRecord } from "@/lib/catalog/collections";
import type { CityFamilyEntry, Catalog } from "@/lib/catalog/repository";
import { DESIGN_FAMILIES } from "@/lib/catalog/families";
import type { CityDesignBinding } from "@/lib/catalog/types";
import { localitiesOfRegion } from "@/lib/geo/localities";
import type { RegionSlug } from "@/lib/geo/regions";
import { placeSearchCopy } from "@/lib/search/copy";
import { prepareGlobalDocs, searchGlobal, type GlobalDoc } from "@/lib/search/global";
import { buildGlobalDocs, clusterPieces } from "@/lib/search/global-index";
import type { ScopeDoc } from "@/lib/site-config/schema";
import { buildSeedBundle } from "@/lib/site-config/seed";
import { indexOf, tuple } from "./garment-index-fixture";

const place = (region: RegionSlug, name: string, uf: string) => {
  const p = localitiesOfRegion(region).find((l) => l.name === name && l.uf === uf);
  if (!p) throw new Error(`no ${name}/${uf}`);
  return p;
};
const TIJUCAS = place("sul", "Tijucas", "SC");
const TIJUCAS_SUL = place("sul", "Tijucas do Sul", "PR");
const BAGE = place("sul", "Bagé", "RS");
const GOIANIA = place("centro-oeste", "Goiânia", "GO");
const family = (id: string) => DESIGN_FAMILIES.find((f) => f.id === id)!;

let nextId = 1000;
function binding(cityId: string, familyId: string, cluster: string | null, price = 94, store: CityDesignBinding["commerceStoreKey"] = "use-sul"): CityDesignBinding {
  const id = String(nextId++);
  const host = store === "use-centro" ? "www.usecentro.com.br/usecentro" : "www.usesul.com.br/usesul";
  return {
    cityId, designFamily: familyId as CityDesignBinding["designFamily"], designVariant: "base", isPrimary: true, priority: 0, productClusterId: cluster,
    commerceStoreKey: store, inkProductId: id, slug: `p-${id}`, storeProductUrl: `https://${host}/product/p-${id}`,
    imageUrl: `https://gcp-images.majestic.ink.rsvcloud.com/images/product_v2/${id}.jpg`, price, syncedAt: "2026-10-01T00:00:00Z", totalSalesCount: 5,
  } as CityDesignBinding;
}

/** The smallest `Catalog` the index reads: covered localities and their family entries. */
function catalogOf(entries: Record<string, CityFamilyEntry[]>): Catalog {
  const ids = new Set(Object.keys(entries));
  return {
    syncedAt: "2026-10-01T00:00:00Z",
    cityFamilies: (id: string) => entries[id] ?? [],
    coveredLocalityIds: () => ids,
  } as unknown as Catalog;
}
const entry = (b: CityDesignBinding): CityFamilyEntry => ({ family: family(b.designFamily), primary: b, variants: [] });

// Bagé · Traço sold as 10 pieces (classic + 9 garment types of ONE product_cluster_id); another cluster nearby must not leak in.
const bageTraco = binding(BAGE.id, "traco", "c-bage-traco", 94);
const garmentIndex = indexOf({
  "use-sul": {
    "c-bage-traco": [2, 8, 23, 28, 72, 119, 120, 165, 178].map((t, i) => tuple(t, String(9000 + i), `bage-traco-${t}`, t === 72 ? 89.9 : 109)),
    "c-other": [tuple(178, "9100", "other-oversized", 50)],
  },
});
const sulCatalog = catalogOf({
  [TIJUCAS.id]: [entry(binding(TIJUCAS.id, "ponto-de-origem", null, 89)), entry(binding(TIJUCAS.id, "traco", null))],
  [TIJUCAS_SUL.id]: [entry(binding(TIJUCAS_SUL.id, "ponto-de-origem", null))],
  [BAGE.id]: [entry(bageTraco)],
});
const coCatalog = catalogOf({ [GOIANIA.id]: [entry(binding(GOIANIA.id, "traco", null, 94, "use-centro"))] });

const seed = buildSeedBundle();
const sulDoc = (pages: ScopeDoc["pages"]): ScopeDoc => ({ ...structuredClone(seed.docs.sul), pages });
const page = (slug: string, title: string, archived = false) => ({
  id: `pg-${slug}`, kind: "hotpage" as const, slug, title, archived, version: 1,
  seo: { indexable: false, description: `Especial ${title}` }, sections: [],
}) as unknown as NonNullable<ScopeDoc["pages"]>[number];
const collection = (id: number, name: string, isAvailable: boolean): CollectionRecord =>
  ({ id, name, slug: name.toLowerCase().replace(/\s+/g, "-"), position: id, isAvailable, reportedProductCount: 20, matchedCount: 20, merchCount: 20, cityDesignCount: 0, memberIds: [] }) as CollectionRecord;

function index(opts: { pages?: ScopeDoc["pages"]; collections?: CollectionRecord[]; regions?: RegionSlug[] } = {}) {
  const regions = opts.regions ?? ["sul", "centro-oeste"];
  const map = new Map<RegionSlug, ReturnType<typeof prepareGlobalDocs>>();
  if (regions.includes("sul")) {
    map.set("sul", prepareGlobalDocs(buildGlobalDocs({ region: "sul", catalog: sulCatalog, garmentIndex, doc: sulDoc(opts.pages ?? []), collections: opts.collections ?? [], umaPencaArticles: 0 })));
  }
  if (regions.includes("centro-oeste")) {
    map.set("centro-oeste", prepareGlobalDocs(buildGlobalDocs({ region: "centro-oeste", catalog: coCatalog, garmentIndex, collections: [], umaPencaArticles: 0 })));
  }
  return map;
}
const titles = (r: ReturnType<typeof searchGlobal>, group?: string) => r.groups.filter((g) => !group || g.group === group).flatMap((g) => g.items.map((i) => i.title));

describe("global search: places", () => {
  test("1–3. exact city, city prefix, and accents either way", () => {
    const idx = index();
    expect(titles(searchGlobal(idx, "sul", "tijucas"), "places")).toEqual(["Tijucas", "Tijucas do Sul"]);
    expect(titles(searchGlobal(idx, "sul", "tij"), "places")).toEqual(["Tijucas", "Tijucas do Sul"]);
    expect(titles(searchGlobal(idx, "sul", "bage"), "places")).toEqual(["Bagé"]);
    expect(titles(searchGlobal(idx, "sul", "BAGÉ"), "places")).toEqual(["Bagé"]);
    const first = searchGlobal(idx, "sul", "tij").groups[0].items[0];
    expect(first).toMatchObject({ kind: "locality", subtitle: "Santa Catarina · Grande Florianópolis", href: "/sul/sc/tijucas", tag: "Cidade" });
  });

  test("an exact place outranks the designs that carry its name", () => {
    expect(searchGlobal(index(), "sul", "bagé").groups.map((g) => g.group)).toEqual(["places", "designs"]);
  });
});

describe("global search: designs", () => {
  test("4–6. one result per place × family: the 10 pieces of one product_cluster_id are ONE row, priced from the lowest real piece", () => {
    const r = searchGlobal(index(), "sul", "bagé traço");
    expect(r.groups.flatMap((g) => g.items)).toEqual([
      expect.objectContaining({ kind: "design", title: "Bagé · Traço", pieces: 10, minPrice: 89.9, href: "/sul/rs/bage/traco", subtitle: "10 peças disponíveis · a partir de R$ 89,90" }),
    ]);
    const all = searchGlobal(index(), "sul", "traço");
    expect(titles(all, "designs").filter((t) => t.startsWith("Bagé"))).toEqual(["Bagé · Traço"]);
  });

  test("pieces come only from the primary's own cluster; no cluster means just the classic piece (never grouped by name)", () => {
    expect(clusterPieces(garmentIndex, "use-sul", "c-bage-traco").types.size).toBe(10);
    expect(clusterPieces(garmentIndex, "use-sul", null).types.size).toBe(1);
    expect(clusterPieces(garmentIndex, "use-norte", "c-bage-traco").types.size).toBe(1); // another store's cluster never counts
  });

  test("a design without a verified purchase URL is not indexed", () => {
    const bad = { ...binding(BAGE.id, "legado", null), storeProductUrl: "https://evil.example/x" } as CityDesignBinding;
    const docs = buildGlobalDocs({ region: "sul", catalog: catalogOf({ [BAGE.id]: [entry(bad)] }), garmentIndex, collections: [], umaPencaArticles: 0 });
    expect(docs.some((d) => d.kind === "design")).toBe(false);
  });

  test("the public result never carries matching fields or sales", () => {
    const item = searchGlobal(index(), "sul", "bagé traço").groups[0].items[0] as Record<string, unknown>;
    for (const k of ["names", "strong", "weak", "rank", "sales"]) expect(k in item).toBe(false);
  });
});

describe("global search: editorial", () => {
  test("7. a public INK collection with a verified page is found; an internal one never becomes a link", () => {
    const r = searchGlobal(index({ collections: [collection(1, "Inverno Gaucho", true), collection(2, "SUL - RS", false)] }), "sul", "inverno gaucho");
    expect(r.groups[0].items[0]).toMatchObject({ kind: "page", tag: "Coleção", external: true, href: "https://www.usesul.com.br/usesul/collections/inverno-gaucho" });
    expect(searchGlobal(index({ collections: [collection(2, "SUL - RS", false)] }), "sul", "sul rs").groups.find((g) => g.group === "editorial")).toBeUndefined();
  });

  test("8–9. a live hotpage is found; an archived one is not", () => {
    const idx = index({ pages: [page("dia-dos-pais", "Dia dos Pais"), page("dia-das-criancas", "Dia das Crianças", true)] });
    expect(searchGlobal(idx, "sul", "pais").groups[0].items[0]).toMatchObject({ title: "Dia dos Pais", href: "/sul/h/dia-dos-pais", tag: "Especial" });
    expect(searchGlobal(idx, "sul", "crianças").total).toBe(0);
  });

  test("the same theme as a home carousel and an INK collection is one result, the storefront one", () => {
    const docs = buildGlobalDocs({ region: "sul", catalog: sulCatalog, garmentIndex, doc: sulDoc([]), collections: [collection(1, "Da Nossa Terra", true)], carouselItems: () => 3, umaPencaArticles: 0 });
    const terra = docs.filter((d) => d.title.toLowerCase() === "da nossa terra");
    expect(terra).toHaveLength(1);
    expect(terra[0].href).toMatch(/^\/sul#/);
  });

  test("a home carousel that renders nothing is not a result (no dead anchor)", () => {
    const docs = buildGlobalDocs({ region: "sul", catalog: sulCatalog, garmentIndex, doc: sulDoc([]), collections: [], carouselItems: () => 0, umaPencaArticles: 0 });
    expect(docs.some((d) => d.key.startsWith("theme:"))).toBe(false);
  });
});

describe("global search: regions", () => {
  test("10. a region that is not launched is never searched", () => {
    const r = searchGlobal(index({ regions: ["sul"] }), "sul", "goiânia");
    expect(r.total).toBe(0);
    expect(r.others).toEqual([]);
  });

  test("11–12. the current region comes first; clearly relevant results of other regions come after, in their own block", () => {
    const fromSul = searchGlobal(index(), "sul", "traço");
    expect(fromSul.groups.flatMap((g) => g.items).every((i) => i.region === "sul")).toBe(true);
    expect(fromSul.others.map((i) => i.title)).toEqual(["Goiânia · Traço"]);
    const fromCo = searchGlobal(index(), "centro-oeste", "goiânia");
    expect(fromCo.groups[0].items[0]).toMatchObject({ title: "Goiânia", region: "centro-oeste" });
  });

  test("another region's place is shown from a name prefix on, but a merely partial match stays inside its own region", () => {
    expect(searchGlobal(index(), "sul", "goi").others.map((i) => i.title)).toContain("Goiânia");
    expect(searchGlobal(index(), "sul", "oian").others).toEqual([]); // substring only
  });
});

describe("global search: copy", () => {
  test("the trigger is generic; the DF region names its regions", () => {
    expect(placeSearchCopy("sul")).toMatchObject({ trigger: "Buscar", placeholder: "Busque uma cidade, estampa ou coleção…" });
    expect(placeSearchCopy("centro-oeste").placeholder).toBe("Busque uma cidade, região ou estampa…");
  });
});

describe("global search: empty input", () => {
  test("blank or punctuation-only queries return nothing", () => {
    for (const q of ["", "   ", "—"]) expect(searchGlobal(index(), "sul", q).total).toBe(0);
    const docs: GlobalDoc[] = [];
    expect(searchGlobal(new Map([["sul", prepareGlobalDocs(docs)]]), "sul", "tij").total).toBe(0);
  });
});

describe("global search: missing sources", () => {
  test("17. with no snapshot at all (empty volume), the index builds empty and a search answers nothing, without throwing", async () => {
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const dir = mkdtempSync(path.join(tmpdir(), "global-search-"));
    const env = process.env;
    process.env = { ...env, CATALOG_SNAPSHOT_DIR: dir };
    try {
      const { globalSearchIndex } = await import("@/lib/search/global-index");
      const built = globalSearchIndex();
      expect(built.stats.documents).toBe(0);
      expect(searchGlobal(built.byRegion, "sul", "tijucas")).toMatchObject({ total: 0, groups: [], others: [] });
    } finally {
      process.env = env;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

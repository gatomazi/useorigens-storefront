import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { applyOp } from "@/lib/admin/draft-ops";
import { diffDocs } from "@/lib/admin/diff";
import { collectionForPage, collectionPageLookup, collectionPageSlug, categoryLookup } from "@/lib/catalog/collection-source";
import { normalizeCollectionsSnapshot, type CollectionRecord } from "@/lib/catalog/collections";
import type { StoreProducts } from "@/lib/catalog/repository";
import type { MerchProduct } from "@/lib/catalog/types";
import { arrangementOf, inkCollectionLinks } from "@/lib/site-config/collections-enabled";
import { withNavbarGroups } from "@/lib/site-config/navbar-groups";
import { newCollectionLanding } from "@/lib/site-config/pages";
import { validatePage, validateScopeDoc, type Page, type ScopeDoc, type Section } from "@/lib/site-config/schema";
import { buildSeedBundle } from "@/lib/site-config/seed";
import { destinationHref, type InkCategorySource } from "@/lib/site-config/sources";

let n = 0;
const ctx = { newId: () => `t${++n}` };
const seedDoc = (): ScopeDoc => structuredClone(buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null }).docs.sul);
const source = (collectionId: number, over: Partial<InkCategorySource> = {}): InkCategorySource => ({ kind: "ink-category", store: "use-sul", collectionId, order: "category", limit: 6, ...over });
const ok = (r: ReturnType<typeof applyOp>): ScopeDoc => {
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.doc;
};
/** The Sul seed with one more product section on `collectionId`, carrying an older order of its own (from before orders belonged to collections). */
const withOlderOrder = (doc: ScopeDoc, collectionId: number, productIds: string[], hiddenIds?: string[]): ScopeDoc => {
  const sections = doc.home!.sections;
  const extra: Section = {
    id: `custom-old${collectionId}`, anchor: `old-${collectionId}`, headingId: `old-${collectionId}-title`, template: "product-carousel", active: true, title: "Antiga",
    layout: { variant: "standard", tone: "light", surface: "plain" }, analyticsSource: "homeCollection",
    source: source(collectionId, { order: "manual", productIds, ...(hiddenIds ? { hiddenIds } : {}) }),
    appearance: { fill: { kind: "none" }, focal: { mobile: { x: 50, y: 50 }, desktop: { x: 50, y: 50 } }, overlay: { preset: "none" } },
  };
  return { ...doc, home: { sections: [...sections.slice(0, -1), extra, sections[sections.length - 1]] } };
};

describe("the order of a collection belongs to the collection", () => {
  test("given the collection's own entry, when resolved, then it wins over any section's older order; an empty entry means INK's order", () => {
    const doc = withOlderOrder(seedDoc(), 10, ["2", "1"], ["3"]);
    expect(arrangementOf(doc, "use-sul", 10)).toEqual({ productIds: ["2", "1"], hiddenIds: ["3"] }); // the older one, found in a section
    const own = ok(applyOp(doc, { type: "set-collection-arrangement", store: "use-sul", collectionId: 10, productIds: ["4"], hiddenIds: [] }, ctx));
    expect(arrangementOf(own, "use-sul", 10)).toEqual({ productIds: ["4"], hiddenIds: undefined });
    expect(arrangementOf(own, "use-sul", 10, own.home!.sections.find((s) => s.id === "custom-old10")!.source)).toEqual({ productIds: ["4"], hiddenIds: undefined });
    const back = ok(applyOp(own, { type: "set-collection-arrangement", store: "use-sul", collectionId: 10, productIds: [], hiddenIds: [] }, ctx));
    // The older section still carries its order: the entry stays, empty, so "INK's order" overrides it.
    expect(back.collections?.arrangements).toEqual([{ store: "use-sul", collectionId: 10 }]);
    expect(arrangementOf(back, "use-sul", 10)).toEqual({ productIds: undefined, hiddenIds: undefined });
  });

  test("given no older order anywhere, when the collection goes back to INK's order, then its entry is removed", () => {
    const doc = ok(applyOp(seedDoc(), { type: "set-collection-arrangement", store: "use-sul", collectionId: 10, productIds: ["2"], hiddenIds: ["3", "3"] }, ctx));
    expect(doc.collections?.arrangements).toEqual([{ store: "use-sul", collectionId: 10, productIds: ["2"], hiddenIds: ["3"] }]);
    const back = ok(applyOp(doc, { type: "set-collection-arrangement", store: "use-sul", collectionId: 10, productIds: [], hiddenIds: [] }, ctx));
    expect(back.collections?.arrangements).toBeUndefined();
    expect(arrangementOf(back, "use-sul", 10)).toBeUndefined();
  });

  test("given another region's store, when arranged, then the document refuses it", () => {
    const r = applyOp(seedDoc(), { type: "set-collection-arrangement", store: "use-norte", collectionId: 10, productIds: ["2"], hiddenIds: [] }, ctx);
    expect(r.ok).toBe(false);
  });

  test("given a section saved with the collection's list, when batched, then both apply together; a refused part applies nothing", () => {
    const doc = withOlderOrder(seedDoc(), 10, ["2", "1"]);
    const update = { type: "update" as const, id: "custom-old10", patch: { source: source(10) } };
    const saved = ok(applyOp(doc, { type: "batch", ops: [update, { type: "set-collection-arrangement", store: "use-sul", collectionId: 10, productIds: ["1"], hiddenIds: [] }] }, ctx));
    expect(saved.home!.sections.find((s) => s.id === "custom-old10")!.source).toEqual(source(10));
    expect(arrangementOf(saved, "use-sul", 10)).toEqual({ productIds: ["1"], hiddenIds: undefined });
    const refused = applyOp(doc, { type: "batch", ops: [update, { type: "set-collection-arrangement", store: "use-norte", collectionId: 10, productIds: ["1"], hiddenIds: [] }] }, ctx);
    expect(refused.ok).toBe(false);
  });

  test("given arrangements, when the enablements or the INK navbar change, then the arrangements stay", () => {
    const doc = ok(applyOp(seedDoc(), { type: "set-collection-arrangement", store: "use-sul", collectionId: 10, productIds: ["2"], hiddenIds: [] }, ctx));
    const enabled = ok(applyOp(doc, { type: "set-collection-enabled", store: "use-sul", collectionId: 12, enabled: true }, ctx));
    const disabled = ok(applyOp(enabled, { type: "set-collection-enabled", store: "use-sul", collectionId: 12, enabled: false }, ctx));
    expect(disabled.collections?.arrangements).toHaveLength(1);
    expect(withNavbarGroups(doc, { top: [], more: [] }).collections?.arrangements).toHaveLength(1);
    expect(withNavbarGroups(doc, { top: [{ store: "use-sul", collectionId: 10 }], more: [] }).collections?.arrangements).toHaveLength(1);
  });

  test("given a changed arrangement, when the publish screen lists the changes, then it names the collection", () => {
    const base = seedDoc();
    const doc = ok(applyOp(base, { type: "set-collection-arrangement", store: "use-sul", collectionId: 10, productIds: ["2"], hiddenIds: ["3"] }, ctx));
    expect(diffDocs(base, doc, () => "Da Nossa Terra").map((c) => c.text)).toContain("Coleção Da Nossa Terra: ordem própria, 1 produto(s) escondido(s) (seções e página da coleção)");
  });

  test("given bad ids in an arrangement, when validated, then the document refuses it", () => {
    const doc = { ...seedDoc(), collections: { enabled: [], arrangements: [{ store: "use-sul" as const, collectionId: 10, productIds: ["x"] }] } };
    expect(validateScopeDoc(doc).ok).toBe(false);
  });
});

describe("the collection page: destination, paged grid and its rules", () => {
  test("given a collection-page button, when resolved, then it is the region's own address, only when the region can show the collection", () => {
    const dest = { kind: "collection-page" as const, store: "use-norte" as const, collectionId: 7 };
    expect(destinationHref(dest, { pageSlug: () => "da-nossa-terra" }, "norte")).toBe("/norte/colecoes/da-nossa-terra");
    expect(destinationHref(dest, { pageSlug: () => null }, "norte")).toBeNull();
    expect(destinationHref(dest, { pageSlug: () => "da-nossa-terra" })).toBeNull(); // no region: never a guessed one
    // The INK option keeps pointing at INK.
    expect(destinationHref({ ...dest, kind: "ink-collection", store: "use-sul" }, { inkSlug: () => "x", pageSlug: () => "y" }, "sul")).toBe("https://www.usesul.com.br/usesul/collections/x");
  });

  test("given buttons still opening collections on INK, when switched to the site's pages, then only the listed collections change, label and all else kept", () => {
    const doc = seedDoc();
    const carousels = doc.home!.sections.filter((x) => x.template === "product-carousel");
    carousels[0].cta = { label: "Ver tudo", dest: { kind: "ink-collection", store: "use-sul", collectionId: 10 } };
    carousels[1].cta = { label: "Ver todos", dest: { kind: "ink-collection", store: "use-sul", collectionId: 11 } };
    expect(inkCollectionLinks(doc)).toEqual([{ store: "use-sul", collectionId: 10 }, { store: "use-sul", collectionId: 11 }]);
    const next = ok(applyOp(doc, { type: "link-collection-pages", refs: [{ store: "use-sul", collectionId: 10 }] }, ctx));
    const after = next.home!.sections.filter((x) => x.template === "product-carousel");
    expect(after[0].cta).toEqual({ label: "Ver tudo", dest: { kind: "collection-page", store: "use-sul", collectionId: 10 } });
    expect(after[1].cta).toEqual(carousels[1].cta); // a collection with no page on the site keeps its INK link
    expect(inkCollectionLinks(next)).toEqual([{ store: "use-sul", collectionId: 11 }]);
  });

  test("given a button to another region's collection page, when validated, then the document refuses it", () => {
    const doc = seedDoc();
    const s = doc.home!.sections.find((x) => x.template === "product-carousel")!;
    s.cta = { label: "Ver todos", dest: { kind: "collection-page", store: "use-norte", collectionId: 1 } };
    expect(validateScopeDoc(doc).ok).toBe(false);
    s.cta = { label: "Ver todos", dest: { kind: "collection-page", store: "use-sul", collectionId: 1 } };
    expect(validateScopeDoc(doc).ok).toBe(true);
  });

  test("given the collection landing, when validated, then it is a valid parent-category landing: the hero, then one paged grid of the collection", () => {
    const page = newCollectionLanding({ id: "page-x", heroId: "custom-h", gridId: "custom-g", title: "Da Nossa Terra", slug: "da-nossa-terra", ref: { store: "use-sul", collectionId: 10 } });
    expect(validatePage(page, "sul").ok).toBe(true);
    expect(page.sections.map((s) => [s.template, s.layout?.display])).toEqual([["page-hero", undefined], ["product-carousel", "paged"]]);
    expect(page.sections[1].source).toMatchObject({ kind: "ink-category", collectionId: 10, limit: 24 });
    // In a hotpage there are no page numbers in the address: refused. Twice on one landing: refused.
    expect(validatePage({ ...page, kind: "hotpage" }, "sul").ok).toBe(false);
    expect(validatePage({ ...page, sections: [...page.sections, { ...page.sections[1], id: "custom-g2", anchor: "produtos-2", headingId: "produtos-2-title" }] }, "sul").ok).toBe(false);
    // Only an INK collection pages; no reserved first card.
    expect(validatePage({ ...page, sections: [page.sections[0], { ...page.sections[1], source: { kind: "editorial-module", key: "terra" } }] }, "sul").ok).toBe(false);
    expect(validatePage({ ...page, sections: [page.sections[0], { ...page.sections[1], customizerCard: { customizerId: "m1", title: "Crie", button: "Criar" } }] }, "sul").ok).toBe(false);
  });

  test("given a paged grid on the home, when validated, then it is refused", () => {
    const doc = seedDoc();
    const s = doc.home!.sections.find((x) => x.template === "product-carousel")!;
    s.source = source(10);
    s.layout = { ...s.layout!, display: "paged" };
    expect(validateScopeDoc(doc).ok).toBe(false);
  });

  test("given 'Personalizar página', when the op creates the page, then it is the collection landing at the collection's address", () => {
    const doc = ok(applyOp(seedDoc(), { type: "create-page", kind: "categoryLanding", title: "Da Nossa Terra", slug: "da-nossa-terra", collection: { store: "use-sul", collectionId: 10 } }, ctx));
    const page = doc.pages!.find((p) => p.slug === "da-nossa-terra") as Page;
    expect(page.sections.map((s) => s.layout?.display ?? s.template)).toEqual(["page-hero", "paged"]);
  });

  test("given a file written before every collection kept its full list, when read, then a public collection's searchMemberIds is its complete list", () => {
    const snap = normalizeCollectionsSnapshot({ version: 2, stores: { "use-sul": { commerceStoreKey: "use-sul", syncedAt: "t", catalogSyncedAt: "c", totalCount: 1, collections: [{ id: 1, name: "x", slug: "x", position: 1, isAvailable: true, reportedProductCount: 3, matchedCount: 3, merchCount: 3, cityDesignCount: 0, memberIds: ["1", "2", "3"], searchMemberIds: ["1", "2", "3"] }] } } });
    const record = snap!.stores["use-sul"]!.collections[0] as CollectionRecord & { searchMemberIds?: unknown };
    expect(record.allMemberIds).toEqual(["1", "2", "3"]);
    expect(record.searchMemberIds).toBeUndefined();
  });
});

describe("paging through every product of a collection", () => {
  let dir: string;
  let filePath: string;
  const env = process.env;
  const ids = Array.from({ length: 60 }, (_, i) => String(100 + i));
  const merch = (id: string): MerchProduct => ({ inkProductId: id, commerceStoreKey: "use-sul", regionSlug: "sul", name: `Produto ${id}`, slug: `p-${id}`, storeProductUrl: `https://www.usesul.com.br/usesul/product/${id}`, imageUrl: "https://gcp-images.majestic.ink.rsvcloud.com/images/product_v2/x.jpg", price: 99.9, totalSalesCount: 0, syncedAt: "t" });
  const products = (): StoreProducts => ({ merch: new Map(ids.map((id) => [id, merch(id)])), cityDesigns: new Map() });
  const rec = (over: Partial<CollectionRecord>): CollectionRecord => ({ id: 1, name: "x", slug: "x", position: 1, isAvailable: true, reportedProductCount: 60, matchedCount: 60, merchCount: 60, cityDesignCount: 0, memberIds: ids.slice(0, 48), ...over });
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "collection-pages-"));
    filePath = path.join(dir, `c-${Math.random().toString(36).slice(2)}.json`);
    await writeFile(filePath, JSON.stringify({ version: 2, stores: { "use-sul": { commerceStoreKey: "use-sul", syncedAt: "t", catalogSyncedAt: "c", totalCount: 4, collections: [
      rec({ id: 10, name: "Da Nossa Terra", slug: "da-nossa-terra", allMemberIds: ids }),
      rec({ id: 11, name: "Antiga", slug: "antiga" }), // from before the full lists: only the 48 of the showcase are known
      rec({ id: 12, name: "SUL - RS", slug: "sul-rs", isAvailable: false, allMemberIds: ids }),
      rec({ id: 13, name: "Reservada", slug: "colecoes", allMemberIds: ids }),
    ] } } }));
    process.env = { ...env, CATALOG_SNAPSHOT_DIR: dir };
  });
  afterEach(async () => {
    process.env = env;
    await rm(dir, { recursive: true, force: true });
  });
  const pages = (enabled: number[] = [], arrange?: (s: InkCategorySource) => { productIds?: string[]; hiddenIds?: string[] } | undefined) => collectionPageLookup(() => products(), () => new Set(enabled), filePath, arrange);

  test("given 60 products, 24 per page, when paged, then three pages, the last with 12, past the end empty with the real count", () => {
    const at = (page: number) => pages()(source(10, { limit: 24 }), page);
    expect(at(1)).toMatchObject({ status: "ok", total: 60, page: 1, pageCount: 3 });
    const first = at(1);
    const last = at(3);
    expect(first.status === "ok" && first.items.map((i) => i.id)).toEqual(ids.slice(0, 24));
    expect(last.status === "ok" && last.items.map((i) => i.id)).toEqual(ids.slice(48));
    expect(at(4)).toMatchObject({ status: "ok", items: [], pageCount: 3 });
  });

  test("given the collection's arrangement, when paged, then its products lead page 1 and the hidden ones are on no page", () => {
    const at = pages([], () => ({ productIds: ["159", "158"], hiddenIds: ["100", "101"] }));
    const first = at(source(10, { limit: 24 }), 1);
    expect(first.status === "ok" && first.items.slice(0, 3).map((i) => i.id)).toEqual(["159", "158", "102"]);
    expect(first).toMatchObject({ total: 58, pageCount: 3 });
  });

  test("given a carousel of the same collection, when resolved with the same arrangement, then it shows the same first products as page 1", () => {
    const arrange = () => ({ productIds: ["159"], hiddenIds: ["100"] });
    const carousel = categoryLookup(() => products(), () => new Set(), filePath, arrange)(source(10, { limit: 3 }));
    expect(carousel.status === "ok" && carousel.items.map((i) => i.id)).toEqual(["159", "101", "102"]);
  });

  test("given a record from before the full lists, when paged, then only the 48 it knows are listed (never an invented total)", () => {
    expect(pages()(source(11, { limit: 24 }), 1)).toMatchObject({ total: 48, pageCount: 2 });
  });

  test("given the region's collections, when an address is asked for, then only a usable collection with a valid address has a page", () => {
    const doc = seedDoc();
    expect(collectionForPage("sul", doc, "da-nossa-terra", filePath)?.id).toBe(10);
    expect(collectionForPage("sul", doc, "sul-rs", filePath)).toBeNull(); // internal, not enabled
    const enabled = { ...doc, collections: { enabled: [{ store: "use-sul" as const, collectionId: 12 }] } };
    expect(collectionForPage("sul", enabled, "sul-rs", filePath)?.id).toBe(12);
    expect(collectionForPage("sul", doc, "colecoes", filePath)).toBeNull(); // a reserved word is never an address
    expect(collectionForPage("norte", doc, "da-nossa-terra", filePath)).toBeNull(); // another region's store
    expect(collectionPageSlug(doc, "use-sul", 10, filePath)).toBe("da-nossa-terra");
    expect(collectionPageSlug(doc, "use-sul", 12, filePath)).toBeNull();
    expect(collectionPageSlug(enabled, "use-sul", 12, filePath)).toBe("sul-rs");
    expect(collectionPageSlug(doc, "use-norte", 10, filePath)).toBeNull();
  });
});

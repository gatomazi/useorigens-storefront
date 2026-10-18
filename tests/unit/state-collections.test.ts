import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { stateCategoryCollections, stateCollectionRows, stateRowMatrix, stateRowsReach, stateSubcategoriesInUse, stateSubcategoryChoice, stateSubcategoryCollections } from "@/lib/catalog/collection-source";
import { applyOp } from "@/lib/admin/draft-ops";
import { diffDocs } from "@/lib/admin/diff";
import { validateScopeDoc } from "@/lib/site-config/schema";
import { statePageShows } from "@/lib/site-config/state-page-schema";
import { buildSeedBundle } from "@/lib/site-config/seed";
import type { CollectionRecord } from "@/lib/catalog/collections";
import type { StoreProducts } from "@/lib/catalog/repository";
import type { MerchProduct } from "@/lib/catalog/types";
import type { ScopeDoc } from "@/lib/site-config/schema";

// Synthetic fixtures: the shape INK gave on 15/10/2026 — a state collection ("Santa Catarina", internal) whose products are spread over public
// collections ("Da Nossa Terra", "Fala Daqui"), with no parent/child link between them on INK's side.
const merch = (id: string): MerchProduct => ({ inkProductId: id, commerceStoreKey: "use-sul", regionSlug: "sul", name: `Produto ${id}`, slug: `p-${id}`, storeProductUrl: `https://www.usesul.com.br/usesul/product/${id}`, imageUrl: "https://gcp-images.majestic.ink.rsvcloud.com/images/product_v2/x.jpg", price: 99.9, totalSalesCount: 0, syncedAt: "t" });
const products = (): StoreProducts => ({ merch: new Map(["1", "2", "3", "4", "5", "6", "7", "9"].map((id) => [id, merch(id)])), cityDesigns: new Map() });
const rec = (id: number, name: string, position: number, ids: string[], over: Partial<CollectionRecord> = {}): CollectionRecord => ({
  id, name, slug: name.toLowerCase().replace(/\s+/g, "-"), position, isAvailable: true, reportedProductCount: ids.length, matchedCount: ids.length, merchCount: ids.length, cityDesignCount: 0, memberIds: ids, allMemberIds: ids, ...over,
});

describe("a state's collections on its page", () => {
  let dir: string;
  let filePath: string;
  const env = process.env;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "state-collections-"));
    filePath = path.join(dir, "collections-snapshot.json");
    await writeFile(filePath, JSON.stringify({ version: 2, stores: { "use-sul": { commerceStoreKey: "use-sul", syncedAt: "t", catalogSyncedAt: "c", totalCount: 5, collections: [
      rec(30, "Santa Catarina", 30, ["1", "2", "3", "4", "6", "7", "8"], { isAvailable: false }),
      rec(31, "Paraná", 31, ["5"], { isAvailable: false }),
      rec(10, "Fala Daqui", 5, ["9", "3", "4", "6"]),
      rec(11, "Da Nossa Terra", 2, ["1", "2", "5", "7"]),
      rec(12, "Novidades", 40, ["9", "1"]),
      rec(13, "Carnaval", 3, ["1", "2", "3"], { isAvailable: false }),
    ] } } }));
    process.env = { ...env, CATALOG_SNAPSHOT_DIR: dir };
  });
  afterEach(async () => {
    process.env = env;
    await rm(dir, { recursive: true, force: true });
  });

  test("given the state's collection, then one row per public collection sharing products with it, in INK's order, with only the state's products", () => {
    const rows = stateCollectionRows("sul", "SC", undefined, () => products(), filePath);
    expect(rows.map((r) => [r.collection.name, r.items.map((i) => i.id)])).toEqual([
      ["Da Nossa Terra", ["1", "2", "7"]], // "5" is Paraná's; "Carnaval" is internal; "8" is not in the catalog
      ["Fala Daqui", ["3", "4", "6"]],
    ]); // "Novidades" shares one product with the state: below the minimum of 3, no row
  });

  test("given the panel's matrix, then every state says whether it has its own collection and each category or subcategory what its carousel shows there after the hierarchy", () => {
    const { states, counts } = stateRowMatrix("sul", undefined, () => products(), filePath);
    expect(states).toEqual([
      { uf: "PR", name: "Paraná", parent: { id: 31, name: "Paraná", products: 1 } },
      { uf: "SC", name: "Santa Catarina", parent: { id: 30, name: "Santa Catarina", products: 6 } }, // "8" is not in the catalog
      { uf: "RS", name: "Rio Grande do Sul", parent: null },
    ]);
    expect(Object.fromEntries(counts)).toEqual({
      11: { PR: 0, SC: 3, RS: 0 }, // Da Nossa Terra: in PR it would have one product, below the minimum: no row, 0
      10: { PR: 0, SC: 3, RS: 0 },
      12: { PR: 0, SC: 0, RS: 0 }, // Novidades: one product of SC, no row
    });
  });

  test("given a legacy list (the first state page), then exactly those collections in that order, internal ones too; a row below 3 products still does not show", () => {
    const doc = { collections: { enabled: [], stateRows: [{ store: "use-sul", collectionId: 10 }, { store: "use-sul", collectionId: 13 }, { store: "use-sul", collectionId: 12 }] } } as unknown as ScopeDoc;
    expect(stateCollectionRows("sul", "SC", doc, () => products(), filePath).map((r) => r.collection.name)).toEqual(["Fala Daqui", "Carnaval"]);
    expect([...stateRowsReach("sul", doc, () => products(), filePath)]).toEqual([[10, 1], [13, 1]]);
  });

  test("given the region's arrangement of a collection, then the row follows it and leaves its hidden products out", () => {
    const doc = { collections: { arrangements: [{ store: "use-sul", collectionId: 11, productIds: ["7"], hiddenIds: ["9"] }, { store: "use-sul", collectionId: 10, hiddenIds: ["4"] }] } } as unknown as ScopeDoc;
    const rows = stateCollectionRows("sul", "SC", doc, () => products(), filePath);
    expect(rows[0].items.map((i) => i.id)).toEqual(["7", "1", "2"]);
    // Fala Daqui without "4" has only 2 products of the state: no row, and its products go up to the state's own row (with "4")
    expect(rows.map((r) => [r.level, r.collection.name, r.items.map((i) => i.id).join(",")])).toEqual([["subcategory", "Da Nossa Terra", "7,1,2"], ["state", "Santa Catarina", "3,4,6"]]);
  });

  test("given a merch product in one state's collection, then its card carries that UF (the collection filter and GoToInk use it); in two states', none", async () => {
    const ufs = () => Object.fromEntries(stateCollectionRows("sul", "SC", undefined, () => products(), filePath).flatMap((r) => r.items).map((i) => [i.id, i.state ?? null]));
    expect(ufs()).toEqual({ "1": "SC", "2": "SC", "7": "SC", "3": "SC", "4": "SC", "6": "SC" });
    const file = JSON.parse(await readFile(filePath, "utf8"));
    file.stores["use-sul"].collections.find((c: CollectionRecord) => c.name === "Paraná").memberIds.push("1");
    file.stores["use-sul"].collections.find((c: CollectionRecord) => c.name === "Paraná").allMemberIds.push("1");
    file.stores["use-sul"].collections.find((c: CollectionRecord) => c.name === "Paraná").matchedCount = 2;
    await writeFile(filePath, JSON.stringify(file));
    expect(ufs()["1"]).toBeNull(); // in "Santa Catarina" and "Paraná": no UF is guessed
  });

  test("given no collection named after the state, then the page shows no rows", () => {
    expect(stateCollectionRows("sul", "RS", undefined, () => products(), filePath)).toEqual([]);
  });

  // The hierarchy: "Santa Catarina" > categories > subcategories, each product in the deepest row that shows it (state-hierarchy.ts).
  const ref = (collectionId: number) => ({ store: "use-sul" as const, collectionId });
  const tree = (doc: ScopeDoc) => stateCollectionRows("sul", "SC", doc, () => products(), filePath).map((r) => [r.level, r.collection.name, r.category?.name ?? null, r.items.map((i) => i.id).join(",")]);

  test("given no list of categories, then they are the menu bar, in its order; the subcategories are every other public collection", () => {
    const doc = { collections: { enabled: [], menu: { top: [ref(10), ref(11), ref(30)], hidden: [], added: [] } } } as unknown as ScopeDoc;
    expect(stateCategoryCollections("sul", doc, filePath)).toEqual({ own: false, records: [expect.objectContaining({ name: "Fala Daqui" }), expect.objectContaining({ name: "Da Nossa Terra" })] }); // never a state's collection
    expect(stateSubcategoryCollections("sul", doc, filePath).records.map((c) => c.name)).toEqual(["Novidades"]); // "Carnaval" is internal
    expect(tree(doc)).toEqual([
      ["category", "Fala Daqui", "Fala Daqui", "3,4,6"],
      ["category", "Da Nossa Terra", "Da Nossa Terra", "1,2,7"],
    ]); // "Novidades" has one product of the state: no row; nothing is left for the state's row ("8" is not in the catalog)
  });

  test("given the region's own categories and an internal subcategory brought in, then it takes its products out of its category, and what is left goes up", () => {
    const doc = { collections: { enabled: [], stateCategories: [ref(11), ref(10)], stateSubcategories: { hidden: [ref(12)], added: [ref(13)] } } } as unknown as ScopeDoc;
    expect(stateSubcategoryCollections("sul", doc, filePath)).toEqual({ manual: false, legacy: false, records: [expect.objectContaining({ name: "Carnaval" })], hidden: [expect.objectContaining({ name: "Novidades" })] });
    expect(tree(doc)).toEqual([
      ["subcategory", "Carnaval", "Da Nossa Terra", "1,2,3"], // internal, but chosen by the region
      // Da Nossa Terra keeps only "7" and Fala Daqui "4", "6": below the minimum, so both go up to the state's row
      ["state", "Santa Catarina", null, "4,6,7"],
    ]);
    expect([...stateRowsReach("sul", doc, () => products(), filePath)]).toEqual([[13, 1]]); // the state's own row is not a collection of the lists
  });

  test("given a new public collection, then it is a subcategory on its own; one the region took out is not, and its products stay in the category", async () => {
    const file = JSON.parse(await readFile(filePath, "utf8"));
    file.stores["use-sul"].collections.push(rec(14, "Fala de Onde", 6, ["3", "4", "6"]));
    await writeFile(filePath, JSON.stringify(file));
    const doc = { collections: { enabled: [], stateCategories: [ref(11), ref(10)] } } as unknown as ScopeDoc;
    expect(tree(doc)).toEqual([["category", "Da Nossa Terra", "Da Nossa Terra", "1,2,7"], ["subcategory", "Fala de Onde", "Fala Daqui", "3,4,6"]]);
    const out = { collections: { enabled: [], stateCategories: [ref(11), ref(10)], stateSubcategories: { hidden: [ref(14)], added: [] } } } as unknown as ScopeDoc;
    expect(tree(out)).toEqual([["category", "Da Nossa Terra", "Da Nossa Terra", "1,2,7"], ["category", "Fala Daqui", "Fala Daqui", "3,4,6"]]);
  });

  test("given subcategories chosen by hand, then only those show, in the list's order, and a new public collection does not enter on its own", async () => {
    const file = JSON.parse(await readFile(filePath, "utf8"));
    file.stores["use-sul"].collections.push(rec(14, "Fala de Onde", 6, ["3", "4", "6"]));
    await writeFile(filePath, JSON.stringify(file));
    const doc = { collections: { enabled: [], stateCategories: [ref(11), ref(10)], stateSubcategoryList: [ref(13)], stateSubcategories: { hidden: [], added: [ref(14)] } } } as unknown as ScopeDoc;
    expect(stateSubcategoryCollections("sul", doc, filePath)).toEqual({ manual: true, legacy: false, records: [expect.objectContaining({ name: "Carnaval" })], hidden: [] });
    // "Fala de Onde" is public and new: not in the list, so its products stay in "Fala Daqui" (the automatic choice is ignored while a list exists)
    expect(tree(doc)).toEqual([["subcategory", "Carnaval", "Da Nossa Terra", "1,2,3"], ["state", "Santa Catarina", null, "4,6,7"]]);
    expect(stateSubcategoriesInUse("sul", doc, () => products(), filePath).map((c) => c.name)).toEqual(["Carnaval"]);
  });

  test("given automatic subcategories, then the ones in use are only those that show in some state (where a switch to manual starts)", () => {
    const doc = { collections: { enabled: [], stateCategories: [ref(11), ref(10)] } } as unknown as ScopeDoc;
    expect(stateSubcategoryCollections("sul", doc, filePath).records.map((c) => c.name)).toEqual(["Novidades"]);
    expect(stateSubcategoriesInUse("sul", doc, () => products(), filePath)).toEqual([]); // "Novidades" has one product of SC: it shows nowhere
  });

  test("given a row shown as a grid, then it shows from one product, while a carousel still needs three", () => {
    const doc = { collections: { enabled: [], stateCategories: [ref(11), ref(10)], stateGrids: [ref(12)] } } as unknown as ScopeDoc;
    const rows = stateCollectionRows("sul", "SC", doc, () => products(), filePath);
    expect(rows.map((r) => [r.level, r.collection.name, r.category?.name ?? null, r.display, r.items.map((i) => i.id).join(",")])).toEqual([
      ["subcategory", "Novidades", "Da Nossa Terra", "grid", "1"], // one product of the state, shown because it is a grid
      // "Da Nossa Terra" keeps "2", "7": a carousel of two is not drawn, and the state's row (also two) neither
      ["category", "Fala Daqui", "Fala Daqui", "carousel", "3,4,6"],
    ]);
  });

  test("given a list saved before the hierarchy (the flat rows), then its categories count as categories and its other collections as subcategories", () => {
    const doc = { collections: { enabled: [], menu: { top: [ref(11)], hidden: [], added: [] }, stateRows: [ref(10), ref(11)] } } as unknown as ScopeDoc;
    expect(tree(doc).map((r) => `${r[0]}:${r[1]}`)).toEqual(["category:Da Nossa Terra", "subcategory:Fala Daqui"]);
    // The same choice in the new shape: the automatic ones it left out are hidden (Novidades), the internal ones in it would be added
    expect(stateSubcategoryChoice("sul", doc, filePath)).toEqual({ hidden: [ref(12)], added: [] });
  });
});

describe("the state page's rows in the panel", () => {
  let n = 0;
  const ctx = { newId: () => `t${++n}` };
  const sul = () => structuredClone(buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null }).docs.sul);
  const base = [{ store: "use-sul" as const, collectionId: 11 }, { store: "use-sul" as const, collectionId: 10 }];
  const ok = (r: ReturnType<typeof applyOp>) => {
    if (!r.ok) throw new Error(r.errors.join("; "));
    return r.doc;
  };

  test("given the menu bar as the automatic categories, when one is added, moved and the list reset, then the list starts from the bar and goes back to it", () => {
    let doc = ok(applyOp(sul(), { type: "set-state-category", store: "use-sul", collectionId: 12, on: true, base }, ctx));
    expect(doc.collections?.stateCategories?.map((r) => r.collectionId)).toEqual([11, 10, 12]);
    doc = ok(applyOp(doc, { type: "move-state-category", store: "use-sul", collectionId: 12, direction: "up", base }, ctx));
    expect(doc.collections?.stateCategories?.map((r) => r.collectionId)).toEqual([11, 12, 10]);
    expect(applyOp(doc, { type: "move-state-category", store: "use-sul", collectionId: 11, direction: "up", base }, ctx).ok).toBe(false);
    expect(diffDocs(sul(), doc, (r) => `#${r.collectionId}`).map((c) => c.text)).toContain("Página do estado · categorias: #11, #12, #10");
    doc = ok(applyOp(doc, { type: "set-state-category", store: "use-sul", collectionId: 11, on: false, base }, ctx));
    expect(doc.collections?.stateCategories?.map((r) => r.collectionId)).toEqual([12, 10]);
    doc = ok(applyOp(doc, { type: "reset-state-categories" }, ctx));
    expect(doc.collections?.stateCategories).toBeUndefined();
  });

  test("given the automatic subcategories, when a public one is taken out and put back, and an internal one brought in, then only those departures are kept", () => {
    const none = { hidden: [], added: [] };
    let doc = ok(applyOp(sul(), { type: "set-state-subcategory", store: "use-sul", collectionId: 12, on: false, isPublic: true, base: none }, ctx));
    expect(doc.collections?.stateSubcategories).toEqual({ hidden: [{ store: "use-sul", collectionId: 12 }], added: [] });
    expect(diffDocs(sul(), doc, (r) => `#${r.collectionId}`).map((c) => c.text)).toContain("Página do estado: “#12” sai das subcategorias");
    doc = ok(applyOp(doc, { type: "set-state-subcategory", store: "use-sul", collectionId: 13, on: true, isPublic: false, base: none }, ctx));
    doc = ok(applyOp(doc, { type: "set-state-subcategory", store: "use-sul", collectionId: 12, on: true, isPublic: true, base: none }, ctx));
    expect(doc.collections?.stateSubcategories).toEqual({ hidden: [], added: [{ store: "use-sul", collectionId: 13 }] });
    doc = ok(applyOp(doc, { type: "set-state-subcategory", store: "use-sul", collectionId: 13, on: false, isPublic: false, base: none }, ctx));
    expect(doc.collections?.stateSubcategories).toBeUndefined(); // nothing departs from automatic any more
  });

  test("given a legacy list, when a subcategory is edited or reset, then the list goes away and the choice is kept in the new shape", () => {
    const legacy = { ...sul(), collections: { enabled: [], stateRows: [{ store: "use-sul" as const, collectionId: 10 }] } };
    const doc = ok(applyOp(legacy, { type: "set-state-subcategory", store: "use-sul", collectionId: 13, on: true, isPublic: false, base: { hidden: [{ store: "use-sul", collectionId: 12 }], added: [] } }, ctx));
    expect(doc.collections?.stateRows).toBeUndefined();
    expect(doc.collections?.stateSubcategories).toEqual({ hidden: [{ store: "use-sul", collectionId: 12 }], added: [{ store: "use-sul", collectionId: 13 }] });
    expect(ok(applyOp(legacy, { type: "reset-state-subcategories" }, ctx)).collections).toEqual({ enabled: [] });
  });

  test("given the switch to a hand-picked list, then it starts with what is in use, drops the automatic choice, and is then edited and reordered by hand", () => {
    const r = (collectionId: number) => ({ store: "use-sul" as const, collectionId });
    const auto = { ...sul(), collections: { enabled: [], stateSubcategories: { hidden: [r(12)], added: [r(13)] } } };
    let doc = ok(applyOp(auto, { type: "start-manual-subcategories", base: [r(13), r(14)] }, ctx));
    expect(doc.collections?.stateSubcategoryList).toEqual([r(13), r(14)]);
    expect(doc.collections?.stateSubcategories).toBeUndefined();
    expect(diffDocs(auto, doc, (x) => `#${x.collectionId}`).map((c) => c.text)).toContain("Página do estado · subcategorias escolhidas por você: #13, #14");
    doc = ok(applyOp(doc, { type: "set-manual-subcategory", ...r(12), on: true, base: [] }, ctx)); // the list exists: `base` is not used any more
    doc = ok(applyOp(doc, { type: "move-manual-subcategory", ...r(12), direction: "up", base: [] }, ctx));
    expect(doc.collections?.stateSubcategoryList?.map((x) => x.collectionId)).toEqual([13, 12, 14]);
    expect(applyOp(doc, { type: "move-manual-subcategory", ...r(13), direction: "up", base: [] }, ctx).ok).toBe(false);
    doc = ok(applyOp(doc, { type: "set-manual-subcategory", ...r(13), on: false, base: [] }, ctx));
    doc = ok(applyOp(doc, { type: "set-manual-subcategory", ...r(12), on: false, base: [] }, ctx));
    doc = ok(applyOp(doc, { type: "set-manual-subcategory", ...r(14), on: false, base: [] }, ctx));
    expect(doc.collections?.stateSubcategoryList).toEqual([]); // empty list = no subcategory at all, still by hand (not back to automatic)
    // Editing a single one with no list yet starts from `base` (what is in use), never from nothing
    expect(ok(applyOp(sul(), { type: "set-manual-subcategory", ...r(14), on: true, base: [r(13)] }, ctx)).collections?.stateSubcategoryList).toEqual([r(13), r(14)]);
    expect(ok(applyOp(doc, { type: "reset-state-subcategories" }, ctx)).collections?.stateSubcategoryList).toBeUndefined();
  });

  test("given a row switched to a grid and back, then only grid rows are kept, and the publish list says it", () => {
    const r = (collectionId: number) => ({ store: "use-sul" as const, collectionId });
    let doc = ok(applyOp(sul(), { type: "set-state-row-display", ...r(12), grid: true }, ctx));
    doc = ok(applyOp(doc, { type: "set-state-row-display", ...r(12), grid: true }, ctx)); // twice: still once
    expect(doc.collections?.stateGrids).toEqual([r(12)]);
    expect(diffDocs(sul(), doc, (x) => `#${x.collectionId}`).map((c) => c.text)).toContain("Página do estado: “#12” passa a aparecer em grade");
    const back = ok(applyOp(doc, { type: "set-state-row-display", ...r(12), grid: false }, ctx));
    expect(back.collections?.stateGrids).toBeUndefined();
    expect(diffDocs(doc, back, (x) => `#${x.collectionId}`).map((c) => c.text)).toContain("Página do estado: “#12” volta a ser carrossel");
    expect(applyOp(sul(), { type: "set-state-row-display", store: "use-norte", collectionId: 12, grid: true }, ctx).ok).toBe(false);
  });

  test("given another region's store, when added, then the document refuses it", () => {
    expect(applyOp(sul(), { type: "set-state-category", store: "use-norte", collectionId: 13, on: true, base }, ctx).ok).toBe(false);
    expect(applyOp(sul(), { type: "set-state-subcategory", store: "use-norte", collectionId: 13, on: true, isPublic: false, base: { hidden: [], added: [] } }, ctx).ok).toBe(false);
  });

  test("given a section switched off and back on, then the document keeps only what is off, and the publish list says it", () => {
    let doc = ok(applyOp(sul(), { type: "set-state-page-section", section: "showcase", shown: false }, ctx));
    doc = ok(applyOp(doc, { type: "set-state-page-section", section: "places", shown: false }, ctx));
    expect(doc.statePage).toEqual({ hidden: ["showcase", "places"] });
    expect([statePageShows(doc, "showcase"), statePageShows(doc, "styles"), statePageShows(doc, "places")]).toEqual([false, true, false]);
    expect(diffDocs(sul(), doc, () => null).filter((c) => c.sectionId.startsWith("state-page-")).map((c) => c.text)).toEqual([
      "Página do estado: \"Destaques\" sai da página",
      "Página do estado: \"Regiões e cidades\" sai da página",
    ]);
    doc = ok(applyOp(doc, { type: "set-state-page-section", section: "showcase", shown: true }, ctx));
    doc = ok(applyOp(doc, { type: "set-state-page-section", section: "places", shown: true }, ctx));
    expect(doc.statePage).toBeUndefined();
    expect(applyOp(structuredClone(buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null }).docs.global), { type: "set-state-page-section", section: "styles", shown: false }, ctx).ok).toBe(false);
  });

  test("given a malformed state-page setting, then the document is refused", () => {
    expect(validateScopeDoc({ ...sul(), statePage: { hidden: ["podio"] } }).ok).toBe(false);
    expect(validateScopeDoc({ ...sul(), statePage: { hidden: ["styles", "styles"] } }).ok).toBe(false);
    expect(validateScopeDoc({ ...sul(), statePage: { hidden: ["styles"] } }).ok).toBe(true);
  });
});

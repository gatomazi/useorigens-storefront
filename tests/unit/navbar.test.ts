import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { applyOp, type DraftOp } from "@/lib/admin/draft-ops";
import { diffDocs } from "@/lib/admin/diff";
import { MAX_NAVBAR_GROUP, validateScopeDoc, type CollectionMenu, type CollectionRef, type ScopeDoc } from "@/lib/site-config/schema";
import { effectiveMenu, menuPositionOf, movedOnTop, withMenuPosition } from "@/lib/site-config/collection-menu";
import { effectiveNavbarGroups } from "@/lib/site-config/navbar-groups";
import { buildSeedBundle } from "@/lib/site-config/seed";

const seedBundle = () => buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null });
const seedDoc = (): ScopeDoc => structuredClone(seedBundle().docs.sul);
const ctx = { newId: () => "t1" };
const ok = (d: ScopeDoc, op: DraftOp) => {
  const r = applyOp(d, op, ctx);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.doc;
};
const ref = (collectionId: number): CollectionRef => ({ store: "use-sul", collectionId });
// Ids from 100 up are internal collections in these tests; the rest are public.
const isPublic = (r: CollectionRef) => r.collectionId < 100;
const place = (d: ScopeDoc, id: number, position: "none" | "top" | "more") => ok(d, { type: "set-collection-menu-position", ...ref(id), position, isPublic: isPublic(ref(id)) });
const move = (d: ScopeDoc, id: number, direction: "up" | "down") => ok(d, { type: "move-collection-menu", ...ref(id), direction });
const ids = (list: CollectionRef[] | undefined) => (list ?? []).map((r) => r.collectionId);
const menuOf = (d: ScopeDoc) => d.collections?.menu;
const empty: CollectionMenu = { top: [], hidden: [], added: [] };

describe("collection menu in the document: public collections in Categorias by default, only the departures stored", () => {
  test("given no choice at all, when read, then a public collection is in Categorias and an internal one is out", () => {
    expect(menuPositionOf(empty, ref(1), true)).toBe("more");
    expect(menuPositionOf(empty, ref(101), false)).toBe("none");
  });

  test("given several collections on top, when stored, then they keep the owner's order (no cap) and nothing else is written", () => {
    let d = seedDoc();
    for (const id of [5, 1, 9, 3, 7, 2, 8]) d = place(d, id, "top");
    expect(menuOf(d)).toEqual({ top: [5, 1, 9, 3, 7, 2, 8].map(ref), hidden: [], added: [] });
    expect(validateScopeDoc(d).ok).toBe(true);
  });

  test("given a public collection, when taken out and put back, then only `hidden` changes; Categorias is where it returns to", () => {
    const out = place(seedDoc(), 4, "none");
    expect(menuOf(out)).toEqual({ top: [], hidden: [ref(4)], added: [] });
    expect(menuOf(place(out, 4, "more"))).toEqual(empty);
    expect(menuOf(place(place(out, 4, "top"), 4, "more"))).toEqual(empty);
  });

  test("given an internal collection, when brought into Categorias and then out, then only `added` changes", () => {
    const inside = place(seedDoc(), 101, "more");
    expect(menuOf(inside)).toEqual({ top: [], hidden: [], added: [ref(101)] });
    expect(menuOf(place(inside, 101, "none"))).toEqual(empty);
    expect(menuOf(place(inside, 101, "top"))).toEqual({ top: [ref(101)], hidden: [], added: [] });
  });

  test("given a collection on top, when it goes to Categorias or out, then it leaves the bar (never two places); the same place twice changes nothing", () => {
    const top = place(place(seedDoc(), 1, "top"), 2, "top");
    expect(menuOf(place(top, 1, "more"))?.top).toEqual([ref(2)]);
    expect(menuOf(place(top, 1, "none"))).toEqual({ top: [ref(2)], hidden: [ref(1)], added: [] });
    expect(place(top, 1, "top")).toEqual(top);
  });

  test("given the bar, when a collection moves left or right, then only the bar changes and the edges are no-ops", () => {
    let d = seedDoc();
    for (const id of [1, 2, 3]) d = place(d, id, "top");
    d = move(d, 3, "up");
    expect(ids(menuOf(d)?.top)).toEqual([1, 3, 2]);
    expect(move(move(d, 1, "up"), 2, "down")).toEqual(d);
    expect(move(d, 77, "up")).toEqual(d);
  });

  test("given the pure helpers, when composed, then they never mutate their input", () => {
    const base: CollectionMenu = { top: [ref(1), ref(2)], hidden: [], added: [] };
    const frozen = structuredClone(base);
    withMenuPosition(base, ref(1), "none", true);
    movedOnTop(base, ref(2), "up");
    expect(base).toEqual(frozen);
  });

  test("given enablements and the menu, when either changes, then the other survives (independent decisions)", () => {
    const INTERNAL = { store: "use-sul", collectionId: 152122 } as const;
    let d = ok(seedDoc(), { type: "set-collection-enabled", ...INTERNAL, enabled: true });
    d = place(d, 10, "top");
    expect(d.collections).toEqual({ enabled: [INTERNAL], menu: { top: [ref(10)], hidden: [], added: [] } });
    d = ok(d, { type: "set-collection-enabled", ...INTERNAL, enabled: false });
    expect(d.collections).toEqual({ enabled: [], menu: { top: [ref(10)], hidden: [], added: [] } });
    // An empty menu is still a decision (the INK navbar follows it): it is kept.
    expect(place(d, 10, "more").collections).toEqual({ enabled: [], menu: empty });
  });

  test("given lists above the ceiling, a foreign store, a duplicate, a collection in two lists or a malformed shape, when validated, then the document is rejected", () => {
    const bad = (menu: unknown) => validateScopeDoc({ ...seedDoc(), collections: { enabled: [], menu } as never }).ok;
    const many = Array.from({ length: MAX_NAVBAR_GROUP + 1 }, (_, i) => ref(i + 1));
    expect(bad({ top: many, hidden: [], added: [] })).toBe(false);
    expect(bad({ top: many.slice(0, MAX_NAVBAR_GROUP), hidden: [], added: [] })).toBe(true);
    expect(bad({ top: [{ store: "use-norte", collectionId: 5 }], hidden: [], added: [] })).toBe(false);
    expect(bad({ top: [], hidden: [{ store: "use-norte", collectionId: 5 }], added: [] })).toBe(false);
    expect(bad({ top: [ref(1), ref(1)], hidden: [], added: [] })).toBe(false);
    expect(bad({ top: [ref(1)], hidden: [ref(1)], added: [] })).toBe(false);
    expect(bad({ top: [], hidden: [ref(1)], added: [ref(1)] })).toBe(false);
    expect(bad({ top: [ref(1)], hidden: [] })).toBe(false);
    expect(bad({ top: [ref(1)], hidden: [ref(2)], added: [ref(103)] })).toBe(true);
  });

  test("given a document without the key (every release before the menu), when validated, then it is still valid", () => {
    expect(validateScopeDoc(seedDoc()).ok).toBe(true);
  });
});

describe("documents from before the menu: the older INK navbar lists", () => {
  const groupsDoc = (): ScopeDoc => ({ ...seedDoc(), collections: { enabled: [], navbarGroups: { top: [ref(3), ref(1)], more: [ref(2)] } } });

  test("given the older groups, when the menu is read, then their Topo stays on top, every public collection is in Categorias and it is not the document's own menu", () => {
    const { menu, own } = effectiveMenu(groupsDoc());
    expect(own).toBe(false);
    expect(menu).toEqual({ top: [ref(3), ref(1)], hidden: [], added: [] });
    expect(menuPositionOf(menu, ref(2), true)).toBe("more");
    expect(menuPositionOf(menu, ref(9), true)).toBe("more"); // never picked before: Categorias shows every public collection
  });

  test("given the older groups, when the owner makes the first edit, then the menu is written from what it showed and the older lists are dropped", () => {
    const d = place(groupsDoc(), 9, "none");
    expect(d.collections).toEqual({ enabled: [], menu: { top: [ref(3), ref(1)], hidden: [ref(9)], added: [] } });
    expect(validateScopeDoc(d).ok).toBe(true);
    expect(ids(menuOf(move(groupsDoc(), 1, "up"))?.top)).toEqual([1, 3]);
  });

  test("given the older groups, when the menu is adopted as is, then the document gets the same menu; adopting again changes nothing", () => {
    const adopted = ok(groupsDoc(), { type: "adopt-collection-menu" });
    expect(adopted.collections).toEqual({ enabled: [], menu: { top: [ref(3), ref(1)], hidden: [], added: [] } });
    expect(ok(adopted, { type: "adopt-collection-menu" })).toEqual(adopted);
  });

  test("given the legacy flat list, when read, then every entry counts as Topo (legacy flag set) and nothing is invented for Demais categorias", () => {
    const d: ScopeDoc = { ...seedDoc(), collections: { enabled: [], navbar: [ref(3), ref(1), ref(2)] } };
    expect(effectiveNavbarGroups(d)).toEqual({ groups: { top: [ref(3), ref(1), ref(2)], more: [] }, legacy: true });
    expect(effectiveMenu(d).menu.top).toEqual([ref(3), ref(1), ref(2)]);
    expect(validateScopeDoc(d).ok).toBe(true);
  });

  test("given both older keys, when read, then the groups win", () => {
    const d: ScopeDoc = { ...seedDoc(), collections: { enabled: [], navbar: [ref(1)], navbarGroups: { top: [ref(2)], more: [ref(3)] } } };
    expect(effectiveNavbarGroups(d)).toEqual({ groups: { top: [ref(2)], more: [ref(3)] }, legacy: false });
  });
});

describe("publish screen diff", () => {
  const names = (r: { collectionId: number }) => ({ 1: "Novidades", 2: "Do Nosso Jeito", 101: "Fé de Origem" })[r.collectionId as 1 | 2 | 101] ?? null;
  const texts = (a: ScopeDoc, b: ScopeDoc) => diffDocs(a, b, names, isPublic).map((c) => c.text);
  const own = (menu: CollectionMenu): ScopeDoc => ({ ...seedDoc(), collections: { enabled: [], menu } });

  test("given only a menu change, when diffed, then it is publishable and says where the collection goes", () => {
    const base = own(empty);
    expect(texts(base, place(base, 1, "top"))).toEqual(['"Novidades" vai para o topo do menu']);
    expect(texts(place(base, 1, "top"), base)).toEqual(['"Novidades" fica em Categorias']);
    expect(texts(base, place(base, 2, "none"))).toEqual(['"Do Nosso Jeito" sai do menu']);
    expect(texts(base, place(base, 101, "more"))).toEqual(['"Fé de Origem" fica em Categorias']);
    expect(texts(base, place(base, 9, "none"))[0]).toContain("coleção #9");
    expect(texts(base, base)).toEqual([]);
  });

  test("given the bar reordered, when diffed, then the order change is reported", () => {
    const base = place(place(own(empty), 1, "top"), 2, "top");
    expect(texts(base, move(base, 2, "up"))).toEqual(["A ordem do topo do menu mudou"]);
  });

  test("given a document from before the menu, when its menu is adopted, then the only change is that the INK navbar follows it", () => {
    const before: ScopeDoc = { ...seedDoc(), collections: { enabled: [], navbarGroups: { top: [ref(1)], more: [ref(2)] } } };
    expect(texts(before, ok(before, { type: "adopt-collection-menu" }))).toEqual(["A navbar da INK passa a seguir o menu de coleções do site (Topo e Categorias)"]);
  });
});

describe("what the storefront and the Worker read", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "navbar-"));
    vi.stubEnv("CATALOG_SNAPSHOT_DIR", dir);
    vi.stubEnv("SITE_CONFIG_DIR", path.join(dir, "site-config"));
    vi.resetModules();
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(dir, { recursive: true, force: true });
  });

  const record = (id: number, name: string, slug: string, position: number, extra: Record<string, unknown> = {}) => ({
    id, name, slug, position, isAvailable: true, reportedProductCount: 10, matchedCount: 10, merchCount: 10, cityDesignCount: 0, memberIds: ["1", "2", "3"], ...extra,
  });

  async function setup(collectionsKey: Record<string, unknown> | null, collections: unknown[], extraDoc: Partial<ScopeDoc> = {}) {
    await mkdir(path.join(dir, "site-config"), { recursive: true });
    const bundle = seedBundle();
    bundle.docs.sul = { ...bundle.docs.sul, ...extraDoc, ...(collectionsKey ? { collections: { enabled: [], ...collectionsKey } } : {}) } as ScopeDoc;
    bundle.releaseId = "r1";
    await writeFile(path.join(dir, "site-config", "published.json"), JSON.stringify(bundle));
    await writeFile(path.join(dir, "collections-snapshot.json"), JSON.stringify({ version: 2, stores: { "use-sul": { commerceStoreKey: "use-sul", syncedAt: "2026-09-24T00:00:00Z", catalogSyncedAt: "2026-09-21T00:00:00Z", totalCount: collections.length, collections } } }));
    const { publicNavbar } = await import("@/lib/site-config/navbar");
    const { offMenuEntries, siteCollectionMenu } = await import("@/lib/catalog/collection-menu");
    const { SITE_URL } = await import("@/lib/site");
    return { navbar: publicNavbar("sul"), site: siteCollectionMenu("sul", bundle.docs.sul), off: offMenuEntries("sul", bundle.docs.sul), siteUrl: SITE_URL.replace(/\/$/, "") };
  }
  const seven = [
    record(1, "Novidades", "novidades", 3), record(2, "Do Nosso Jeito", "do-nosso-jeito", 2), record(3, "Seu Lugar", "seu-lugar", 1), record(4, "Feito Para Você", "feito-para-voce", 4),
    record(5, "Fala Daqui", "fala-daqui", 5), record(6, "Kits", "kits", 6), record(7, "Lançamento de Verão", "lancamento-de-verao", 7),
  ];
  const titles = (l: { title: string }[]) => l.map((e) => e.title);
  const labels = (l: { label: string }[]) => l.map((e) => e.label);

  describe("a document with its own menu", () => {
    test("given two on top and one hidden, when read, then the bar keeps the owner's order and Categorias has every other public collection in INK's order", async () => {
      const { site, navbar } = await setup({ menu: { top: [ref(4), ref(1)], hidden: [ref(6)], added: [] } }, seven);
      expect(labels(site.top)).toEqual(["Feito Para Você", "Novidades"]);
      expect(labels(site.categories)).toEqual(["Feito Para Você", "Novidades", "Seu Lugar", "Do Nosso Jeito", "Fala Daqui", "Lançamento de Verão"]);
      expect(site.top[0]).toEqual({ label: "Feito Para Você", href: "/sul/colecoes/feito-para-voce" });
      // The Worker: the same bar; "Demais categorias" = the rest, never one already on the bar.
      expect(titles(navbar.top)).toEqual(["Feito Para Você", "Novidades"]);
      expect(titles(navbar.more)).toEqual(["Seu Lugar", "Do Nosso Jeito", "Fala Daqui", "Lançamento de Verão"]);
      expect(navbar.more.map((e) => e.order)).toEqual([1, 2, 3, 4]);
      expect(navbar.moreLabel).toBe("Categorias");
    });

    test("given a collection with a page of ours, when the Worker reads it, then its url is that page and its slug the INK one", async () => {
      const { navbar, siteUrl } = await setup({ menu: { top: [ref(1)], hidden: [], added: [] } }, seven);
      expect(navbar.top[0]).toEqual({ id: 1, title: "Novidades", slug: "novidades", url: `${siteUrl}/sul/colecoes/novidades`, order: 1 });
    });

    test("given an internal enabled collection brought in, when read, then it is on the site only (it has no INK page)", async () => {
      const internal = record(101, "Fé de Origem", "fe-de-origem", 0, { isAvailable: false });
      const { site, navbar } = await setup({ enabled: [ref(101)], menu: { top: [], hidden: [], added: [ref(101)] } }, [...seven.slice(0, 2), internal]);
      expect(labels(site.categories)).toEqual(["Fé de Origem", "Do Nosso Jeito", "Novidades"]);
      expect(titles(navbar.more)).toEqual(["Do Nosso Jeito", "Novidades"]);
    });

    test("given a public collection taken out and internal ones, when the panel lists what is off the menu, then only what could link somewhere, in INK's order", async () => {
      const enabledInternal = record(101, "Fé de Origem", "fe-de-origem", 0, { isAvailable: false });
      const disabledInternal = record(102, "Segmento", "segmento", 8, { isAvailable: false });
      const { off } = await setup({ enabled: [ref(101)], menu: { top: [ref(1)], hidden: [ref(6)], added: [] } }, [...seven, enabledInternal, disabledInternal]);
      expect(off.map((e) => e.record.name)).toEqual(["Fé de Origem", "Kits"]); // "Segmento" is not enabled: no page on the site, no INK page
      expect(off[0]).toMatchObject({ pagePath: "/sul/colecoes/fe-de-origem", inkUrl: null });
    });

    test("given an internal collection that is not enabled, one with too few products and an unknown one, when read, then each surface keeps only what it can link", async () => {
      const collections = [record(1, "Boa", "boa", 1), record(101, "Interna", "interna", 2, { isAvailable: false }), record(2, "Curta", "curta", 3, { matchedCount: 2, memberIds: ["1", "2"] })];
      const { site, navbar } = await setup({ menu: { top: [ref(101), ref(99)], hidden: [], added: [] } }, collections);
      expect(labels(site.categories)).toEqual(["Boa"]); // "Curta" has no page (fewer than 3 products); "Interna" is not enabled
      expect(site.top).toEqual([]);
      expect(titles(navbar.more)).toEqual(["Boa", "Curta"]); // the Worker links INK pages: one product is enough there
      expect(navbar.more[1].url).toBe("https://www.usesul.com.br/usesul/collections/curta");
      expect(navbar.top).toEqual([]);
    });

    test("given a highlighted collection on the bar, when read, then the site carries its colours (bar and Categorias) and the Worker's payload is unchanged", async () => {
      const menu = { top: [ref(4), ref(1)], hidden: [], added: [] };
      const plain = await setup({ menu }, seven);
      const { site, navbar } = await setup({ menu, highlights: [{ ...ref(1), background: "#b3261e", text: "#ffffff" }, { ...ref(5), underline: "#ffd400" }] }, seven);
      expect(site.top).toEqual([{ label: "Feito Para Você", href: "/sul/colecoes/feito-para-voce" }, { label: "Novidades", href: "/sul/colecoes/novidades", highlight: { background: "#b3261e", text: "#ffffff" } }]);
      expect(site.categories.find((c) => c.label === "Novidades")?.highlight).toEqual({ background: "#b3261e", text: "#ffffff" });
      // "Fala Daqui" is not on the bar: its highlight stays in the document but is not drawn.
      expect(site.categories.find((c) => c.label === "Fala Daqui")).not.toHaveProperty("highlight");
      expect(navbar).toEqual(plain.navbar);
    });

    test("given a renamed Categorias block, when the Worker reads the menu, then it gets that name", async () => {
      const { navbar } = await setup({ menu: empty }, seven, { navigation: { categoriesBlock: { label: "Coleções", visible: true, order: 15 } } });
      expect(navbar.moreLabel).toBe("Coleções");
      expect(navbar.top).toEqual([]);
      expect(navbar.more).toHaveLength(7);
    });
  });

  describe("a document from before the menu (what production has today)", () => {
    test("given the older groups, when the Worker reads them, then it gets EXACTLY what it always did: those lists, INK links, no label", async () => {
      const { navbar } = await setup({ navbarGroups: { top: [ref(1), ref(7), ref(2)], more: [ref(3)] } }, seven);
      expect(navbar).toEqual({
        v: 2, region: "sul",
        states: [{ uf: "PR", name: "Paraná", path: "/sul/pr" }, { uf: "SC", name: "Santa Catarina", path: "/sul/sc" }, { uf: "RS", name: "Rio Grande do Sul", path: "/sul/rs" }],
        top: [
          { id: 1, title: "Novidades", slug: "novidades", url: "https://www.usesul.com.br/usesul/collections/novidades", order: 1 },
          { id: 7, title: "Lançamento de Verão", slug: "lancamento-de-verao", url: "https://www.usesul.com.br/usesul/collections/lancamento-de-verao", order: 2 },
          { id: 2, title: "Do Nosso Jeito", slug: "do-nosso-jeito", url: "https://www.usesul.com.br/usesul/collections/do-nosso-jeito", order: 3 },
        ],
        more: [{ id: 3, title: "Seu Lugar", slug: "seu-lugar", url: "https://www.usesul.com.br/usesul/collections/seu-lugar", order: 1 }],
      });
    });

    test("given the older groups, when the storefront reads the menu, then their Topo is on the bar and Categorias lists every public collection", async () => {
      const { site } = await setup({ navbarGroups: { top: [ref(2)], more: [ref(3)] } }, seven);
      expect(labels(site.top)).toEqual(["Do Nosso Jeito"]);
      expect(labels(site.categories)).toEqual(["Do Nosso Jeito", "Seu Lugar", "Novidades", "Feito Para Você", "Fala Daqui", "Kits", "Lançamento de Verão"]);
    });

    test("given internal, empty, unknown and bad-slug collections in the older groups, when the Worker reads them, then none is listed but the good ones keep their order", async () => {
      const { navbar } = await setup({ navbarGroups: { top: [ref(1), ref(2), ref(3), ref(99)], more: [ref(4), ref(5)] } }, [
        record(1, "Boa", "boa", 1), record(2, "Interna", "interna", 2, { isAvailable: false }), record(3, "Vazia", "vazia", 3, { matchedCount: 0, memberIds: [] }),
        record(4, "Slug ruim", "Slug Ruim/../x", 4), record(5, "Boa 2", "boa-2", 5),
      ]);
      expect(titles(navbar.top)).toEqual(["Boa"]);
      expect(titles(navbar.more)).toEqual(["Boa 2"]);
    });

    test("given the legacy flat list, when the Worker reads it, then it is Topo in INK's own menu order (what it always did)", async () => {
      const { navbar } = await setup({ navbar: [ref(1), ref(3), ref(2)] }, seven);
      expect(titles(navbar.top)).toEqual(["Seu Lugar", "Do Nosso Jeito", "Novidades"]);
      expect(navbar.more).toEqual([]);
    });

    test("given nothing configured or no synced collections, when the Worker reads it, then the payload is well-formed and empty (never an error)", async () => {
      const { navbar } = await setup(null, seven);
      expect(navbar).toMatchObject({ v: 2, region: "sul", top: [], more: [] });
      expect(navbar.states).toHaveLength(3);
      vi.resetModules();
      await rm(path.join(dir, "collections-snapshot.json"), { force: true });
      const { publicNavbar } = await import("@/lib/site-config/navbar");
      expect(publicNavbar("sul")).toMatchObject({ top: [], more: [] });
    });
  });
});

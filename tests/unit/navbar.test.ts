import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { applyOp, type DraftOp } from "@/lib/admin/draft-ops";
import { diffDocs } from "@/lib/admin/diff";
import { MAX_NAVBAR_GROUP, validateScopeDoc, type CollectionRef, type ScopeDoc } from "@/lib/site-config/schema";
import { effectiveNavbarGroups, movedWithin, navbarPositionOf, withNavbarGroups, withPosition } from "@/lib/site-config/navbar-groups";
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
const place = (d: ScopeDoc, id: number, position: "none" | "top" | "more") => ok(d, { type: "set-collection-navbar-position", ...ref(id), position });
const move = (d: ScopeDoc, id: number, direction: "up" | "down") => ok(d, { type: "move-collection-navbar", ...ref(id), direction });
const ids = (list: CollectionRef[] | undefined) => (list ?? []).map((r) => r.collectionId);

describe("navbar groups in the document: free, ordered, exclusive", () => {
  test("given no limit of one, when several collections go to the top and several to Demais categorias, then all are stored in the order they were placed", () => {
    let d = seedDoc();
    for (const id of [5, 1, 9, 3, 7, 2, 8]) d = place(d, id, "top"); // seven on top: there is no cap of one, two or five
    for (const id of [20, 10, 30, 40]) d = place(d, id, "more");
    expect(ids(d.collections?.navbarGroups?.top)).toEqual([5, 1, 9, 3, 7, 2, 8]); // owner's order, not numeric/alphabetical
    expect(ids(d.collections?.navbarGroups?.more)).toEqual([20, 10, 30, 40]);
    expect(validateScopeDoc(d).ok).toBe(true);
  });

  test("given a collection in one group, when it is placed in the other, then it moves (never in both) to the END of the target group", () => {
    let d = place(place(place(seedDoc(), 1, "top"), 2, "top"), 3, "more");
    d = place(d, 1, "more");
    expect(ids(d.collections?.navbarGroups?.top)).toEqual([2]);
    expect(ids(d.collections?.navbarGroups?.more)).toEqual([3, 1]);
    expect(navbarPositionOf(d.collections!.navbarGroups!, ref(1))).toBe("more");
  });

  test("given a listed collection, when it is set to Não exibir, then it leaves; setting the same position twice changes nothing", () => {
    const top = place(seedDoc(), 4, "top");
    expect(place(top, 4, "top")).toEqual(top);
    const none = place(top, 4, "none");
    expect(none.collections).toBeUndefined(); // nothing left: the key disappears
    expect(place(none, 4, "none")).toEqual(none);
  });

  test("given an ordered group, when a collection moves up or down, then only its own group changes and the edges are no-ops", () => {
    let d = seedDoc();
    for (const id of [1, 2, 3]) d = place(d, id, "top");
    d = place(d, 9, "more");
    d = move(d, 3, "up");
    expect(ids(d.collections?.navbarGroups?.top)).toEqual([1, 3, 2]);
    d = move(d, 1, "up"); // already first
    d = move(d, 2, "down"); // already last
    expect(ids(d.collections?.navbarGroups?.top)).toEqual([1, 3, 2]);
    expect(ids(d.collections?.navbarGroups?.more)).toEqual([9]);
    expect(move(d, 77, "up")).toEqual(d); // not listed: nothing to move
  });

  test("given the input document, when an edit is applied, then it is never mutated", () => {
    const base = place(seedDoc(), 1, "top");
    const frozen = structuredClone(base);
    place(base, 2, "more"); move(base, 1, "down");
    expect(base).toEqual(frozen);
  });

  test("given enablements and navbar groups, when either changes, then the other survives (independent decisions)", () => {
    const INTERNAL = { store: "use-sul", collectionId: 152122 } as const;
    let d = ok(seedDoc(), { type: "set-collection-enabled", ...INTERNAL, enabled: true });
    d = place(d, 10, "top");
    expect(d.collections).toEqual({ enabled: [INTERNAL], navbarGroups: { top: [ref(10)], more: [] } });
    d = ok(d, { type: "set-collection-enabled", ...INTERNAL, enabled: false });
    expect(d.collections).toEqual({ enabled: [], navbarGroups: { top: [ref(10)], more: [] } });
    d = place(d, 10, "none");
    d = ok(d, { type: "set-collection-enabled", ...INTERNAL, enabled: true });
    d = place(place(d, 10, "more"), 10, "none");
    expect(d.collections).toEqual({ enabled: [INTERNAL] });
  });

  test("given a group above the sanity ceiling, when validated, then it is refused (payload size, not an editorial limit)", () => {
    const many = Array.from({ length: MAX_NAVBAR_GROUP + 1 }, (_, i) => ref(i + 1));
    expect(validateScopeDoc({ ...seedDoc(), collections: { enabled: [], navbarGroups: { top: many, more: [] } } }).ok).toBe(false);
    expect(validateScopeDoc({ ...seedDoc(), collections: { enabled: [], navbarGroups: { top: many.slice(0, MAX_NAVBAR_GROUP), more: [] } } }).ok).toBe(true);
  });

  test("given a foreign store, a duplicate, a collection in both groups or a malformed shape, when validated, then the document is rejected", () => {
    const bad = (navbarGroups: unknown) => validateScopeDoc({ ...seedDoc(), collections: { enabled: [], navbarGroups } as never }).ok;
    expect(bad({ top: [{ store: "use-norte", collectionId: 5 }], more: [] })).toBe(false);
    expect(bad({ top: [ref(1), ref(1)], more: [] })).toBe(false);
    expect(bad({ top: [ref(1)], more: [ref(1)] })).toBe(false);
    expect(bad({ top: [ref(-1)], more: [] })).toBe(false);
    expect(bad({ top: [ref(1)] })).toBe(false);
    expect(bad({ top: [ref(1)], more: [ref(2)] })).toBe(true);
  });

  test("given a document without the keys (every release before the groups), when validated, then it is still valid", () => {
    expect(validateScopeDoc(seedDoc()).ok).toBe(true);
  });
});

describe("old flat navbar list: deterministic fallback and migration", () => {
  const legacyDoc = (): ScopeDoc => ({ ...seedDoc(), collections: { enabled: [], navbar: [ref(3), ref(1), ref(2)] } });

  test("given a legacy flat list, when read, then every entry counts as Topo (legacy flag set) and nothing is invented for Demais categorias", () => {
    const { groups, legacy } = effectiveNavbarGroups(legacyDoc());
    expect(legacy).toBe(true);
    expect(ids(groups.top)).toEqual([3, 1, 2]);
    expect(groups.more).toEqual([]);
    expect(validateScopeDoc(legacyDoc()).ok).toBe(true); // it stays a valid document until edited
  });

  test("given a legacy list with more than five entries, when read, then it is NOT split into 'first five on top, the rest in Mais'", () => {
    const d: ScopeDoc = { ...seedDoc(), collections: { enabled: [], navbar: [1, 2, 3, 4, 5, 6, 7].map(ref) } };
    expect(effectiveNavbarGroups(d).groups.top).toHaveLength(7);
    expect(effectiveNavbarGroups(d).groups.more).toHaveLength(0);
  });

  test("given a legacy list, when the owner makes the first edit, then it is migrated into navbarGroups.top and the legacy key is dropped", () => {
    const d = place(legacyDoc(), 9, "more");
    expect(d.collections?.navbar).toBeUndefined();
    expect(ids(d.collections?.navbarGroups?.top)).toEqual([3, 1, 2]);
    expect(ids(d.collections?.navbarGroups?.more)).toEqual([9]);
    expect(validateScopeDoc(d).ok).toBe(true);
    const moved = move(legacyDoc(), 2, "up");
    expect(ids(moved.collections?.navbarGroups?.top)).toEqual([3, 2, 1]);
  });

  test("given both keys, when read, then the new groups win", () => {
    const d: ScopeDoc = { ...seedDoc(), collections: { enabled: [], navbar: [ref(1)], navbarGroups: { top: [ref(2)], more: [ref(3)] } } };
    expect(effectiveNavbarGroups(d)).toEqual({ groups: { top: [ref(2)], more: [ref(3)] }, legacy: false });
  });

  test("given pure helpers, when composed, then position and order behave the same as the drafts operations", () => {
    let g = { top: [] as CollectionRef[], more: [] as CollectionRef[] };
    g = withPosition(withPosition(withPosition(g, ref(1), "top"), ref(2), "top"), ref(3), "more");
    g = movedWithin(g, ref(2), "up");
    expect(ids(g.top)).toEqual([2, 1]);
    expect(ids(withNavbarGroups(seedDoc(), g).collections?.navbarGroups?.more)).toEqual([3]);
  });
});

describe("publish screen diff", () => {
  const names = (r: { collectionId: number }) => ({ 1: "Novidades", 2: "Do Nosso Jeito", 3: "Kits" })[r.collectionId as 1 | 2 | 3] ?? null;
  const texts = (a: ScopeDoc, b: ScopeDoc) => diffDocs(a, b, names).map((c) => c.text);

  test("given only a navbar change, when diffed, then it is publishable and names the collection and the group", () => {
    const base = seedDoc();
    const top = place(base, 1, "top");
    expect(texts(base, top)).toEqual(['"Novidades" passa a aparecer no topo da navbar da INK']);
    expect(texts(top, base)).toEqual(['"Novidades" sai da navbar da INK']);
    expect(texts(top, top)).toEqual([]);
    expect(texts(base, place(base, 9, "more"))[0]).toContain("coleção #9");
  });

  test("given a collection that changes group or a group that is reordered, when diffed, then each is reported", () => {
    let base = seedDoc();
    for (const id of [1, 2]) base = place(base, id, "top");
    expect(texts(base, place(base, 1, "more"))).toEqual(['"Novidades" muda para em Demais categorias da navbar da INK']);
    expect(texts(base, move(base, 2, "up"))).toEqual(["A ordem no topo da navbar da INK mudou"]);
  });

  test("given a legacy list and the same selection as Topo, when diffed, then nothing changed (the migration alone is not a publish)", () => {
    const legacy: ScopeDoc = { ...seedDoc(), collections: { enabled: [], navbar: [ref(1), ref(2)] } };
    const migrated: ScopeDoc = { ...seedDoc(), collections: { enabled: [], navbarGroups: { top: [ref(1), ref(2)], more: [] } } };
    expect(texts(legacy, migrated)).toEqual([]);
  });
});

describe("publicNavbar (what the Worker reads)", () => {
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

  async function publish(collectionsKey: Record<string, unknown> | null, collections: unknown[]) {
    await mkdir(path.join(dir, "site-config"), { recursive: true });
    const bundle = seedBundle();
    bundle.docs.sul = { ...bundle.docs.sul, ...(collectionsKey ? { collections: { enabled: [], ...collectionsKey } } : {}) } as ScopeDoc;
    bundle.releaseId = "r1";
    await writeFile(path.join(dir, "site-config", "published.json"), JSON.stringify(bundle));
    await writeFile(path.join(dir, "collections-snapshot.json"), JSON.stringify({ version: 2, stores: { "use-sul": { commerceStoreKey: "use-sul", syncedAt: "2026-09-24T00:00:00Z", catalogSyncedAt: "2026-09-21T00:00:00Z", totalCount: collections.length, collections } } }));
    const { publicNavbar } = await import("@/lib/site-config/navbar");
    return publicNavbar("sul");
  }
  const seven = [
    record(1, "Novidades", "novidades", 3), record(2, "Do Nosso Jeito", "do-nosso-jeito", 2), record(3, "Seu Lugar", "seu-lugar", 1), record(4, "Feito Para Você", "feito-para-voce", 4),
    record(5, "Fala Daqui", "fala-daqui", 5), record(6, "Kits", "kits", 6), record(7, "Lançamento de Verão", "lancamento-de-verao", 7),
  ];
  const titles = (l: { title: string }[]) => l.map((e) => e.title);

  test("given several collections in each group, when read, then top and more come in the OWNER's order with id, title, slug, public url and order", async () => {
    const out = await publish({ navbarGroups: { top: [ref(1), ref(7), ref(2), ref(4), ref(6), ref(5)], more: [ref(3)] } }, seven);
    expect(out.v).toBe(2); expect(out.region).toBe("sul");
    expect(titles(out.top)).toEqual(["Novidades", "Lançamento de Verão", "Do Nosso Jeito", "Feito Para Você", "Kits", "Fala Daqui"]); // six on top, none of them special
    expect(titles(out.more)).toEqual(["Seu Lugar"]);
    expect(out.top[0]).toEqual({ id: 1, title: "Novidades", slug: "novidades", url: "https://www.usesul.com.br/usesul/collections/novidades", order: 1 });
    expect(out.top.map((e) => e.order)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(out.states).toEqual([{ uf: "PR", name: "Paraná", path: "/sul/pr" }, { uf: "SC", name: "Santa Catarina", path: "/sul/sc" }, { uf: "RS", name: "Rio Grande do Sul", path: "/sul/rs" }]);
  });

  test("given two collections with 'launch-like' names on top, when read, then both are listed: no slot logic exists", async () => {
    const out = await publish({ navbarGroups: { top: [ref(7), ref(1)], more: [] } }, seven);
    expect(titles(out.top)).toEqual(["Lançamento de Verão", "Novidades"]);
    expect(out.more).toEqual([]);
  });

  test("given a collection moved from the top group to the dropdown and republished, when read, then it is only in the dropdown", async () => {
    const before = await publish({ navbarGroups: { top: [ref(1), ref(2)], more: [] } }, seven);
    expect(titles(before.top)).toEqual(["Novidades", "Do Nosso Jeito"]);
    vi.resetModules();
    const after = await publish({ navbarGroups: { top: [ref(2)], more: [ref(1)] } }, seven);
    expect(titles(after.top)).toEqual(["Do Nosso Jeito"]); expect(titles(after.more)).toEqual(["Novidades"]);
  });

  test("given internal, empty, unknown and bad-slug collections, when read, then none is listed but the good ones keep their order", async () => {
    const out = await publish({ navbarGroups: { top: [ref(1), ref(2), ref(3), ref(99)], more: [ref(4), ref(5)] } }, [
      record(1, "Boa", "boa", 1), record(2, "Interna", "interna", 2, { isAvailable: false }), record(3, "Vazia", "vazia", 3, { matchedCount: 0, memberIds: [] }),
      record(4, "Slug ruim", "Slug Ruim/../x", 4), record(5, "Boa 2", "boa-2", 5),
    ]);
    expect(titles(out.top)).toEqual(["Boa"]);
    expect(titles(out.more)).toEqual(["Boa 2"]);
  });

  test("given the legacy flat list, when read, then it is published as Topo in INK's own menu order (what it always did)", async () => {
    const out = await publish({ navbar: [ref(1), ref(3), ref(2)] }, seven);
    expect(titles(out.top)).toEqual(["Seu Lugar", "Do Nosso Jeito", "Novidades"]);
    expect(out.more).toEqual([]);
  });

  test("given nothing configured, no synced collections, or a corrupt overlap, when read, then the payload is well-formed and empty (never an error)", async () => {
    const empty = await publish(null, seven);
    expect(empty).toMatchObject({ v: 2, region: "sul", top: [], more: [] });
    expect(empty.states).toHaveLength(3); // Regiões is fixed, independent of the CMS selection
    vi.resetModules();
    const dup = await publish({ navbarGroups: { top: [ref(1)], more: [ref(1)] } }, seven); // invalid on purpose: the reader ignores the whole invalid collections key
    expect(dup.top.length + dup.more.length).toBeLessThanOrEqual(1);
    vi.resetModules();
    await mkdir(path.join(dir, "site-config"), { recursive: true });
    const bundle = seedBundle();
    bundle.docs.sul = { ...bundle.docs.sul, collections: { enabled: [], navbarGroups: { top: [ref(1)], more: [] } } } as ScopeDoc;
    await writeFile(path.join(dir, "site-config", "published.json"), JSON.stringify({ ...bundle, releaseId: "r2" }));
    await rm(path.join(dir, "collections-snapshot.json"), { force: true });
    const { publicNavbar } = await import("@/lib/site-config/navbar");
    expect(publicNavbar("sul")).toMatchObject({ top: [], more: [] });
  });
});

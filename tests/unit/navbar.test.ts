import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { applyOp, type DraftOp } from "@/lib/admin/draft-ops";
import { MAX_NAVBAR_COLLECTIONS, validateScopeDoc, type ScopeDoc } from "@/lib/site-config/schema";
import { buildSeedBundle } from "@/lib/site-config/seed";
import { navbarCollectionIds } from "@/lib/site-config/collections-enabled";

const seedBundle = () => buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null });
const seedDoc = (): ScopeDoc => structuredClone(seedBundle().docs.sul);
const ctx = { newId: () => "t1" };
const ok = (d: ScopeDoc, op: DraftOp) => {
  const r = applyOp(d, op, ctx);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.doc;
};
const REF = { store: "use-sul", collectionId: 152188 } as const;

describe("navbar collections in the document", () => {
  test("given a public collection, when shown in the navbar, then only the reference is stored, idempotently, and the document stays valid", () => {
    const once = ok(seedDoc(), { type: "set-collection-navbar", ...REF, shown: true });
    expect(once.collections).toEqual({ enabled: [], navbar: [REF] });
    expect(ok(once, { type: "set-collection-navbar", ...REF, shown: true })).toEqual(once);
    expect(validateScopeDoc(once).ok).toBe(true);
    expect([...navbarCollectionIds(once, "use-sul")]).toEqual([REF.collectionId]);
  });

  test("given a shown collection, when it is hidden, then the collections key disappears; the input document is not mutated", () => {
    const shown = ok(seedDoc(), { type: "set-collection-navbar", ...REF, shown: true });
    const frozen = structuredClone(shown);
    expect(ok(shown, { type: "set-collection-navbar", ...REF, shown: false }).collections).toBeUndefined();
    expect(shown).toEqual(frozen);
  });

  test("given both an enablement and a navbar entry, when either changes, then the other survives (independent decisions)", () => {
    const INTERNAL = { store: "use-sul", collectionId: 152122 } as const;
    let d = ok(seedDoc(), { type: "set-collection-enabled", ...INTERNAL, enabled: true });
    d = ok(d, { type: "set-collection-navbar", ...REF, shown: true });
    expect(d.collections).toEqual({ enabled: [INTERNAL], navbar: [REF] });
    d = ok(d, { type: "set-collection-enabled", ...INTERNAL, enabled: false });
    expect(d.collections).toEqual({ enabled: [], navbar: [REF] });
    d = ok(d, { type: "set-collection-navbar", ...REF, shown: false });
    d = ok(d, { type: "set-collection-enabled", ...INTERNAL, enabled: true });
    d = ok(d, { type: "set-collection-navbar", ...REF, shown: true });
    d = ok(d, { type: "set-collection-navbar", ...REF, shown: false });
    expect(d.collections).toEqual({ enabled: [INTERNAL] });
  });

  test("given more collections than the menu comfortably holds, when adding past the limit, then it is refused", () => {
    let d = seedDoc();
    for (let i = 1; i <= MAX_NAVBAR_COLLECTIONS; i++) d = ok(d, { type: "set-collection-navbar", store: "use-sul", collectionId: i, shown: true });
    const refused = applyOp(d, { type: "set-collection-navbar", store: "use-sul", collectionId: 999, shown: true }, ctx);
    expect(refused.ok).toBe(false);
  });

  test("given a reference to another region's INK store or a malformed one, when validated, then the document is rejected", () => {
    const foreign = { ...seedDoc(), collections: { enabled: [], navbar: [{ store: "use-norte", collectionId: 5 }] } };
    expect(validateScopeDoc(foreign).ok).toBe(false);
    const malformed = { ...seedDoc(), collections: { enabled: [], navbar: [{ store: "use-sul", collectionId: -1 }] } };
    expect(validateScopeDoc(malformed).ok).toBe(false);
    const dup = { ...seedDoc(), collections: { enabled: [], navbar: [REF, REF] } };
    expect(validateScopeDoc(dup).ok).toBe(false);
  });

  test("given a document without the key (every existing release), when validated, then it is still valid", () => {
    expect(validateScopeDoc(seedDoc()).ok).toBe(true);
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

  async function publish(navbar: { store: string; collectionId: number }[], collections: unknown[]) {
    await mkdir(path.join(dir, "site-config"), { recursive: true });
    const bundle = seedBundle();
    bundle.docs.sul = { ...bundle.docs.sul, collections: { enabled: [], navbar } } as ScopeDoc;
    bundle.releaseId = "r1";
    await writeFile(path.join(dir, "site-config", "published.json"), JSON.stringify(bundle));
    await writeFile(path.join(dir, "collections-snapshot.json"), JSON.stringify({ version: 2, stores: { "use-sul": { commerceStoreKey: "use-sul", syncedAt: "2026-09-24T00:00:00Z", catalogSyncedAt: "2026-09-21T00:00:00Z", totalCount: collections.length, collections } } }));
    const { publicNavbar } = await import("@/lib/site-config/navbar");
    return publicNavbar("sul");
  }
  const sul = (ids: number[]) => ids.map((collectionId) => ({ store: "use-sul", collectionId }));

  test("given chosen collections, when read, then they come in INK's own menu order, not the order they were picked", async () => {
    const out = await publish(sul([3, 1, 2]), [record(1, "Seu Lugar", "seu-lugar", 1), record(2, "Do Nosso Jeito", "do-nosso-jeito", 2), record(3, "Da Nossa Terra", "da-nossa-terra", 3)]);
    expect(out).toEqual({ v: 1, region: "sul", collections: [{ name: "Seu Lugar", slug: "seu-lugar" }, { name: "Do Nosso Jeito", slug: "do-nosso-jeito" }, { name: "Da Nossa Terra", slug: "da-nossa-terra" }] });
  });

  test("given an internal, an empty, an unknown and a bad-slug collection, when read, then none of them is ever listed", async () => {
    const out = await publish(sul([1, 2, 3, 4, 99]), [
      record(1, "Interna", "interna", 1, { isAvailable: false }),
      record(2, "Vazia", "vazia", 2, { matchedCount: 0, memberIds: [] }),
      record(3, "Slug ruim", "Slug Ruim/../x", 3),
      record(4, "Boa", "boa", 4),
    ]);
    expect(out.collections).toEqual([{ name: "Boa", slug: "boa" }]);
  });

  test("given nothing configured (the seed), when read, then the list is empty and the response still has the expected shape", async () => {
    const out = await publish([], [record(1, "Seu Lugar", "seu-lugar", 1)]);
    expect(out).toEqual({ v: 1, region: "sul", collections: [] });
  });

  test("given no synced collections at all, when read, then the list is empty (never an error)", async () => {
    await mkdir(path.join(dir, "site-config"), { recursive: true });
    const bundle = seedBundle();
    bundle.docs.sul = { ...bundle.docs.sul, collections: { enabled: [], navbar: sul([1]) } } as ScopeDoc;
    await writeFile(path.join(dir, "site-config", "published.json"), JSON.stringify({ ...bundle, releaseId: "r2" }));
    const { publicNavbar } = await import("@/lib/site-config/navbar");
    expect(publicNavbar("sul").collections).toEqual([]);
  });
});

describe("publish screen diff", () => {
  test("given only a navbar change, when diffed, then it is a publishable change that names the collection; undoing it clears it", async () => {
    const { diffDocs } = await import("@/lib/admin/diff");
    const base = seedDoc();
    const shown = ok(base, { type: "set-collection-navbar", ...REF, shown: true });
    const names = (r: { collectionId: number }) => (r.collectionId === REF.collectionId ? "Seu Lugar" : null);
    expect(diffDocs(base, shown, names).map((c) => c.text)).toEqual(['"Seu Lugar" passa a aparecer na navbar da INK']);
    expect(diffDocs(shown, base, names).map((c) => [c.kind, c.text])).toEqual([["navbar-removed", '"Seu Lugar" sai da navbar da INK']]);
    expect(diffDocs(shown, shown, names)).toEqual([]);
    expect(diffDocs(base, shown)[0].text).toContain(`coleção #${REF.collectionId}`);
  });
});

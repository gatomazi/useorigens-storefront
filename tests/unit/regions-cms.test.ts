import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { applyOp } from "@/lib/admin/draft-ops";
import { publishRelease, seedForEnv, type PublishDeps } from "@/lib/admin/publishing";
import type { PublishedBundle, Section } from "@/lib/site-config/schema";
import { validateBundle, validateScopeDoc } from "@/lib/site-config/schema";

const ctx = { newId: () => "x1" };
const saved = { meta: process.env.NEXT_PUBLIC_META_PIXEL_ID, ga: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID };
beforeEach(() => {
  process.env.NEXT_PUBLIC_META_PIXEL_ID = "1558923262073052";
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = "G-8GYTEJ1F77";
});
afterEach(() => {
  if (saved.meta === undefined) delete process.env.NEXT_PUBLIC_META_PIXEL_ID; else process.env.NEXT_PUBLIC_META_PIXEL_ID = saved.meta;
  if (saved.ga === undefined) delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID; else process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = saved.ga;
});

const heroFooter = (): Section[] => {
  const sul = seedForEnv().docs.sul.home!.sections;
  return [sul[0], sul[sul.length - 1]].map((s) => structuredClone(s));
};
const carousel = (store: "use-norte" | "use-sul"): Section => ({
  id: "custom-a1", anchor: "colecao-a1", headingId: "colecao-a1-title", template: "product-carousel", active: true, title: "Coleção",
  layout: { variant: "standard", tone: "light", surface: "plain" },
  source: { kind: "ink-category", store, collectionId: 1, order: "category", limit: 6 }, analyticsSource: "homeCollection",
  appearance: { fill: { kind: "none" }, focal: { mobile: { x: 50, y: 50 }, desktop: { x: 50, y: 50 } }, overlay: { preset: "none" } },
});

describe("the seed keeps the new regions out of the public site and off Sul's tracking", () => {
  test("given the seed, then Norte and Centro-Oeste have no home, are not launched and start with tracking off", () => {
    const seed = seedForEnv();
    for (const r of ["norte", "centro-oeste"] as const) {
      expect(seed.docs[r].home).toBeUndefined();
      expect(seed.docs[r].launched).toBeFalsy();
      expect(seed.docs[r].tracking).toEqual({ meta: { mode: "disabled" }, ga4: { mode: "disabled" } });
    }
    expect(validateBundle(seed).ok).toBe(true);
  });
});

describe("schema rules that keep regions apart", () => {
  test("given 'legacy' tracking on a region other than Sul, when validated, then it is rejected (Sul's build-time IDs never reach it)", () => {
    const doc = structuredClone(seedForEnv().docs.norte);
    doc.tracking.meta = { mode: "legacy" };
    expect(validateScopeDoc(doc).ok).toBe(false);
  });

  test("given a remembered-but-inactive ID on a region (not the global), when validated, then it is rejected; on the global it is accepted", () => {
    const region = structuredClone(seedForEnv().docs.norte);
    region.tracking.meta = { mode: "disabled", id: "1234567890123456" };
    expect(validateScopeDoc(region).ok).toBe(false);
    const global = structuredClone(seedForEnv().docs.global);
    global.tracking.meta = { mode: "disabled", id: "1234567890123456" };
    expect(validateScopeDoc(global).ok).toBe(true);
  });

  test("given a Norte section fed by Sul's store, when validated, then it is rejected; fed by Norte's own store it passes", () => {
    const doc = structuredClone(seedForEnv().docs.norte);
    doc.home = { sections: [heroFooter()[0], carousel("use-sul"), heroFooter()[1]] };
    const wrong = validateScopeDoc(doc);
    expect(wrong.ok).toBe(false);
    doc.home = { sections: [heroFooter()[0], carousel("use-norte"), heroFooter()[1]] };
    expect(validateScopeDoc(doc).ok).toBe(true);
  });
});

describe("draft operations for regions", () => {
  test("given a region with no home, when init-home is applied, then the home exists; a second init is refused", () => {
    const doc = seedForEnv().docs["centro-oeste"];
    const r = applyOp(doc, { type: "init-home", sections: heroFooter() }, ctx);
    expect(r.ok).toBe(true);
    expect(r.ok && r.doc.home!.sections).toHaveLength(2);
    expect(applyOp(r.ok ? r.doc : doc, { type: "init-home", sections: heroFooter() }, ctx).ok).toBe(false);
    expect(doc.home).toBeUndefined(); // input not mutated
  });

  test("given the global scope, when init-home is applied, then it is refused (global has no home)", () => {
    expect(applyOp(seedForEnv().docs.global, { type: "init-home", sections: heroFooter() }, ctx).ok).toBe(false);
  });

  test("given a region, when set-tracking has a valid own ID, then it is stored; with a malformed one it is rejected and the doc is unchanged", () => {
    const doc = seedForEnv().docs.norte;
    const ok = applyOp(doc, { type: "set-tracking", tracking: { meta: { mode: "override", id: "2222222222222222" }, ga4: { mode: "inherit" } } }, ctx);
    expect(ok.ok && ok.doc.tracking.meta).toEqual({ mode: "override", id: "2222222222222222" });
    for (const bad of [{ mode: "override", id: "abc" }, { mode: "override", id: "G-ABC" }] as const) {
      expect(applyOp(doc, { type: "set-tracking", tracking: { meta: bad, ga4: { mode: "disabled" } } }, ctx).ok).toBe(false);
    }
    const ga = applyOp(doc, { type: "set-tracking", tracking: { meta: { mode: "disabled" }, ga4: { mode: "override", id: "G-ABCDEF1234" } } }, ctx);
    expect(ga.ok).toBe(true);
    expect(applyOp(doc, { type: "set-tracking", tracking: { meta: { mode: "disabled" }, ga4: { mode: "override", id: "1234" } } }, ctx).ok).toBe(false);
  });

  test("given a global that inherits, when set-tracking is applied, then it is rejected (nothing above the global)", () => {
    expect(applyOp(seedForEnv().docs.global, { type: "set-tracking", tracking: { meta: { mode: "inherit" }, ga4: { mode: "disabled" } } }, ctx).ok).toBe(false);
  });

  test("given Norte, when set-launched is applied, then the flag flips; for Sul and global it is refused", () => {
    const on = applyOp(seedForEnv().docs.norte, { type: "set-launched", launched: true }, ctx);
    expect(on.ok && on.doc.launched).toBe(true);
    expect(applyOp(seedForEnv().docs.sul, { type: "set-launched", launched: true }, ctx).ok).toBe(false);
    expect(applyOp(seedForEnv().docs.global, { type: "set-launched", launched: true }, ctx).ok).toBe(false);
  });
});

/** A minimal in-memory release ledger (the real adapters are exercised in the integration and prod E2E suites). */
function ledger(initial: PublishedBundle) {
  const bundles = new Map<string, PublishedBundle>([["r1", { ...initial, releaseId: "r1" }]]);
  let head = "r1";
  const written: PublishedBundle[] = [];
  const deps: PublishDeps = {
    actorId: null,
    media: async () => ({}),
    files: { writeAtomic: async (b: PublishedBundle) => { written.push(b); }, readState: async () => ({ kind: "valid", releaseId: head, checksum: "x" }), read: async () => null } as never,
    releases: {
      head: async () => ({ record: { id: head, checksum: "x", status: "live", createdAt: 0 }, bundle: bundles.get(head)! }),
      restorable: async (id: string) => bundles.get(id) ?? null,
      begin: async (_r: unknown, compose: (id: string) => Promise<PublishedBundle>) => {
        const id = `r${bundles.size + 1}`;
        const bundle = await compose(id);
        bundles.set(id, bundle);
        return { release: { id, checksum: "x", status: "pending", createdAt: 1 }, bundle };
      },
      markLive: async (id: string) => { head = id; },
      markFailed: async () => undefined,
      markRevalidated: async () => undefined,
    } as never,
  };
  return { deps, bundles, head: () => bundles.get(head)!, written };
}
const noop = async () => undefined;

describe("publishing and restoring are per region", () => {
  test("given Norte is published and then Sul changes, when Norte is restored to its first release, then Sul keeps its newer content and Norte returns", async () => {
    const seed = seedForEnv();
    const world = ledger(seed);

    const norte = structuredClone(seed.docs.norte);
    norte.home = { sections: heroFooter() };
    norte.launched = true;
    norte.tracking = { meta: { mode: "override", id: "2222222222222222" }, ga4: { mode: "disabled" } };
    const p1 = await publishRelease(world.deps, { kind: "publish", doc: norte, confirmTracking: true }, noop);
    expect(p1.ok).toBe(true);
    const firstNorteRelease = "r2";

    const sul = structuredClone(world.head().docs.sul);
    sul.home!.sections[1].title = "Sul mudou depois";
    expect((await publishRelease(world.deps, { kind: "publish", doc: sul }, noop)).ok).toBe(true);

    const norteAgain = structuredClone(world.head().docs.norte);
    norteAgain.launched = false;
    expect((await publishRelease(world.deps, { kind: "publish", doc: norteAgain }, noop)).ok).toBe(true);
    expect(world.head().docs.norte.launched).toBe(false);

    const restored = await publishRelease(world.deps, { kind: "rollback", toReleaseId: firstNorteRelease, scope: "norte", confirmTracking: true }, noop);
    expect(restored.ok).toBe(true);
    const now = world.head();
    expect(now.docs.norte.launched).toBe(true);
    expect(now.docs.sul.home!.sections[1].title).toBe("Sul mudou depois"); // Sul untouched by Norte's restore
    expect(now.docs["centro-oeste"]).toEqual(seed.docs["centro-oeste"]);
    expect(now.docs.global).toEqual(seed.docs.global);
  });

  test("given a restore that changes the effective tracking, when it is not confirmed, then it is refused and nothing is written", async () => {
    const seed = seedForEnv();
    const world = ledger(seed);
    const norte = structuredClone(seed.docs.norte);
    norte.tracking = { meta: { mode: "override", id: "2222222222222222" }, ga4: { mode: "disabled" } };
    await publishRelease(world.deps, { kind: "publish", doc: norte, confirmTracking: true }, noop);
    const cleared = structuredClone(world.head().docs.norte);
    cleared.tracking = { meta: { mode: "disabled" }, ga4: { mode: "disabled" } };
    await publishRelease(world.deps, { kind: "publish", doc: cleared, confirmTracking: true }, noop);
    const writes = world.written.length;
    const refused = await publishRelease(world.deps, { kind: "rollback", toReleaseId: "r2", scope: "norte" }, noop);
    expect(refused.ok).toBe(false);
    expect(world.written.length).toBe(writes);
  });

  test("given a content-only publish of Sul, when it runs, then no other region's document or tracking changes", async () => {
    const seed = seedForEnv();
    const world = ledger(seed);
    const sul = structuredClone(seed.docs.sul);
    sul.home!.sections[1].title = "Só o Sul";
    expect((await publishRelease(world.deps, { kind: "publish", doc: sul }, noop)).ok).toBe(true);
    for (const scope of ["global", "norte", "centro-oeste"] as const) expect(world.head().docs[scope]).toEqual(seed.docs[scope]);
  });
});

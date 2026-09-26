import { describe, expect, test } from "vitest";
import { applyOp, type DraftOp } from "@/lib/admin/draft-ops";
import { composeDoc, linkProblems, publishRelease, seedForEnv, targetMarker, type PublishDeps } from "@/lib/admin/publishing";
import { validateCustomizer, validatePage, validateScopeDoc, validateSection, type Customizer, type PublishedBundle, type ScopeDoc } from "@/lib/site-config/schema";
import { uniqueSlug } from "@/lib/site-config/pages";

let n = 0;
const ctx = () => ({ newId: () => `t${++n}` });
const seed = seedForEnv();
const start = (scope: "sul" | "norte" = "sul"): ScopeDoc => structuredClone(seed.docs[scope]);
const run = (doc: ScopeDoc, op: DraftOp) => {
  const r = applyOp(doc, op, ctx());
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r;
};
const SUL_COLLECTION = { store: "use-sul", collectionId: 152188 } as const;
const PIC = { assetId: "legacy:sul/fala-daqui-desktop", alt: "", decorative: true };

describe("pages in the region document", () => {
  test("given a region, when a hotpage and a landing are created, then each has a page hero first, its own slug and stays out of the home", () => {
    let doc = start();
    const homeBefore = JSON.stringify(doc.home);
    doc = run(doc, { type: "create-page", kind: "hotpage", title: "Dia dos Pais" }).doc;
    doc = run(doc, { type: "create-page", kind: "categoryLanding", title: "Pais" }).doc;
    expect(doc.pages!.map((p) => [p.kind, p.slug, p.sections[0].template])).toEqual([["hotpage", "dia-dos-pais", "page-hero"], ["categoryLanding", "pais", "page-hero"]]);
    expect(JSON.stringify(doc.home)).toBe(homeBefore);
    expect(validateScopeDoc(doc).ok).toBe(true);
    expect(doc.pages!.every((p) => p.seo.indexable === false && !p.archived && p.version === 1)).toBe(true);
  });

  test("given the same slug, when created for the same kind, then it is refused; for another kind it is allowed; reserved words never are", () => {
    let doc = run(start(), { type: "create-page", kind: "hotpage", title: "Pais" }).doc;
    expect(applyOp(doc, { type: "create-page", kind: "hotpage", title: "Outro", slug: "pais" }, ctx()).ok).toBe(false);
    doc = run(doc, { type: "create-page", kind: "categoryLanding", title: "Pais" }).doc;
    expect(doc.pages!.map((p) => `${p.kind}/${p.slug}`)).toEqual(["hotpage/pais", "categoryLanding/pais"]);
    expect(applyOp(doc, { type: "create-page", kind: "hotpage", title: "x", slug: "personalizar" }, ctx()).ok).toBe(false);
    expect(uniqueSlug("Colecoes", new Set())).toBe("colecoes-pagina");
    expect(uniqueSlug("Dia dos Pais", new Set(["dia-dos-pais"]))).toBe("dia-dos-pais-2");
  });

  test("given a page, when sections are added and moved, then the same ops as the home apply: appended at the end, never above the hero, hero locked", () => {
    let doc = run(start(), { type: "create-page", kind: "hotpage", title: "Pais" }).doc;
    const page = () => doc.pages![0];
    doc = run(doc, { type: "in-page", page: page().id, op: { type: "add-carousel", title: "Churrasqueiros", source: { kind: "ink-category", ...SUL_COLLECTION, order: "category", limit: 6 } } }).doc;
    doc = run(doc, { type: "in-page", page: page().id, op: { type: "add-structured", template: "campaign" } }).doc;
    expect(page().sections.map((s) => s.template)).toEqual(["page-hero", "product-carousel", "campaign"]);
    const campaign = page().sections[2];
    doc = run(doc, { type: "in-page", page: page().id, op: { type: "move", id: campaign.id, direction: "up" } }).doc;
    expect(page().sections.map((s) => s.template)).toEqual(["page-hero", "campaign", "product-carousel"]);
    expect(applyOp(doc, { type: "in-page", page: page().id, op: { type: "move", id: page().sections[1].id, direction: "up" } }, ctx()).ok).toBe(false); // cannot pass the hero
    expect(applyOp(doc, { type: "in-page", page: page().id, op: { type: "set-active", id: page().sections[0].id, active: false } }, ctx()).ok).toBe(false);
    expect(applyOp(doc, { type: "in-page", page: page().id, op: { type: "add-structured", template: "campaign" } }, ctx()).ok).toBe(true); // campaigns repeat
  });

  test("given a page section from another region's store or a button to another region, when saved, then it is refused", () => {
    let doc = run(start("norte"), { type: "create-page", kind: "hotpage", title: "Amazônia" }).doc;
    const foreign = applyOp(doc, { type: "in-page", page: doc.pages![0].id, op: { type: "add-carousel", title: "Sul", source: { kind: "ink-category", ...SUL_COLLECTION, order: "category", limit: 6 } } }, ctx());
    expect(foreign.ok).toBe(false);
    doc = run(doc, { type: "in-page", page: doc.pages![0].id, op: { type: "add-structured", template: "campaign" } }).doc;
    const campaign = doc.pages![0].sections[1];
    const wrong = applyOp(doc, { type: "in-page", page: doc.pages![0].id, op: { type: "update", id: campaign.id, patch: { cta: { label: "Ir", dest: { kind: "route", path: "/sul/sc" } } } } }, ctx());
    expect(wrong.ok).toBe(false);
    const own = applyOp(doc, { type: "in-page", page: doc.pages![0].id, op: { type: "update", id: campaign.id, patch: { cta: { label: "Ir", dest: { kind: "route", path: "/norte/pa" } } } } }, ctx());
    expect(own.ok).toBe(true);
  });

  test("given a page, when duplicated, archived and removed, then the copy is a fresh draft, archiving keeps the content and removal drops it", () => {
    let doc = run(start(), { type: "create-page", kind: "hotpage", title: "Pais" }).doc;
    const id = doc.pages![0].id;
    doc = run(doc, { type: "duplicate-page", id }).doc;
    expect(doc.pages![1]).toMatchObject({ slug: "pais-copia", title: "Pais (cópia)", version: 1, seo: { indexable: false } });
    doc = run(doc, { type: "set-page-archived", id, archived: true }).doc;
    expect(doc.pages![0].archived).toBe(true);
    doc = run(doc, { type: "set-page-archived", id, archived: false }).doc;
    expect(doc.pages![0].archived).toBeUndefined();
    doc = run(doc, { type: "remove-page", id }).doc;
    expect(doc.pages!.map((p) => p.slug)).toEqual(["pais-copia"]);
  });

  test("given the global scope or a page hero in the home, when validated, then both are refused", () => {
    expect(applyOp(start() && structuredClone(seed.docs.global), { type: "create-page", kind: "hotpage", title: "x" }, ctx()).ok).toBe(false);
    const page = run(start(), { type: "create-page", kind: "hotpage", title: "Pais" }).doc.pages![0];
    expect(validatePage(page, "sul").ok).toBe(true);
    expect(validatePage({ ...page, sections: [page.sections[0], structuredClone(page.sections[0])] }, "sul").ok).toBe(false);
    expect(validatePage({ ...page, sections: [] }, "sul").ok).toBe(false);
    const doc = start();
    doc.home!.sections.splice(1, 0, { ...structuredClone(page.sections[0]), id: "x1", anchor: "x1" });
    expect(validateScopeDoc(doc).ok).toBe(false);
  });
});

describe("personalization models", () => {
  const model = (doc: ScopeDoc) => doc.customizers![0];
  const base = () => run(start(), { type: "create-customizer", name: "Pai Paranaense", source: SUL_COLLECTION }).doc;

  test("given a region, when a model is created, then it is a draft (inactive), of the region's own store, with a stable id and slug", () => {
    const doc = base();
    expect(model(doc)).toMatchObject({ slug: "pai-paranaense", active: false, version: 1, previewMode: "mockupWithTextSummary", source: SUL_COLLECTION });
    expect(applyOp(start("norte"), { type: "create-customizer", name: "X", source: SUL_COLLECTION }, ctx()).ok).toBe(false); // Sul's collection in Norte
  });

  test("given a model, when fields and a line group are configured, then limits are enforced: up to 10 fields, min ≤ initial ≤ max, an active model needs its mockup", () => {
    let doc = base();
    const field = (i: number) => ({ key: `campo_${i}`, label: `Campo ${i}`, required: false, maxLength: 20, position: i, type: "text" as const });
    doc = run(doc, { type: "update-customizer", id: model(doc).id, patch: { fields: Array.from({ length: 10 }, (_, i) => field(i)) } }).doc;
    expect(applyOp(doc, { type: "update-customizer", id: model(doc).id, patch: { fields: Array.from({ length: 11 }, (_, i) => field(i)) } }, ctx()).ok).toBe(false);
    const group = { key: "linhas", label: "Linhas", lineLabel: "Linha {n}", min: 1, initial: 4, max: 6, maxLength: 18 };
    expect(applyOp(doc, { type: "update-customizer", id: model(doc).id, patch: { lineGroup: group } }, ctx()).ok).toBe(true); // the group key is distinct from campo_*
  });

  test("given valid configuration, when the group is 4 initial up to 6, then it is stored; bad ranges and duplicate keys are refused", () => {
    let doc = base();
    const group = { key: "linhas", label: "Linhas", lineLabel: "Linha {n}", min: 1, initial: 4, max: 6, maxLength: 18 };
    doc = run(doc, { type: "update-customizer", id: model(doc).id, patch: { lineGroup: group } }).doc;
    expect(model(doc).lineGroup).toMatchObject({ initial: 4, max: 6 });
    for (const bad of [{ ...group, initial: 7 }, { ...group, min: 5, initial: 4 }, { ...group, max: 11 }, { ...group, maxLength: 0 }]) expect(applyOp(doc, { type: "update-customizer", id: model(doc).id, patch: { lineGroup: bad } }, ctx()).ok).toBe(false);
    const dup = applyOp(doc, { type: "update-customizer", id: model(doc).id, patch: { fields: [{ key: "linhas", label: "x", required: false, maxLength: 10, position: 1, type: "text" }] } }, ctx());
    expect(dup.ok).toBe(false);
    expect(applyOp(doc, { type: "update-customizer", id: model(doc).id, patch: { active: true } }, ctx()).ok).toBe(false); // no mockup
    expect(applyOp(doc, { type: "update-customizer", id: model(doc).id, patch: { active: true, pageMockup: PIC } }, ctx()).ok).toBe(true);
  });

  test("given a model used as a carousel's first card, when removed, then it is refused and names the section; otherwise it can be removed or duplicated", () => {
    let doc = base();
    doc = run(doc, { type: "update-customizer", id: model(doc).id, patch: { active: true, pageMockup: PIC } }).doc;
    const carousel = doc.home!.sections.find((s) => s.template === "product-carousel")!;
    doc = run(doc, { type: "update", id: carousel.id, patch: { customizerCard: { customizerId: model(doc).id, title: "Personalize a sua", button: "Personalizar" } } }).doc;
    const refused = applyOp(doc, { type: "remove-customizer", id: model(doc).id }, ctx());
    expect(!refused.ok && refused.errors[0]).toContain(carousel.title!);
    const copy = run(doc, { type: "duplicate-customizer", id: model(doc).id }).doc;
    expect(copy.customizers).toHaveLength(2);
    expect(copy.customizers![1]).toMatchObject({ active: false, version: 1, slug: "pai-paranaense-copia" });
  });

  test("given a card that refers to a model that does not exist, or a non-carousel with a card, when validated, then both are refused", () => {
    const doc = start();
    const carousel = doc.home!.sections.find((s) => s.template === "product-carousel")!;
    carousel.customizerCard = { customizerId: "cz-nope", title: "x", button: "y" };
    expect(validateScopeDoc(doc).ok).toBe(false);
    expect(validateSection({ ...doc.home!.sections[0], customizerCard: { customizerId: "cz-a", title: "x", button: "y" } }).ok).toBe(false);
    expect(validateCustomizer({ ...structuredClone(base().customizers![0]), inkProductId: "abc" }, "sul").ok).toBe(false);
  });
});

/** A minimal in-memory release ledger (the real adapters have their own tests). */
function ledger(initial: PublishedBundle) {
  const bundles = new Map<string, PublishedBundle>([["1", { ...initial, releaseId: "1" }]]);
  let head = "1";
  const deps: PublishDeps = {
    actorId: null,
    media: async () => ({}),
    files: { writeAtomic: async () => undefined, readState: async () => ({ kind: "valid", releaseId: head, checksum: "x" }), read: async () => null } as never,
    releases: {
      head: async () => ({ record: { id: head, checksum: "x", status: "live", createdAt: 0 }, bundle: bundles.get(head)! }),
      restorable: async (id: string) => bundles.get(id) ?? null,
      begin: async (_r: unknown, compose: (id: string) => Promise<PublishedBundle>) => {
        const id = String(bundles.size + 1);
        const bundle = await compose(id);
        bundles.set(id, bundle);
        return { release: { id, checksum: "x", status: "pending", createdAt: 1 }, bundle };
      },
      markLive: async (id: string) => { head = id; },
      markFailed: async () => undefined,
      markRevalidated: async () => undefined,
    } as never,
  };
  return { deps, head: () => bundles.get(head)!, at: (id: string) => bundles.get(id)! };
}
const noop = async () => undefined;

describe("publishing a page, a model or the region are independent", () => {
  const draftWithPage = () => {
    let doc = run(start(), { type: "create-page", kind: "hotpage", title: "Dia dos Pais" }).doc;
    doc = run(doc, { type: "in-page", page: doc.pages![0].id, op: { type: "add-carousel", title: "Churrasqueiros", source: { kind: "ink-category", ...SUL_COLLECTION, order: "category", limit: 6 } } }).doc;
    return doc;
  };

  test("given a draft page and a changed home, when only the page is published, then the published home is untouched and the page arrives with version 1", async () => {
    const world = ledger(seed);
    const doc = draftWithPage();
    doc.home!.sections[1].title = "Título só no rascunho";
    const homeBefore = JSON.stringify(world.head().docs.sul.home);
    const r = await publishRelease(world.deps, { kind: "publish", doc, target: { kind: "page", id: doc.pages![0].id } }, noop);
    expect(r.ok).toBe(true);
    const now = world.head().docs.sul;
    expect(JSON.stringify(now.home)).toBe(homeBefore);
    expect(now.pages).toHaveLength(1);
    expect(now.pages![0]).toMatchObject({ slug: "dia-dos-pais", version: 1 });
    expect(world.head().docs.norte).toEqual(seed.docs.norte);
  });

  test("given a draft page, when the HOME is published, then the draft page is not published (new pages never go live by accident)", async () => {
    const world = ledger(seed);
    const doc = draftWithPage();
    doc.home!.sections[1].title = "Home nova";
    expect((await publishRelease(world.deps, { kind: "publish", doc }, noop)).ok).toBe(true);
    expect(world.head().docs.sul.pages).toBeUndefined();
    expect(world.head().docs.sul.home!.sections[1].title).toBe("Home nova");
  });

  test("given a published page, when it is edited and republished, then its version increases and only that page changes; the release is marked for the page", async () => {
    const world = ledger(seed);
    let doc = draftWithPage();
    const id = doc.pages![0].id;
    await publishRelease(world.deps, { kind: "publish", doc, target: { kind: "page", id } }, noop);
    doc = run(doc, { type: "update-page", id, patch: { title: "Dia dos Pais 2026" } }).doc;
    await publishRelease(world.deps, { kind: "publish", doc, target: { kind: "page", id } }, noop);
    expect(world.head().docs.sul.pages![0]).toMatchObject({ title: "Dia dos Pais 2026", version: 2 });
    expect(targetMarker(world.head().docs.sul, { kind: "page", id })).toEqual(["page:hotpage/dia-dos-pais"]);
  });

  test("given a page published twice, when the first version is restored, then only that page comes back; the home changed in between stays as it is", async () => {
    const world = ledger(seed);
    let doc = draftWithPage();
    const id = doc.pages![0].id;
    await publishRelease(world.deps, { kind: "publish", doc, note: "v1", target: { kind: "page", id } }, noop); // release 2
    doc = run(doc, { type: "update-page", id, patch: { title: "Segunda" } }).doc;
    await publishRelease(world.deps, { kind: "publish", doc, target: { kind: "page", id } }, noop); // release 3
    const homeDoc = structuredClone(world.head().docs.sul);
    homeDoc.home!.sections[1].title = "Home mudou depois";
    await publishRelease(world.deps, { kind: "publish", doc: homeDoc }, noop); // release 4: home only
    expect(world.head().docs.sul.pages![0].title).toBe("Segunda"); // the home publish kept the published page
    const restored = await publishRelease(world.deps, { kind: "rollback", toReleaseId: "2", scope: "sul", target: { kind: "page", id } }, noop);
    expect(restored.ok).toBe(true);
    const now = world.head().docs.sul;
    expect(now.pages![0]).toMatchObject({ title: "Dia dos Pais", version: 3 });
    expect(now.home!.sections[1].title).toBe("Home mudou depois");
    expect((await publishRelease(world.deps, { kind: "rollback", toReleaseId: "1", scope: "sul", target: { kind: "page", id } }, noop)).ok).toBe(false); // release 1 had no such page
  });

  test("given the home restored to an old release, when done, then published pages and models are kept (they are restored on their own)", async () => {
    const world = ledger(seed);
    const doc = draftWithPage();
    const id = doc.pages![0].id;
    await publishRelease(world.deps, { kind: "publish", doc, target: { kind: "page", id } }, noop); // 2
    const restored = await publishRelease(world.deps, { kind: "rollback", toReleaseId: "1", scope: "sul" }, noop);
    expect(restored.ok).toBe(true);
    expect(world.head().docs.sul.pages).toHaveLength(1);
  });

  test("given links and cards, when checked against the composed document, then drafts, archived pages and unpublished models are flagged", () => {
    const composed = structuredClone(seed.docs.sul);
    const carousel = composed.home!.sections.find((s) => s.template === "product-carousel")!;
    carousel.cta = { label: "Ver", dest: { kind: "page", pageKind: "categoryLanding", slug: "pais" } };
    carousel.customizerCard = { customizerId: "cz-1", title: "Personalize", button: "Ir" };
    expect(linkProblems(composed, [carousel]).join(" ")).toMatch(/não existe ou ainda não foi publicada/);
    expect(linkProblems(composed, [carousel]).join(" ")).toMatch(/modelo de personalização.*ainda não foi publicado/);
    const page = run(start(), { type: "create-page", kind: "categoryLanding", title: "Pais" }).doc.pages![0];
    composed.pages = [{ ...page, archived: true }];
    expect(linkProblems(composed, [carousel]).join(" ")).toMatch(/arquivada/);
    composed.pages = [page];
    const m: Customizer = { id: "cz-1", slug: "pai", name: "Pai", source: SUL_COLLECTION, fields: [], previewMode: "mockupWithTextSummary", active: true, version: 1, pageMockup: PIC };
    composed.customizers = [m];
    expect(linkProblems(composed, [carousel]).join(" ")).toMatch(/precisa de uma imagem/);
    carousel.customizerCard!.image = PIC;
    expect(linkProblems(composed, [carousel])).toEqual([]);
    composed.customizers = [{ ...m, active: false }];
    expect(linkProblems(composed, [carousel]).join(" ")).toMatch(/desativado/);
  });

  test("given composeDoc, when the region target is used with published pages, then they are carried over untouched", () => {
    const published = { ...structuredClone(seed.docs.sul), pages: draftWithPage().pages };
    const draft = structuredClone(seed.docs.sul);
    draft.pages = [];
    const out = composeDoc(published, draft, { kind: "region" });
    expect(out.pages).toEqual(published.pages);
  });
});

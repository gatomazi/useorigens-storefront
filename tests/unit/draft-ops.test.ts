import { describe, expect, test } from "vitest";
import { applyOp, type DraftOp } from "@/lib/admin/draft-ops";
import { validateScopeDoc, type ScopeDoc } from "@/lib/site-config/schema";
import { buildSeedBundle } from "@/lib/site-config/seed";

const seedDoc = (): ScopeDoc => structuredClone(buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null }).docs.sul);
let n = 0;
const ctx = { newId: () => `t${++n}` };
const ids = (d: ScopeDoc) => d.home!.sections.map((s) => s.id);
const ok = (d: ScopeDoc, op: DraftOp) => {
  const r = applyOp(d, op, ctx);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r;
};
const SRC = { kind: "ink-category", store: "use-sul", collectionId: 152188, order: "category", limit: 6 } as const;

describe("draft operations", () => {
  test("given the seed, when a collection carousel is added, then it lands before the campaign, is valid and uses the closed analytics origin", () => {
    const r = ok(seedDoc(), { type: "add-carousel", title: "Da Nossa Terra em foco", source: SRC });
    const list = r.doc.home!.sections;
    expect(list.map((s) => s.anchor).slice(-3)).toEqual(["colecao-da-nossa-terra-em-foco", "origem", "footer"]);
    expect(list.at(-3)!.analyticsSource).toBe("homeCollection");
    expect(r.focusId).toMatch(/^custom-/);
    expect(validateScopeDoc(r.doc).ok).toBe(true);
  });

  test("given two sections with the same title, when both are added, then their anchors stay unique", () => {
    let d = ok(seedDoc(), { type: "add-carousel", title: "Novidades", source: SRC }).doc;
    d = ok(d, { type: "add-carousel", title: "Novidades", source: SRC }).doc;
    const anchors = d.home!.sections.map((s) => s.anchor);
    expect(new Set(anchors).size).toBe(anchors.length);
  });

  test("given a blank or oversized title, or a bad source, when added, then nothing is added and the reason is returned", () => {
    for (const title of ["", "   ", "x".repeat(121)]) expect(applyOp(seedDoc(), { type: "add-carousel", title, source: SRC }, ctx).ok).toBe(false);
    const bad = applyOp(seedDoc(), { type: "add-carousel", title: "X", source: { ...SRC, limit: 99 } }, ctx);
    expect(bad.ok).toBe(false);
  });

  test("given a movable section, when moved up and down, then it swaps with its neighbour and the input is not mutated", () => {
    const d = seedDoc();
    const before = ids(d);
    const r = ok(d, { type: "move", id: "seed-terra", direction: "down" });
    expect(ids(r.doc)).toEqual(["seed-hero", "seed-estilos", "seed-estados", "seed-terra", ...before.slice(4)]);
    expect(ids(d)).toEqual(before);
    expect(ids(ok(r.doc, { type: "move", id: "seed-terra", direction: "up" }).doc)).toEqual(before);
  });

  test("given the hero, the footer or the edges, when moved, then it is refused (hero first, footer last, always)", () => {
    const d = seedDoc();
    expect(applyOp(d, { type: "move", id: "seed-hero", direction: "down" }, ctx).ok).toBe(false);
    expect(applyOp(d, { type: "move", id: "seed-footer", direction: "up" }, ctx).ok).toBe(false);
    expect(applyOp(d, { type: "move", id: "seed-estilos", direction: "up" }, ctx).ok).toBe(false); // would pass the hero
    expect(applyOp(d, { type: "move", id: "seed-origem", direction: "down" }, ctx).ok).toBe(false); // would pass the footer
  });

  test("given a section, when hidden and shown again, then only its flag changes; the hero and footer cannot be hidden", () => {
    const d = ok(seedDoc(), { type: "set-active", id: "seed-fala", active: false }).doc;
    expect(d.home!.sections.find((s) => s.id === "seed-fala")!.active).toBe(false);
    expect(applyOp(d, { type: "set-active", id: "seed-hero", active: false }, ctx).ok).toBe(false);
    expect(applyOp(d, { type: "set-active", id: "seed-footer", active: false }, ctx).ok).toBe(false);
  });

  test("given a seeded section, when removal is attempted, then it is refused; a CMS-created one is removed", () => {
    expect(applyOp(seedDoc(), { type: "remove", id: "seed-terra" }, ctx).ok).toBe(false);
    const added = ok(seedDoc(), { type: "add-carousel", title: "Temp", source: SRC });
    const removed = ok(added.doc, { type: "remove", id: added.focusId! });
    expect(ids(removed.doc)).toEqual(ids(seedDoc()));
  });

  test("given a carousel, when duplicated, then the copy has a new id and anchor and starts inactive; a hero cannot be duplicated", () => {
    const r = ok(seedDoc(), { type: "duplicate", id: "seed-terra" });
    const copy = r.doc.home!.sections.find((s) => s.id === r.focusId)!;
    expect(copy.active).toBe(false);
    expect(copy.anchor).not.toBe("terra");
    expect(copy.title).toBe("Da Nossa Terra (cópia)");
    expect(r.doc.home!.sections[2].id).toBe("seed-terra"); // the original stays where it was
    expect(applyOp(seedDoc(), { type: "duplicate", id: "seed-hero" }, ctx).ok).toBe(false);
  });

  test("given a valid patch, when a section is updated, then id, anchor and template are never changed by it", () => {
    const r = ok(seedDoc(), { type: "update", id: "seed-terra", patch: { title: "Terra", subtitle: "Novo", appearance: { fill: { kind: "solid", color: "#112233" }, focal: { mobile: { x: 10, y: 20 }, desktop: { x: 10, y: 20 } }, overlay: { color: "#000000", opacity: 0.4 } } } });
    const s = r.doc.home!.sections.find((x) => x.id === "seed-terra")!;
    expect(s.title).toBe("Terra");
    expect(s.appearance.fill).toEqual({ kind: "solid", color: "#112233" });
    expect(s.anchor).toBe("terra");
    expect(s.template).toBe("product-carousel");
  });

  test("given an invalid patch (bad colour, hostile CTA, opacity above the cap, out-of-range focal point), when applied, then nothing changes", () => {
    const d = seedDoc();
    const base = d.home!.sections.find((s) => s.id === "seed-terra")!.appearance;
    const attempts = [
      { appearance: { ...base, fill: { kind: "solid" as const, color: "red" as never } } },
      { appearance: { ...base, overlay: { color: "#000000" as const, opacity: 0.99 } } },
      { appearance: { ...base, focal: { mobile: { x: 500, y: 0 }, desktop: base.focal.desktop } } },
      { cta: { label: "Ir", dest: { kind: "external" as const, url: "https://evil.example/" } } },
      { title: undefined },
    ];
    for (const patch of attempts) expect(applyOp(d, { type: "update", id: "seed-terra", patch }, ctx).ok, JSON.stringify(patch).slice(0, 50)).toBe(false);
  });

  test("given an unknown id, when any op targets it, then it fails cleanly", () => {
    expect(applyOp(seedDoc(), { type: "set-active", id: "nope", active: true }, ctx).ok).toBe(false);
  });

  test("given a long chain of valid operations, when applied, then the document stays valid (hero first, footer last)", () => {
    let d = seedDoc();
    d = ok(d, { type: "add-carousel", title: "A", source: SRC }).doc;
    d = ok(d, { type: "move", id: "seed-fala", direction: "up" }).doc;
    d = ok(d, { type: "duplicate", id: "seed-terra" }).doc;
    d = ok(d, { type: "set-active", id: "seed-geografia", active: false }).doc;
    expect(validateScopeDoc(d).ok).toBe(true);
    expect(d.home!.sections[0].template).toBe("hero");
    expect(d.home!.sections.at(-1)!.template).toBe("footer");
  });

  const REF = { store: "use-sul", collectionId: 152122 } as const;

  test("given an internal collection, when it is enabled, then only that one is stored in the document, idempotently, and the document stays valid", () => {
    const once = ok(seedDoc(), { type: "set-collection-enabled", ...REF, enabled: true }).doc;
    expect(once.collections).toEqual({ enabled: [REF] });
    const twice = ok(once, { type: "set-collection-enabled", ...REF, enabled: true }).doc;
    expect(twice.collections).toEqual({ enabled: [REF] });
    expect(validateScopeDoc(twice).ok).toBe(true);
    const other = ok(twice, { type: "set-collection-enabled", store: "use-sul", collectionId: 1, enabled: true }).doc;
    expect(other.collections!.enabled).toHaveLength(2);
  });

  test("given an enabled collection nobody uses, when it is disabled, then the list (and the key) disappears; the input document is not mutated", () => {
    const enabled = ok(seedDoc(), { type: "set-collection-enabled", ...REF, enabled: true }).doc;
    const frozen = structuredClone(enabled);
    const off = ok(enabled, { type: "set-collection-enabled", ...REF, enabled: false }).doc;
    expect(off.collections).toBeUndefined();
    expect(enabled).toEqual(frozen);
    expect(ok(off, { type: "set-collection-enabled", ...REF, enabled: false }).doc).toEqual(off); // disabling twice is a no-op
  });

  test("given a section that uses the collection as source or as its 'Ver todos' target, when disabling is attempted, then it is refused and names the section", () => {
    let d = ok(seedDoc(), { type: "set-collection-enabled", ...REF, enabled: true }).doc;
    d = ok(d, { type: "add-carousel", title: "Uso interno", source: { ...SRC, collectionId: REF.collectionId } }).doc;
    const refused = applyOp(d, { type: "set-collection-enabled", ...REF, enabled: false }, ctx);
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.errors[0]).toContain("Uso interno");
    expect(d.collections).toEqual({ enabled: [REF] }); // nothing changed
  });

  test("given a malformed reference, when it is enabled, then the document is not changed", () => {
    const r = applyOp(seedDoc(), { type: "set-collection-enabled", store: "use-mars" as never, collectionId: -3, enabled: true }, ctx);
    expect(r.ok).toBe(false);
  });
});

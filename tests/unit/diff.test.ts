import { describe, expect, test } from "vitest";
import { applyOp } from "@/lib/admin/draft-ops";
import { diffDocs } from "@/lib/admin/diff";
import { buildSeedBundle } from "@/lib/site-config/seed";
import type { ScopeDoc } from "@/lib/site-config/schema";

const seed = (): ScopeDoc => structuredClone(buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null }).docs.sul);
const ctx = { newId: () => "x1" };
const op = (d: ScopeDoc, o: Parameters<typeof applyOp>[1]) => {
  const r = applyOp(d, o, ctx);
  if (!r.ok) throw new Error(r.errors.join());
  return r.doc;
};

describe("document diff", () => {
  test("given identical documents, when diffed, then there are no changes", () => {
    expect(diffDocs(seed(), seed())).toEqual([]);
  });

  test("given added, hidden, moved and edited sections, when diffed, then each is reported once, in plain Portuguese", () => {
    let d = seed();
    d = op(d, { type: "add-carousel", title: "Nova coleção", source: { kind: "ink-category", store: "use-sul", collectionId: 152188, order: "category", limit: 6 } });
    d = op(d, { type: "set-active", id: "seed-fala", active: false });
    d = op(d, { type: "update", id: "seed-terra", patch: { title: "Da Nossa Terra!" } });
    d = op(d, { type: "move", id: "seed-redesenhos", direction: "up" });
    const texts = diffDocs(seed(), d).map((c) => c.text);
    expect(texts).toContain('Nova seção "Nova coleção"');
    expect(texts).toContain('"Fala daqui" foi ocultada');
    expect(texts).toContain('"Da Nossa Terra!": título');
    expect(texts.some((t) => t.includes("mudou de posição"))).toBe(true);
  });

  test("given a removed CMS section, when diffed against a document that had it, then it is reported as removed", () => {
    const withOne = op(seed(), { type: "add-carousel", title: "Temp", source: { kind: "ink-category", store: "use-sul", collectionId: 1, order: "category", limit: 6 } });
    expect(diffDocs(withOne, seed()).map((c) => c.kind)).toEqual(["removed"]);
  });
});

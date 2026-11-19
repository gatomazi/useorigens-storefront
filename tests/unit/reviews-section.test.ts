import { describe, expect, test } from "vitest";
import { applyOp, type DraftOp } from "@/lib/admin/draft-ops";
import { seedForEnv } from "@/lib/admin/publishing";
import { suggestedNavLabel } from "@/lib/site-config/nav";
import { validateScopeDoc, validateSection, type ScopeDoc } from "@/lib/site-config/schema";
import { SINGLETON_TEMPLATES, STRUCTURED_MODELS, STRUCTURED_TEMPLATES, structuredDefaults } from "@/lib/site-config/structured";

let n = 0;
const ctx = () => ({ newId: () => `r${++n}` });
const seed = seedForEnv();
const start = (scope: "sul" | "norte" | "centro-oeste" = "sul"): ScopeDoc => structuredClone(seed.docs[scope]);
const run = (doc: ScopeDoc, op: DraftOp): ScopeDoc => {
  const r = applyOp(doc, op, ctx());
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.doc;
};
const templates = (doc: ScopeDoc) => doc.home!.sections.map((s) => s.template);

describe("the reviews as a section of the panel", () => {
  test("is a model the panel offers, once per region", () => {
    expect(STRUCTURED_TEMPLATES).toContain("reviews");
    expect(SINGLETON_TEMPLATES).toContain("reviews");
    expect(STRUCTURED_MODELS.find((m) => m.template === "reviews")?.name).toBe("Avaliações de clientes");
  });

  test.each(["sul", "norte", "centro-oeste"] as const)("a new one in %s validates and starts with the photo strip's own words, naming no region", (region) => {
    const s = structuredDefaults("reviews", region, "custom-r", new Set());
    expect(validateSection(s).ok).toBe(true);
    expect([s.anchor, s.headingId, s.active, s.title, s.subtitle]).toEqual(["avaliacoes", "avaliacoes-title", true, "Quem usa, recomenda!", "Fotos enviadas por quem já vestiu."]);
    expect(structuredDefaults("reviews", region, "custom-r2", new Set(["avaliacoes"])).anchor).toBe("avaliacoes-2");
  });

  test("added to the Sul home it lands right before the closing campaign, as on the original home, and the document stays valid", () => {
    const before = templates(start());
    const doc = run(start(), { type: "add-structured", template: "reviews" });
    const after = templates(doc);
    expect(after.filter((t) => t === "reviews")).toHaveLength(1);
    const at = after.indexOf("reviews");
    expect(after.slice(at + 1)).toEqual(["campaign", "footer"]);
    expect(after.filter((t) => t !== "reviews")).toEqual(before);
    expect(validateScopeDoc(doc).ok).toBe(true);
  });

  test("a second one in the same region is refused: the existing one is edited", () => {
    const doc = run(start(), { type: "add-structured", template: "reviews" });
    const again = applyOp(doc, { type: "add-structured", template: "reviews" }, ctx());
    expect(again.ok).toBe(false);
    expect(JSON.stringify(again)).toMatch(/already has this section/);
  });

  test.each(["norte", "centro-oeste"] as const)("%s can have it too (its own home, from hero and footer)", (scope) => {
    const sul = start("sul").home!.sections;
    const bare: ScopeDoc = { ...start(scope), home: { sections: [structuredClone(sul[0]), structuredClone(sul[sul.length - 1])] } };
    const doc = run(bare, { type: "add-structured", template: "reviews" });
    expect(templates(doc)).toEqual(["hero", "reviews", "footer"]);
    expect(validateScopeDoc(doc).ok).toBe(true);
  });

  test("it belongs to the home: a page refuses it (the operation and the schema)", () => {
    let doc = run(start(), { type: "create-page", kind: "hotpage", title: "Pais" });
    const page = doc.pages![0];
    const refused = applyOp(doc, { type: "in-page", page: page.id, op: { type: "add-structured", template: "reviews" } }, ctx());
    expect(refused.ok).toBe(false);
    // and a document that smuggles one into a page is not valid
    const forced = structuredClone(doc);
    forced.pages![0].sections.push(structuredDefaults("reviews", "sul", "custom-x", new Set(forced.pages![0].sections.map((s) => s.anchor))));
    expect(validateScopeDoc(forced).ok).toBe(false);
    doc = forced;
    expect(doc.pages![0].sections.some((s) => s.template === "reviews")).toBe(true);
  });

  test("its default entry in the header menu is 'Avaliações'", () => {
    const s = structuredDefaults("reviews", "sul", "custom-r", new Set());
    expect(suggestedNavLabel(s)).toBe("Avaliações");
  });
});

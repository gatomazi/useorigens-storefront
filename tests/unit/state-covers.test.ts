import { describe, expect, test } from "vitest";
import { applyOp } from "@/lib/admin/draft-ops";
import { composeBundle, seedForEnv } from "@/lib/admin/publishing";
import { parseSectionForm } from "@/lib/admin/section-form";
import { resolveStateCovers } from "@/lib/site-config/resolve";
import { sanitizeBundle } from "@/lib/site-config/sanitize";
import { validateBundle, validateSection, type Section } from "@/lib/site-config/schema";
import { structuredDefaults } from "@/lib/site-config/structured";

const ctx = { newId: () => "n1" };
const form = (o: Record<string, string>) => ({ get: (k: string) => (k in o ? o[k] : null) });
const seed = seedForEnv();
const home = () => {
  const s = seed.docs.sul.home!.sections;
  return { ...structuredClone(seed.docs.norte), home: { sections: [structuredClone(s[0]), structuredDefaults("states", "norte", "custom-e", new Set()), structuredClone(s[s.length - 1])] } };
};
const PIC = "legacy:sul/fala-daqui-desktop";

describe("per-state covers in the state chooser", () => {
  test("given a region, when a cover is set for one of its states, then it is stored as a media reference (no copy of the picture)", () => {
    const doc = home();
    const states = doc.home.sections[1];
    const patch = parseSectionForm(form({ state_covers_present: "1", state_cover_PA: PIC, state_alt_PA: "Rio Amazonas", state_cover_AM: PIC }), states);
    const r = applyOp(doc, { type: "update", id: states.id, patch }, ctx);
    expect(r.ok && r.doc.home!.sections[1].stateCovers).toEqual({ PA: { assetId: PIC, alt: "Rio Amazonas", decorative: false }, AM: { assetId: PIC, alt: "", decorative: true } });
  });

  test("given an empty choice for every state, when saved, then the covers are cleared", () => {
    const doc = home();
    const states = doc.home.sections[1];
    const withOne = applyOp(doc, { type: "update", id: states.id, patch: { stateCovers: { PA: { assetId: PIC, alt: "", decorative: true } } } }, ctx) as { ok: true; doc: typeof doc };
    const patch = parseSectionForm(form({ state_covers_present: "1", state_cover_PA: "" }), withOne.doc.home.sections[1]);
    const cleared = applyOp(withOne.doc, { type: "update", id: states.id, patch }, ctx);
    expect(cleared.ok && cleared.doc.home!.sections[1].stateCovers).toBeUndefined();
  });

  test("given a state of another region, a malformed key, a bad reference, or a section that is not the state chooser, when saved, then it is rejected", () => {
    const doc = home();
    const states = doc.home.sections[1];
    const save = (stateCovers: unknown) => applyOp(doc, { type: "update", id: states.id, patch: { stateCovers: stateCovers as never } }, ctx);
    expect(save({ SC: { assetId: PIC, alt: "", decorative: true } }).ok).toBe(false); // Santa Catarina is not in Norte
    expect(save({ pa: { assetId: PIC, alt: "", decorative: true } }).ok).toBe(false);
    expect(save({ PA: { assetId: "../x", alt: "", decorative: true } }).ok).toBe(false);
    expect(save({ PA: { assetId: PIC, alt: "", decorative: false } }).ok).toBe(false); // meaningful image without a description
    expect(validateSection({ ...seed.docs.sul.home!.sections[0], stateCovers: {} }).ok).toBe(false);
  });

  test("given a cover whose image is missing from the media table, when the bundle is validated, then it is refused; the tolerant reader drops just that cover", () => {
    const bundle = structuredClone(seed);
    bundle.docs.norte = { ...home(), tracking: bundle.docs.norte.tracking };
    (bundle.docs.norte.home!.sections[1] as Section).stateCovers = { PA: { assetId: "upload:01J0000000000000000000ZZZZ", alt: "", decorative: true } };
    expect(validateBundle(bundle).ok).toBe(false);
    const sanitized = sanitizeBundle(bundle, seed);
    expect(sanitized.diagnostics.join(" ")).toContain("cover of PA");
  });

  test("given a published cover, when resolved for rendering, then it becomes one picture for both breakpoints with its description; unknown media is skipped", () => {
    const section = { ...structuredDefaults("states", "norte", "custom-e", new Set()), stateCovers: { PA: { assetId: "a", alt: "Rio", decorative: false }, AM: { assetId: "missing", alt: "", decorative: true } } };
    const media = { a: { src: "/media/x/1080.webp", width: 1080, height: 720, variants: [{ w: 640, src: "/media/x/640.webp" }] } };
    const covers = resolveStateCovers(section, media);
    expect(Object.keys(covers)).toEqual(["PA"]);
    expect(covers.PA.mobile).toBe(covers.PA.desktop);
    expect(covers.PA).toMatchObject({ alt: "Rio", mobile: { src: "/media/x/1080.webp", variants: [{ w: 640, src: "/media/x/640.webp" }] } });
  });

  test("given a draft with covers, when the bundle is composed, then the cover pictures are requested from the media resolver (so they reach the published table)", async () => {
    const doc = home();
    doc.home.sections[1].stateCovers = { PA: { assetId: PIC, alt: "", decorative: true } };
    let asked: string[] = [];
    await composeBundle({ releases: { head: async () => null } as never, media: async (ids) => { asked = [...ids]; return {}; } }, doc, "preview");
    expect(asked).toContain(PIC);
  });
});

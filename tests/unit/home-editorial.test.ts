import { describe, expect, test } from "vitest";
import { applyOp } from "@/lib/admin/draft-ops";
import { diffDocs } from "@/lib/admin/diff";
import { parseGridTiles, parseSectionForm } from "@/lib/admin/section-form";
import { CARD_BUY_STYLE_NAME, postedBuyStyle, validateCards } from "@/lib/site-config/cards-schema";
import { navData } from "@/lib/site-config/navigation";
import { mediaRefsOfDoc, validateScopeDoc, validateSection, type GridTile, type ScopeDoc, type Section } from "@/lib/site-config/schema";
import { buildSeedBundle } from "@/lib/site-config/seed";
import { structuredDefaults } from "@/lib/site-config/structured";
import { collectionProblems } from "@/lib/admin/validate-draft";
import { linkProblems } from "@/lib/admin/publishing";
import { customizerFigure } from "@/lib/site-config/resolve";
import { destinationHref } from "@/lib/site-config/sources";

/** The editorial home (CLAUDE_REFINAMENTO_HOME_MENU_USE_ORIGENS): compositions per section, collection cards A/B, the written card call, menu details. */

const seed = buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null });
const form = (o: Record<string, string>) => ({ get: (k: string) => (k in o ? o[k] : null) });
const sul = (): ScopeDoc => structuredClone(seed.docs.sul);
const section = (template: Section["template"]) => sul().home!.sections.find((s) => s.template === template)!;
const grid = (tiles: GridTile[]): Section => ({ ...structuredDefaults("image-grid", "sul", "custom-g", new Set()), tiles });
const terra = { kind: "collection-page", store: "use-sul", collectionId: 152188 } as const;
const tile = (over: Partial<GridTile> = {}): GridTile => ({ label: "Da Nossa Terra", dest: terra, ...over });

describe("section compositions (variant)", () => {
  test("given each template's own composition, when validated, then it passes; absent stays the original look", () => {
    expect(validateSection({ ...section("hero"), variant: "feature" }).ok).toBe(true);
    expect(validateSection({ ...section("states"), variant: "strip" }).ok).toBe(true);
    expect(validateSection({ ...section("city-styles"), variant: "split" }).ok).toBe(true);
    expect(validateSection({ ...section("city-styles"), variant: "list", count: 8 }).ok).toBe(true);
    expect(validateSection({ ...section("campaign"), variant: "split" }).ok).toBe(true);
    expect(validateSection(section("hero")).ok).toBe(true);
  });

  test("given a composition of another template or an unknown one, when validated, then it is rejected", () => {
    expect(validateSection({ ...section("hero"), variant: "strip" } as Section).ok).toBe(false);
    expect(validateSection({ ...section("states"), variant: "feature" } as Section).ok).toBe(false);
    expect(validateSection({ ...section("hero"), variant: "list" } as Section).ok).toBe(false);
    expect(validateSection({ ...section("product-carousel"), variant: "split" } as Section).ok).toBe(false);
    expect(validateSection({ ...section("campaign"), variant: "mosaic" } as never).ok).toBe(false);
  });

  test("given the editor's radio, when parsed, then the template's composition is kept and anything else clears it", () => {
    const hero = section("hero");
    expect(parseSectionForm(form({ variant_present: "1", variant: "feature" }), hero).variant).toBe("feature");
    expect(parseSectionForm(form({ variant_present: "1", variant: "" }), { ...hero, variant: "feature" })).toHaveProperty("variant", undefined);
    expect(parseSectionForm(form({ variant_present: "1", variant: "strip" }), hero).variant).toBeUndefined();
    // A form without the block leaves the saved composition alone.
    expect(parseSectionForm(form({ title: "x" }), { ...hero, variant: "feature" })).not.toHaveProperty("variant");
  });

  test("given a composition change in the draft, when the publish screen describes it, then it names the field", () => {
    const published = sul();
    const draft = sul();
    draft.home!.sections = draft.home!.sections.map((s) => (s.template === "states" ? { ...s, variant: "strip" } : s));
    const texts = diffDocs(published, draft).map((c) => c.text).join(" | ");
    expect(texts).toContain("composição");
  });
});

describe("collection cards: format A (product) and B (banner)", () => {
  test("given a product card leading to a collection and a banner with its own phone crop and framing, when validated, then both pass and both pictures are published", () => {
    const s = grid([
      tile({ format: "product", color: "#dfe3d3", cta: "Ver coleção" }),
      tile({
        label: "Fala Daqui",
        format: "banner",
        image: { assetId: "legacy:sul/fala-daqui-mobile", alt: "", decorative: true },
        imageMobile: { assetId: "legacy:sul/fala-daqui-desktop", alt: "", decorative: true },
        focal: { mobile: { x: 60, y: 45 }, desktop: { x: 60, y: 40 } },
        tone: "light",
      }),
    ]);
    expect(validateSection(s).ok).toBe(true);
    const doc = sul();
    doc.home!.sections.splice(1, 0, s);
    expect(mediaRefsOfDoc(doc).map((r) => r.assetId)).toEqual(expect.arrayContaining(["legacy:sul/fala-daqui-mobile", "legacy:sul/fala-daqui-desktop"]));
  });

  test("given a product card that does not lead to a collection, when validated, then it is rejected (its shirt comes from the collection)", () => {
    expect(validateSection(grid([tile({ format: "product", dest: { kind: "route", path: "/sul/busca" } }), tile()])).ok).toBe(false);
  });

  test("given banner-only fields on another tile, or a bad colour, tone or call, when validated, then each is rejected", () => {
    const bad: Partial<GridTile>[] = [
      { imageMobile: { assetId: "legacy:sul/ddd-mobile", alt: "", decorative: true } },
      { format: "product", focal: { mobile: { x: 1, y: 1 }, desktop: { x: 1, y: 1 } } },
      { color: "#dfe3d3" }, // a classic tile has no colour of its own
      { format: "product", color: "verde" as never },
      { format: "banner", tone: "medium" as never },
      { format: "banner", cta: " Ver " },
      { format: "banner", cta: "x".repeat(25) },
      { format: "poster" as never },
    ];
    for (const over of bad) expect(validateSection(grid([tile(over), tile()])).ok, JSON.stringify(over)).toBe(false);
  });

  test("given the editor's rows, when parsed, then format, colour, tone, call, phone crop and framing reach the tile", () => {
    const { tiles, problems } = parseGridTiles(
      form({
        tile_count: "2",
        tile_0_label: "Da Nossa Terra", tile_0_kind: "collection-page", tile_0_collection: "use-sul:152188", tile_0_format: "product", tile_0_color: "#DFE3D3", tile_0_tone: "", tile_0_cta: "Ver coleção",
        tile_1_label: "Fala Daqui", tile_1_kind: "collection-page", tile_1_collection: "use-sul:152079", tile_1_format: "banner", tile_1_image: "legacy:sul/fala-daqui-mobile", tile_1_image_mobile: "legacy:sul/fala-daqui-desktop", tile_1_alt: "Mesa com chimarrão diante do lago", tile_1_tone: "light", tile_1_fmx: "60", tile_1_fmy: "45", tile_1_fdx: "50", tile_1_fdy: "50",
      }),
    );
    expect(problems).toEqual([]);
    expect(tiles[0]).toMatchObject({ format: "product", color: "#dfe3d3", cta: "Ver coleção" });
    expect(tiles[0].tone).toBeUndefined(); // automatic
    expect(tiles[1]).toMatchObject({ format: "banner", tone: "light", image: { assetId: "legacy:sul/fala-daqui-mobile", alt: "Mesa com chimarrão diante do lago", decorative: false }, imageMobile: { assetId: "legacy:sul/fala-daqui-desktop" }, focal: { mobile: { x: 60, y: 45 }, desktop: { x: 50, y: 50 } } });
  });

  test("given a product row that leads to a page, when parsed, then the editor explains it in plain words", () => {
    const { problems } = parseGridTiles(form({ tile_count: "2", tile_0_label: "Camisetas", tile_0_kind: "route", tile_0_route: "/sul/busca", tile_0_format: "product", tile_1_label: "Canecas", tile_1_kind: "route", tile_1_route: "/sul/outros-artigos" }));
    expect(problems.join(" ")).toContain("precisa levar para uma coleção");
  });
});

describe("the written call of the product cards", () => {
  test("given the store-wide setting with the link style, when validated, then it passes and the panel names it", () => {
    expect(validateCards({ buyLabel: "Ver produto", buyStyle: "link" }, "global").ok).toBe(true);
    expect(CARD_BUY_STYLE_NAME.link).toBe("chamada ao lado do preço");
    expect(postedBuyStyle("link")).toBe("link");
    expect(postedBuyStyle("fab")).toBe("fab");
    expect(postedBuyStyle("button")).toBeUndefined(); // the default bar is never stored
  });

  test("given a product section with the link style, when the form is parsed and validated, then it is kept", () => {
    const carousel = section("product-carousel");
    const patch = parseSectionForm(form({ layout_buy_present: "1", layout_buy: "on", layout_buy_label: "Ver produto", layout_buy_style: "link", layout_variant: "standard", layout_tone: "light", layout_surface: "plain" }), carousel);
    expect(patch.layout).toMatchObject({ buyLabel: "Ver produto", buyStyle: "link" });
    expect(validateSection({ ...carousel, ...patch } as Section).ok).toBe(true);
  });
});

describe("collection descriptions in the menu", () => {
  test("given short one-line descriptions, when saved through the draft op, then they validate and replace the previous ones", () => {
    const ref = { store: "use-sul" as const, collectionId: 152188 };
    const r = applyOp(sul(), { type: "set-collection-descriptions", descriptions: [{ ...ref, text: "O estado inteiro numa camiseta" }] }, { newId: () => "x" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.collections?.descriptions).toEqual([{ ...ref, text: "O estado inteiro numa camiseta" }]);
    const cleared = applyOp(r.doc, { type: "set-collection-descriptions", descriptions: [] }, { newId: () => "x" });
    expect(cleared.ok && cleared.doc.collections?.descriptions).toBeUndefined();
  });

  test("given a description too long, on two lines or twice for one collection, when validated, then it is rejected", () => {
    const ref = { store: "use-sul" as const, collectionId: 152188 };
    for (const descriptions of [[{ ...ref, text: "x".repeat(81) }], [{ ...ref, text: "uma\nduas" }], [{ ...ref, text: "a" }, { ...ref, text: "b" }]]) {
      const doc = { ...sul(), collections: { enabled: [], descriptions } };
      expect(validateScopeDoc(doc).ok, JSON.stringify(descriptions)).toBe(false);
    }
  });
});

describe("the states in the menu", () => {
  test("given the number of places per state, when the menu data is built, then each state carries its UF and that line", () => {
    const data = navData({ region: "sul", doc: undefined, launched: ["sul"], coveredUfs: ["PR", "SC", "RS"], stateDetails: { PR: "399 cidades", SC: "295 cidades" } });
    expect(data.states.map((s) => [s.badge, s.label, s.detail])).toEqual([
      ["PR", "Paraná", "399 cidades"],
      ["SC", "Santa Catarina", "295 cidades"],
      ["RS", "Rio Grande do Sul", undefined],
    ]);
  });
});

describe("the publish screen", () => {
  test("given new descriptions in the draft, when the changes are listed, then each collection's description is named", () => {
    const published = sul();
    const draft = { ...sul(), collections: { enabled: [], descriptions: [{ store: "use-sul" as const, collectionId: 152188, text: "O estado inteiro numa camiseta" }] } };
    const texts = diffDocs(published, draft, () => "Da Nossa Terra").map((c) => c.text);
    expect(texts).toContain("\"Da Nossa Terra\": descrição no menu “O estado inteiro numa camiseta”");
  });
});

describe("the accent as text (the opening's last line, the states' UF)", () => {
  test("given a configured accent that reads on the page ground, when the theme becomes CSS, then it is also the accent ink", async () => {
    const { resolveTheme, themeCssVars } = await import("@/lib/site-config/navigation");
    const theme = resolveTheme("sul", { theme: { mode: "override", colors: { accent: "#b0472f", pageBackground: "#f7f3ec" } } }, undefined);
    expect(themeCssVars(theme.configured, theme.effective)["--region-accent-ink"]).toBe("#b0472f");
  });

  test("given an accent too light for text on the page (today's sand on a cream page), or no theme, when the theme becomes CSS, then there is no accent ink (the primary colour is used)", async () => {
    const { resolveTheme, themeCssVars } = await import("@/lib/site-config/navigation");
    const light = resolveTheme("sul", { theme: { mode: "override", colors: { accent: "#d6ba8d", pageBackground: "#f7f3ec" } } }, undefined);
    expect(themeCssVars(light.configured, light.effective)).not.toHaveProperty("--region-accent-ink");
    const none = resolveTheme("sul", undefined, undefined);
    expect(themeCssVars(none.configured, none.effective)).toEqual({});
  });
});

describe("a section that opens a personalisation model (Localidade)", () => {
  const LOCALIDADE = {
    id: "loc1", slug: "localidade", name: "Localidade", description: "Bairro, distrito ou comunidade: o nome do seu lugar na camiseta.",
    source: { store: "use-sul", collectionId: 1 }, fields: [], previewMode: "mockupWithTextSummary", active: true, version: 1,
    pageMockup: { assetId: "m1", alt: "Camiseta Localidade", decorative: false },
  } as unknown as NonNullable<ScopeDoc["customizers"]>[number];
  const withModel = (active = true): ScopeDoc => ({ ...sul(), customizers: [{ ...LOCALIDADE, active }] });
  const ctx = { newId: () => "p1" };

  test("given a button to a model, then it validates by the model's id; a malformed id is refused", () => {
    expect(validateSection({ ...section("campaign"), cta: { label: "Personalizar", dest: { kind: "customizer", customizerId: "loc1" } } }).ok).toBe(true);
    expect(validateSection({ ...section("campaign"), cta: { label: "Personalizar", dest: { kind: "customizer", customizerId: "../x" } } }).ok).toBe(false);
  });

  test("given a live model, then the button opens its page; switched off or missing, then no link at all", () => {
    const links = { customizerSlug: (id: string) => (id === "loc1" ? "localidade" : null) };
    expect(destinationHref({ kind: "customizer", customizerId: "loc1" }, links, "sul")).toBe("/sul/personalizar/localidade");
    expect(destinationHref({ kind: "customizer", customizerId: "outro" }, links, "sul")).toBeNull();
    expect(destinationHref({ kind: "customizer", customizerId: "loc1" }, links)).toBeNull();
  });

  test("given the shortcut, when a model is chosen, then a split campaign with its name, text and button is added before the footer", () => {
    const r = applyOp(withModel(), { type: "add-customizer-section", customizerId: "loc1" }, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const list = r.doc.home!.sections;
    const added = list.at(-2)!;
    expect(list.at(-1)!.template).toBe("footer");
    expect(added).toMatchObject({ template: "campaign", variant: "split", title: "Localidade", subtitle: LOCALIDADE.description, cta: { label: "Personalizar a minha", dest: { kind: "customizer", customizerId: "loc1" } } });
    const check = validateScopeDoc(r.doc);
    expect(check.ok ? [] : check.errors).toEqual([]);
    expect(applyOp(withModel(), { type: "add-customizer-section", customizerId: "nada" }, ctx).ok).toBe(false);
  });

  test("given a model switched off, then publishing is held with the reason", () => {
    const r = applyOp(withModel(), { type: "add-customizer-section", customizerId: "loc1" }, ctx);
    if (!r.ok) throw new Error(r.errors.join("; "));
    expect(collectionProblems(r.doc)).toEqual([]);
    const off = { ...r.doc, customizers: [{ ...LOCALIDADE, active: false }] };
    expect(collectionProblems(off).some((p) => p.includes("modelo de Personalização"))).toBe(true);
  });

  test("given a campaign without a picture of its own, then the model's picture stands beside the text", () => {
    const media = { m1: { src: "https://media.example/m1.webp", width: 1200, height: 1500 } } as never;
    expect(customizerFigure(withModel(), media, "loc1")).toMatchObject({ mobile: { src: "https://media.example/m1.webp" }, alt: "Camiseta Localidade" });
    expect(customizerFigure(withModel(false), media, "loc1")).toBeNull();
  });

  test("given the editor's fields, then the button to a model is read from cta_customizer", () => {
    const parsed = parseSectionForm(form({ cta_kind: "customizer", cta_customizer: "loc1", cta_label: "Personalizar" }) as never, section("campaign"));
    expect(parsed.cta).toEqual({ label: "Personalizar", dest: { kind: "customizer", customizerId: "loc1" } });
  });
});

describe("a personalisation model still opened by a section", () => {
  test("given a button to the model, when the owner removes the model, then it is refused with the section's name", () => {
    const doc: ScopeDoc = { ...structuredClone(seed.docs.sul), customizers: [{ id: "loc1", slug: "localidade", name: "Localidade", source: { store: "use-sul", collectionId: 1 }, fields: [], previewMode: "mockupWithTextSummary", active: false, version: 1 } as never] };
    const added = applyOp(doc, { type: "add-customizer-section", customizerId: "loc1" }, { newId: () => "p1" });
    if (!added.ok) throw new Error(added.errors.join("; "));
    const r = applyOp(added.doc, { type: "remove-customizer", id: "loc1" }, { newId: () => "x" });
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.errors.join(" ")).toContain("abre este modelo");
  });
});

describe("publishing a button to a personalisation model", () => {
  const model = { id: "loc1", slug: "localidade", name: "Localidade", source: { store: "use-sul", collectionId: 1 }, fields: [], previewMode: "mockupWithTextSummary", active: true, version: 1 } as never;
  const campaign = { ...structuredDefaults("campaign", "sul", "custom-c", new Set()), cta: { label: "Personalizar a minha", dest: { kind: "customizer" as const, customizerId: "loc1" } } };
  test("given the model only in the draft (models are published on their own), then the home publish is held until the model is published", () => {
    expect(linkProblems({ ...sul(), customizers: [] }, [campaign])[0]).toContain("ainda não foi publicado");
    expect(linkProblems({ ...sul(), customizers: [model] }, [campaign])).toEqual([]);
    expect(linkProblems({ ...sul(), customizers: [{ ...(model as object), active: false } as never] }, [campaign])[0]).toContain("desativado");
  });
});

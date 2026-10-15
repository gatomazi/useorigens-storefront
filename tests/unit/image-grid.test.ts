import { describe, expect, test } from "vitest";
import { applyOp } from "@/lib/admin/draft-ops";
import { linkProblems } from "@/lib/admin/publishing";
import { parseGridTiles, parseSectionForm } from "@/lib/admin/section-form";
import { mediaRefsOfDoc, validatePage, validateScopeDoc, validateSection, type GridTile, type ScopeDoc, type Section } from "@/lib/site-config/schema";
import { buildSeedBundle } from "@/lib/site-config/seed";
import { structuredDefaults } from "@/lib/site-config/structured";

const seed = buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null });
const form = (o: Record<string, string>) => ({ get: (k: string) => (k in o ? o[k] : null) });
const grid = (region: "sul" | "norte" = "sul", patch: Partial<Section> = {}): Section => ({ ...structuredDefaults("image-grid", region, "custom-g", new Set()), ...patch });
const tile = (over: Partial<GridTile> = {}): GridTile => ({ label: "Camisetas", dest: { kind: "route", path: "/sul/busca" }, ...over });
const withGrid = (doc: ScopeDoc, s: Section): ScopeDoc => {
  const sections = [...doc.home!.sections];
  sections.splice(sections.length - 1, 0, s);
  return { ...doc, home: { sections } };
};

describe("image grid in the schema", () => {
  test("given the defaults of each region, when validated, then they pass and every tile stays inside the region", () => {
    for (const region of ["sul", "norte", "centro-oeste"] as const) {
      const s = structuredDefaults("image-grid", region, "custom-g", new Set());
      expect(validateSection(s).ok).toBe(true);
      expect(s.tiles!.every((t) => t.dest.kind === "route" && t.dest.path.startsWith(`/${region}/`))).toBe(true);
    }
  });

  test("given a tile count outside 2..12, when validated, then it is rejected", () => {
    expect(validateSection(grid("sul", { tiles: [tile()] })).ok).toBe(false);
    expect(validateSection(grid("sul", { tiles: Array.from({ length: 13 }, () => tile()) })).ok).toBe(false);
    expect(validateSection(grid("sul", { tiles: Array.from({ length: 12 }, () => tile()) })).ok).toBe(true);
  });

  test("given tiles, a grid layout or no title on the wrong shape, when validated, then each is rejected", () => {
    expect(validateSection({ ...grid(), template: "campaign" }).ok).toBe(false); // tiles and grid belong to the grid only
    expect(validateSection(grid("sul", { title: undefined })).ok).toBe(false);
    expect(validateSection(grid("sul", { grid: { columns: 5, aspect: "square", labels: "below" } as never })).ok).toBe(false);
    expect(validateSection(grid("sul", { tiles: [tile({ label: "x".repeat(41) }), tile()] })).ok).toBe(false);
    expect(validateSection(grid("sul", { tiles: [tile({ dest: { kind: "external", url: "https://evil.example/" } }), tile()] })).ok).toBe(false);
  });

  test("given a tile picture, when validated and collected, then it follows the media rules and is part of what a publish resolves", () => {
    const pictured = grid("sul", { tiles: [tile({ image: { assetId: "01JTILE", alt: "", decorative: true } }), tile()] });
    expect(validateSection(pictured).ok).toBe(true);
    expect(validateSection(grid("sul", { tiles: [tile({ image: { assetId: "01JTILE", alt: "", decorative: false } }), tile()] })).ok).toBe(false);
    expect(mediaRefsOfDoc(withGrid(structuredClone(seed.docs.sul), pictured)).map((r) => r.assetId)).toContain("01JTILE");
  });

  test("given a Norte grid, when a tile opens a Sul collection or a Sul route, then the region rules reject it on the home and on a page", () => {
    const norte = structuredClone(seed.docs.norte);
    const sulCollection = grid("norte", { tiles: [tile({ dest: { kind: "ink-collection", store: "use-sul", collectionId: 1 } }), tile({ dest: { kind: "route", path: "/norte/busca" } })] });
    const sulRoute = grid("norte", { tiles: [tile({ dest: { kind: "route", path: "/sul/sc" } }), tile({ dest: { kind: "route", path: "/norte/busca" } })] });
    const home = (s: Section) => ({ ...norte, home: { sections: [...seed.docs.sul.home!.sections.slice(0, 1), s, ...seed.docs.sul.home!.sections.slice(-1)] } });
    expect(validateScopeDoc(home(sulCollection)).ok).toBe(false);
    expect(validateScopeDoc(home(sulRoute)).ok).toBe(false);
    expect(validateScopeDoc(home(grid("norte"))).ok).toBe(true);
    const page = (s: Section) => ({ id: "p1", kind: "hotpage", slug: "pecas", title: "Peças", seo: { indexable: true }, version: 1, sections: [{ id: "ph", anchor: "topo", headingId: "topo-title", template: "page-hero", active: true, title: "Peças", appearance: s.appearance }, s] });
    expect(validatePage(page(sulRoute), "norte").ok).toBe(false);
    expect(validatePage(page(grid("norte")), "norte").ok).toBe(true);
  });
});

describe("image grid in the editor", () => {
  test("given a region home, when the grid is added twice, then both copies land before the closing section and the doc stays valid", () => {
    let doc = structuredClone(seed.docs.sul);
    const before = doc.home!.sections.length;
    for (const id of ["a", "b"]) {
      const r = applyOp(doc, { type: "add-structured", template: "image-grid" }, { newId: () => id });
      expect(r.ok).toBe(true);
      doc = (r as { ok: true; doc: ScopeDoc }).doc;
    }
    const sections = doc.home!.sections;
    expect(sections).toHaveLength(before + 2);
    expect(sections.filter((s) => s.template === "image-grid").map((s) => s.anchor)).toEqual(["grade", "grade-2"]);
    expect(sections.at(-1)!.template).toBe("footer");
    expect(sections.at(-2)!.template).not.toBe("image-grid"); // the closing campaign stays the last block
    expect(validateScopeDoc(doc).ok).toBe(true);
  });

  test("given tile rows, when parsed, then empty rows are skipped, pictures are decorative and each destination kind is read", () => {
    const { tiles, problems } = parseGridTiles(form({
      tile_count: "4",
      tile_0_label: "Camisetas", tile_0_caption: "Da sua cidade", tile_0_image: "01JA", tile_0_kind: "ink-collection", tile_0_collection: "use-sul:152188",
      tile_1_label: "", tile_1_image: "", tile_1_kind: "route", tile_1_route: "/sul",
      tile_2_label: "Dia dos pais", tile_2_kind: "page", tile_2_page: "hotpage/dia-dos-pais",
      tile_3_label: "Estados", tile_3_kind: "anchor", tile_3_anchor: "estados",
    }));
    expect(problems).toEqual([]);
    expect(tiles).toEqual([
      { label: "Camisetas", caption: "Da sua cidade", image: { assetId: "01JA", alt: "", decorative: true }, dest: { kind: "ink-collection", store: "use-sul", collectionId: 152188 } },
      { label: "Dia dos pais", dest: { kind: "page", pageKind: "hotpage", slug: "dia-dos-pais" } },
      { label: "Estados", dest: { kind: "anchor", anchor: "estados" } },
    ]);
  });

  test("given a row without a name or without a destination, or too few tiles, when parsed, then the problems are said in plain words", () => {
    expect(parseGridTiles(form({ tile_count: "2", tile_0_image: "01JA", tile_0_kind: "route", tile_0_route: "/sul", tile_1_label: "Canecas", tile_1_kind: "ink-collection", tile_1_collection: "" })).problems).toEqual([
      "Bloco 1: falta o nome.",
      "Bloco 2 (\"Canecas\"): escolha para onde ele leva.",
    ]);
    expect(parseGridTiles(form({ tile_count: "1", tile_0_label: "Só um", tile_0_kind: "route", tile_0_route: "/sul" })).problems).toEqual(["A grade precisa de pelo menos 2 blocos."]);
    expect(parseGridTiles(form({ tile_count: "0" })).problems).toEqual(["A grade precisa de pelo menos 2 blocos."]);
  });

  test("given the grid form, when saved, then the layout is read (unknown values keep the current one) and the tiles replace the old ones", () => {
    const s = grid();
    const patch = parseSectionForm(form({
      grid_present: "1", grid_columns: "3", grid_aspect: "nope", grid_labels: "overlay", title: "Coleções", fill_kind: "none", overlay_preset: "none",
      tile_count: "2", tile_0_label: "A", tile_0_kind: "route", tile_0_route: "/sul/sc", tile_1_label: "B", tile_1_kind: "route", tile_1_route: "/sul/pr",
    }), s);
    expect(patch.grid).toEqual({ columns: 3, aspect: "portrait", labels: "overlay" });
    expect(patch.tiles!.map((t) => t.label)).toEqual(["A", "B"]);
    expect(validateSection({ ...s, ...patch }).ok).toBe(true);
    expect(parseSectionForm(form({ title: "x" }), s).tiles).toBeUndefined(); // no grid fields posted: tiles untouched
  });

  test("given an active grid with a tile leading to a page that is not live, when the publish links are checked, then the tile is named", () => {
    const s = grid("sul", { tiles: [tile({ label: "Dia dos pais", dest: { kind: "page", pageKind: "hotpage", slug: "dia-dos-pais" } }), tile()] });
    expect(linkProblems(structuredClone(seed.docs.sul), [s]).join(" ")).toMatch(/o bloco "Dia dos pais" leva à página "dia-dos-pais", que não existe ou ainda não foi publicada/);
    expect(linkProblems(structuredClone(seed.docs.sul), [{ ...s, active: false }])).toEqual([]);
  });
});

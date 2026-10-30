import { describe, expect, test } from "vitest";
import { parseGridTiles, parseSectionForm } from "@/lib/admin/section-form";
import { checkpointStates, dayMonth, todayInBrasilia } from "@/lib/site-config/checkpoints";
import { followedDoc } from "@/lib/site-config/follow";
import { validateScopeDoc, validateSection, type GridTile, type ScopeDoc, type Section } from "@/lib/site-config/schema";
import { buildSeedBundle } from "@/lib/site-config/seed";
import { structuredDefaults } from "@/lib/site-config/structured";

/** "Checkpoints semanais": an image grid whose blocks open one a week (the Black Month offers), the last one in evidence. */

const seed = buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null });
const form = (o: Record<string, string>) => ({ get: (k: string) => (k in o ? o[k] : null) });
const week = (n: number, opensAt: string, over: Partial<GridTile> = {}): GridTile => ({ label: `Semana ${n}`, caption: "Kids e Canecas", dest: { kind: "route", path: "/sul/busca" }, opensAt, ...over });
const WEEKS = [week(1, "2026-11-02"), week(2, "2026-11-09"), week(3, "2026-11-16"), week(4, "2026-11-23", { label: "Black Friday", highlight: true })];
const checkpoints = (patch: Partial<Section> = {}): Section => ({ ...structuredDefaults("image-grid", "sul", "custom-cp", new Set()), variant: "checkpoints", title: "Uma oferta por semana.", tiles: WEEKS, ...patch });

describe("which weeks are open", () => {
  test("given the four weeks, when the days pass, then each opens on its day, stays open, and the latest open one is the current", () => {
    expect(checkpointStates(WEEKS, "2026-10-30")).toEqual(["locked", "locked", "locked", "locked"]);
    expect(checkpointStates(WEEKS, "2026-11-02")).toEqual(["current", "locked", "locked", "locked"]);
    expect(checkpointStates(WEEKS, "2026-11-15")).toEqual(["open", "current", "locked", "locked"]);
    expect(checkpointStates(WEEKS, "2026-11-23")).toEqual(["open", "open", "open", "current"]);
    expect(checkpointStates(WEEKS, "2026-12-10")).toEqual(["open", "open", "open", "current"]);
  });

  test("given a block without a day, when drawn, then it is open from the start and current only until a dated one opens", () => {
    const tiles = [{}, { opensAt: "2026-11-09" }];
    expect(checkpointStates(tiles, "2026-11-01")).toEqual(["current", "locked"]);
    expect(checkpointStates(tiles, "2026-11-09")).toEqual(["open", "current"]);
  });

  test("given the server clock, when the day is read, then it is Brasília's (a block turns at its midnight, not UTC's)", () => {
    expect(todayInBrasilia(new Date("2026-11-16T02:30:00Z"))).toBe("2026-11-15");
    expect(todayInBrasilia(new Date("2026-11-16T03:00:00Z"))).toBe("2026-11-16");
    expect(dayMonth("2026-11-16")).toBe("16/11");
  });
});

describe("checkpoints in the schema and the editor", () => {
  test("given the composition, when validated, then the days and the evidence pass; a malformed day or the fields outside it are refused", () => {
    expect(validateSection(checkpoints())).toMatchObject({ ok: true });
    expect(validateSection(checkpoints({ tiles: [week(1, "2026-11-31"), week(2, "2026-11-09")] })).ok).toBe(false);
    expect(validateSection(checkpoints({ tiles: [week(1, "16/11/2026"), week(2, "2026-11-09")] })).ok).toBe(false);
    expect(validateSection(checkpoints({ tiles: [week(1, "2026-11-02", { highlight: false as unknown as true }), week(2, "2026-11-09")] })).ok).toBe(false);
    expect(validateSection(checkpoints({ variant: undefined })).ok).toBe(false); // days only in the checkpoints composition
  });

  test("given the editor's form, when parsed, then each block keeps its day and the one in evidence; a bad day is a problem", () => {
    const rows = { tile_count: "2", tile_0_label: "Semana 1", tile_0_kind: "route", tile_0_route: "/sul/busca", tile_0_opens: "2026-11-02", tile_1_label: "Black Friday", tile_1_kind: "route", tile_1_route: "/sul/busca", tile_1_opens: "2026-11-23", tile_1_highlight: "on" };
    const { tiles, problems } = parseGridTiles(form(rows));
    expect(problems).toEqual([]);
    expect(tiles.map((t) => [t.opensAt, t.highlight])).toEqual([["2026-11-02", undefined], ["2026-11-23", true]]);
    expect(parseGridTiles(form({ ...rows, tile_0_opens: "2026-13-02" })).problems[0]).toContain("data de abertura");
    // The composition itself is chosen with the others.
    const patch = parseSectionForm(form({ variant_present: "1", variant: "checkpoints" }), checkpoints({ variant: undefined }));
    expect(patch.variant).toBe("checkpoints");
  });

  test("given a region that follows Sul's home, when Sul has the checkpoints, then the region gets the same weeks with its own links", () => {
    const sul = structuredClone(seed.docs.sul);
    const sections = [...sul.home!.sections];
    sections.splice(1, 0, checkpoints());
    const withCp: ScopeDoc = { ...sul, home: { sections } };
    expect(validateScopeDoc(withCp).ok).toBe(true);
    const norte = { ...structuredClone(seed.docs.norte), follow: ["home"] } as ScopeDoc;
    const cp = followedDoc(norte, withCp, true).home!.sections.find((s) => s.id === "custom-cp")!;
    expect(cp.variant).toBe("checkpoints");
    expect(cp.tiles!.map((t) => [t.opensAt, t.highlight === true, t.dest])).toEqual(WEEKS.map((t) => [t.opensAt, t.highlight === true, { kind: "route", path: "/norte/busca" }]));
  });
});

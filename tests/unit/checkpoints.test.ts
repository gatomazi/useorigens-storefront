import { describe, expect, test } from "vitest";
import { parseGridTiles, parseHeroSchedule, parseSectionForm } from "@/lib/admin/section-form";
import { checkpointStates, dayMonth, periodLabel, periodState, todayInBrasilia } from "@/lib/site-config/checkpoints";
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

describe("the Black Month calendar: periods with an end (both days included, Brasília)", () => {
  const CAL = [
    week(1, "2026-11-02", { closesAt: "2026-11-07" }),
    week(2, "2026-11-09", { closesAt: "2026-11-15" }),
    week(3, "2026-11-16", { closesAt: "2026-11-22" }),
    week(4, "2026-11-23", { label: "Black Week", highlight: true, closesAt: "2026-11-30" }),
  ];
  test("given the four periods, when the days pass, then a week runs on both of its days, ends after, and 08/11 has no week running", () => {
    expect(checkpointStates(CAL, "2026-11-01")).toEqual(["locked", "locked", "locked", "locked"]);
    expect(checkpointStates(CAL, "2026-11-02")).toEqual(["current", "locked", "locked", "locked"]);
    expect(checkpointStates(CAL, "2026-11-07")).toEqual(["current", "locked", "locked", "locked"]);
    expect(checkpointStates(CAL, "2026-11-08")).toEqual(["ended", "locked", "locked", "locked"]);
    expect(checkpointStates(CAL, "2026-11-09")).toEqual(["ended", "current", "locked", "locked"]);
    expect(checkpointStates(CAL, "2026-11-30")).toEqual(["ended", "ended", "ended", "current"]);
    expect(checkpointStates(CAL, "2026-12-01")).toEqual(["ended", "ended", "ended", "ended"]);
  });

  test("given Brasília's midnight, when 07/11 turns into 08/11, then the first week ends at that minute and not at UTC's", () => {
    expect(checkpointStates(CAL, todayInBrasilia(new Date("2026-11-08T02:59:00Z")))[0]).toBe("current"); // 07/11 23:59 in Brasília
    expect(checkpointStates(CAL, todayInBrasilia(new Date("2026-11-08T03:00:00Z")))[0]).toBe("ended"); // 08/11 00:00 in Brasília
  });

  test("given a period, when shown, then it reads as the calendar writes it", () => {
    expect(periodLabel({ opensAt: "2026-11-02", closesAt: "2026-11-07" })).toBe("02–07/11");
    expect(periodLabel({ opensAt: "2026-11-28", closesAt: "2026-12-03" })).toBe("28/11–03/12");
    expect(periodLabel({ opensAt: "2026-11-02" })).toBe("a partir de 02/11");
    expect(periodState({ opensAt: "2026-11-09", closesAt: "2026-11-15" }, "2026-11-15")).toBe("running");
    expect(periodState({ opensAt: "2026-11-09", closesAt: "2026-11-15" }, "2026-11-16")).toBe("ended");
  });

  test("given an end before the start, when validated or posted, then it is refused", () => {
    expect(validateSection(checkpoints({ tiles: [week(1, "2026-11-07", { closesAt: "2026-11-02" }), week(2, "2026-11-09")] })).ok).toBe(false);
    const rows = { tile_count: "2", tile_0_label: "Semana 1", tile_0_kind: "route", tile_0_route: "/sul/busca", tile_0_opens: "2026-11-02", tile_0_closes: "2026-11-07", tile_1_label: "Semana 2", tile_1_kind: "route", tile_1_route: "/sul/busca", tile_1_opens: "2026-11-09", tile_1_closes: "2026-11-01" };
    const { tiles, problems } = parseGridTiles(form(rows));
    expect(tiles[0].closesAt).toBe("2026-11-07");
    expect(problems[0]).toContain("encerramento vem antes");
  });
});

describe("a product section with a period (the weeks' shelves on the calendar page)", () => {
  const shelf = (period: Section["period"]): Section => ({
    id: "custom-s2", anchor: "semana-2", headingId: "semana-2-title", template: "product-carousel", active: true, title: "Da Nossa Terra e Made In",
    analyticsSource: "homeCollection", layout: { variant: "standard", tone: "light", surface: "plain" }, source: { kind: "ink-category", store: "use-sul", collectionId: 10, limit: 8, order: "category" },
    appearance: { fill: { kind: "none" }, focal: { mobile: { x: 50, y: 50 }, desktop: { x: 50, y: 50 } }, overlay: { preset: "none" } }, ...(period ? { period } : {}),
  });
  test("given a period, when validated, then the days and the label pass; a period elsewhere or malformed is refused", () => {
    expect(validateSection(shelf({ opensAt: "2026-11-09", closesAt: "2026-11-15", label: "Semana 2" })).ok).toBe(true);
    expect(validateSection(shelf({ closesAt: "2026-11-15" })).ok).toBe(true);
    expect(validateSection(shelf({} as never)).ok).toBe(false);
    expect(validateSection(shelf({ opensAt: "2026-11-15", closesAt: "2026-11-09" })).ok).toBe(false);
    expect(validateSection({ ...checkpoints(), period: { opensAt: "2026-11-09" } }).ok).toBe(false);
  });
  test("given the editor's form, when parsed, then the period is kept, and no day means no period", () => {
    const s = shelf(undefined);
    expect(parseSectionForm(form({ period_present: "1", period_from: "2026-11-09", period_to: "2026-11-15", period_label: "Semana 2" }), s).period).toEqual({ opensAt: "2026-11-09", closesAt: "2026-11-15", label: "Semana 2" });
    expect(parseSectionForm(form({ period_present: "1", period_from: "", period_to: "", period_label: "Semana 2" }), s).period).toBeUndefined();
  });
});

describe("the opening's scheduled texts", () => {
  const hero = (): Section => structuredClone(seed.docs.sul.home!.sections[0]);
  const CAL_PAGE = { kind: "page" as const, pageKind: "hotpage" as const, slug: "calendario-da-black" };
  test("given entries for the eve and the day between two weeks, when validated, then they pass; overlapping or empty ones are refused", () => {
    const eve = { from: "2026-11-01", to: "2026-11-01", title: "Sua origem\nvai entrar na\nBlack.", subtitle: "Amanhã, Fala Daqui e Identidade abrem a nossa Black Month.", cta: { label: "Ver calendário da Black", dest: CAL_PAGE } };
    const gap = { from: "2026-11-08", to: "2026-11-08", subtitle: "A próxima seleção de ofertas chega amanhã, 09/11.", cta: { label: "Ver calendário da Black", dest: CAL_PAGE } };
    expect(validateSection({ ...hero(), heroSchedule: [eve, gap] })).toMatchObject({ ok: true });
    expect(validateSection({ ...hero(), heroSchedule: [eve, { ...gap, from: "2026-11-01" }] }).ok).toBe(false);
    expect(validateSection({ ...hero(), heroSchedule: [{ from: "2026-11-08", to: "2026-11-08" }] }).ok).toBe(false);
    expect(validateSection({ ...checkpoints(), heroSchedule: [gap] }).ok).toBe(false);
  });
  test("given the editor's form, when parsed, then entries come sorted, a one-day entry needs no last day, and overlaps are problems", () => {
    const rows = {
      hero_sched_present: "1", hero_sched_count: "2",
      hero_sched_0_from: "2026-11-08", hero_sched_0_to: "", hero_sched_0_subtitle: "A próxima seleção de ofertas chega amanhã, 09/11.", hero_sched_0_cta_label: "Ver calendário da Black", hero_sched_0_cta_kind: "page", hero_sched_0_cta_page: "hotpage/calendario-da-black",
      hero_sched_1_from: "2026-11-01", hero_sched_1_to: "2026-11-01", hero_sched_1_title: "Sua origem\r\nvai entrar na\r\nBlack.",
    };
    const { entries, problems } = parseHeroSchedule(form(rows));
    expect(problems).toEqual([]);
    expect(entries!.map((e) => [e.from, e.to, e.title ?? null, e.cta?.dest ?? null])).toEqual([["2026-11-01", "2026-11-01", "Sua origem\nvai entrar na\nBlack.", null], ["2026-11-08", "2026-11-08", null, CAL_PAGE]]);
    expect(parseHeroSchedule(form({ ...rows, hero_sched_1_from: "2026-11-08", hero_sched_1_to: "2026-11-08" })).problems[0]).toContain("encosta");
  });
  test("given a region that follows Sul, when Sul's opening has a scheduled button, then the region gets it with its own link", () => {
    const sul = structuredClone(seed.docs.sul);
    sul.home!.sections[0] = { ...sul.home!.sections[0], heroSchedule: [{ from: "2026-11-08", to: "2026-11-08", subtitle: "Amanhã, 09/11.", cta: { label: "Ver ofertas", dest: { kind: "route", path: "/sul/busca" } } }] };
    const norte = { ...structuredClone(seed.docs.norte), follow: ["home"] } as ScopeDoc;
    expect(followedDoc(norte, sul, true).home!.sections[0].heroSchedule![0].cta!.dest).toEqual({ kind: "route", path: "/norte/busca" });
  });
});

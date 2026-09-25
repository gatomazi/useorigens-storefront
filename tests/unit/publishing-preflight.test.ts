import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { effectiveTable, pendingTrackingChanges, preflight, publishRelease, seedForEnv, trackingChanges } from "@/lib/admin/publishing";
import type { PublishDeps } from "@/lib/admin/publishing";
import type { ScopeDoc } from "@/lib/site-config/schema";

const headless = { releases: { head: async () => null } as never, media: async () => ({}) };
const saved = { meta: process.env.NEXT_PUBLIC_META_PIXEL_ID, ga: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID };
beforeEach(() => {
  process.env.NEXT_PUBLIC_META_PIXEL_ID = "1558923262073052";
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = "G-8GYTEJ1F77";
});
afterEach(() => {
  if (saved.meta === undefined) delete process.env.NEXT_PUBLIC_META_PIXEL_ID; else process.env.NEXT_PUBLIC_META_PIXEL_ID = saved.meta;
  if (saved.ga === undefined) delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID; else process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = saved.ga;
});

describe("tracking changes must be confirmed before they go live", () => {
  test("given the seed, when checked, then it passes and changes nothing versus 'nothing published' (Sul legacy = the same IDs)", async () => {
    expect(await preflight(headless, seedForEnv().docs.sul)).toEqual([]);
    expect(await pendingTrackingChanges(headless, seedForEnv().docs.sul)).toEqual([]);
  });

  test("given the effective table of the seed, when read, then Sul has the legacy IDs and Norte/Centro-Oeste have none", () => {
    const t = effectiveTable(seedForEnv());
    const row = (scope: string, tool: string) => t.find((r) => r.scope === scope && r.tool === tool)!;
    expect(row("sul", "meta")).toMatchObject({ id: "1558923262073052", origin: "legacy" });
    expect(row("sul", "ga4")).toMatchObject({ id: "G-8GYTEJ1F77", origin: "legacy" });
    expect(row("norte", "meta")).toMatchObject({ id: null, origin: "disabled" });
    expect(row("centro-oeste", "ga4")).toMatchObject({ id: null, origin: "disabled" });
  });

  test("given a region switched to its own Meta ID, when compared with what is live, then exactly that line changes", () => {
    const before = seedForEnv();
    const after = structuredClone(before);
    after.docs.norte.tracking.meta = { mode: "override", id: "2222222222222222" };
    expect(trackingChanges(before, after)).toEqual(["Norte · Meta Pixel: nenhum (desligado) → 2222222222222222 (próprio)"]);
  });

  test("given the global ID changes while three regions inherit it, when compared, then every region it touches is listed (inheritance moves several at once)", () => {
    const before = seedForEnv();
    for (const r of ["sul", "norte", "centro-oeste"] as const) before.docs[r].tracking = { meta: { mode: "inherit" }, ga4: { mode: "disabled" } };
    before.docs.global.tracking.meta = { mode: "override", id: "1111111111111111" };
    const after = structuredClone(before);
    after.docs.global.tracking.meta = { mode: "override", id: "9999999999999999" };
    const lines = trackingChanges(before, after);
    expect(lines).toHaveLength(3);
    expect(lines.join("\\n")).toContain("Sul · Meta Pixel: 1111111111111111 (global) → 9999999999999999 (global)");
  });

  test("given a publish that changes tracking, when it is not confirmed, then it is refused and lists the lines; when confirmed, it goes through validation", async () => {
    const doc: ScopeDoc = structuredClone(seedForEnv().docs.norte);
    doc.tracking.meta = { mode: "override", id: "2222222222222222" };
    const deps = { ...headless, files: {} as never, actorId: null } as PublishDeps;
    const refused = await publishRelease(deps, { kind: "publish", doc }, async () => undefined);
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.errors.join(" ")).toContain("Confirme os IDs");
    expect(!refused.ok && refused.errors.join(" ")).toContain("Norte · Meta Pixel");
  });

  test("given an ordinary content-only publish, when checked, then no tracking confirmation is asked", async () => {
    const doc: ScopeDoc = structuredClone(seedForEnv().docs.sul);
    doc.home!.sections[1].title = "Outro título";
    expect(await pendingTrackingChanges(headless, doc)).toEqual([]);
  });
});

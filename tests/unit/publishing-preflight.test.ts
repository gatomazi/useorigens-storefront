import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { preflight, seedForEnv } from "@/lib/admin/publishing";
import type { ScopeDoc } from "@/lib/site-config/schema";

const deps = { releases: { head: async () => null } as never, media: async () => ({}) };
const saved = { meta: process.env.NEXT_PUBLIC_META_PIXEL_ID, ga: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID };
beforeEach(() => {
  process.env.NEXT_PUBLIC_META_PIXEL_ID = "1558923262073052";
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = "G-8GYTEJ1F77";
});
afterEach(() => {
  if (saved.meta === undefined) delete process.env.NEXT_PUBLIC_META_PIXEL_ID; else process.env.NEXT_PUBLIC_META_PIXEL_ID = saved.meta;
  if (saved.ga === undefined) delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID; else process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = saved.ga;
});

describe("publish pre-flight: tracking stays exactly as production has it", () => {
  test("given the seed document built from the current env, when checked, then it passes", async () => {
    expect(await preflight(deps, seedForEnv().docs.sul)).toEqual([]);
  });

  test("given a document whose Meta Pixel differs from the build's, when checked, then publishing is blocked with a clear reason", async () => {
    const doc: ScopeDoc = structuredClone(seedForEnv().docs.sul);
    doc.tracking.meta = { mode: "override", id: "9999999999" };
    const problems = await preflight(deps, doc);
    expect(problems.join(" ")).toContain("Meta Pixel");
    expect(problems.join(" ")).not.toContain("GA4");
  });

  test("given a document that disables or changes GA4, when checked, then it is blocked too", async () => {
    const disabled: ScopeDoc = structuredClone(seedForEnv().docs.sul);
    disabled.tracking.ga4 = { mode: "disabled" };
    expect((await preflight(deps, disabled)).join(" ")).toContain("GA4");
    const changed: ScopeDoc = structuredClone(seedForEnv().docs.sul);
    changed.tracking.ga4 = { mode: "override", id: "G-ZZZZZZZZ" };
    expect((await preflight(deps, changed)).join(" ")).toContain("GA4");
  });

  test("given no tracking env at all (local development), when checked, then tracking is not compared", async () => {
    delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
    delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
    const doc: ScopeDoc = structuredClone(seedForEnv().docs.sul);
    doc.tracking.meta = { mode: "override", id: "9999999999" };
    expect((await preflight(deps, doc)).join(" ")).not.toContain("Meta Pixel");
  });
});

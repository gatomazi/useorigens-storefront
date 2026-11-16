import { describe, expect, test, vi } from "vitest";
import type { CatalogSource } from "@/lib/catalog/types";
import type { BuildResult, StoreBuildInput } from "@/lib/recommendations/build";
import { rebuildLojaUnicaRecommendations } from "@/lib/recommendations/rebuild";

const PROD: CatalogSource = { mode: "single-store", storeKey: "use-sul", simulation: false, runId: "r", generatedAt: "2026-11-10T06:49:17.226Z", mapVersion: 1, identitySha256: "x" };
const INPUT = { store: "use-sul", syncedAt: "2026-11-10T06:49:17.226Z", bindings: [], merch: [] } as unknown as StoreBuildInput;
const BUILT = { index: { version: 1, generatedAt: "2026-11-10T06:49:17.226Z", reasons: [], stores: {} }, stats: { "use-sul": { productsWithList: 42 } }, built: {}, debug: {} } as unknown as BuildResult;

describe("rebuild of the single store's recommendations after its sync", () => {
  test("given the production catalog, then the index is built from it and promoted into the single store's folder", async () => {
    const promote = vi.fn(async () => ({ validation: { ok: true as const, bytes: 1234, sha256: "s" }, target: "t", previous: null }));
    const build = vi.fn(() => BUILT);
    const out = await rebuildLojaUnicaRecommendations({ read: () => ({ inputs: [INPUT], skipped: [], singleStore: PROD, cms: "seed" }), build, promote: promote as never });
    expect(build).toHaveBeenCalledWith([INPUT]);
    expect(promote).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ expectStores: ["use-sul"], minListsPerStore: 10, target: expect.stringMatching(/recommendations-index\.json$/) }));
    expect(out).toMatchObject({ ok: true, productsWithList: 42, bytes: 1234, generatedAt: "2026-11-10T06:49:17.226Z" });
  });

  test("given a simulation snapshot (hidden Norte/CO products shown as active), then nothing is written", async () => {
    const promote = vi.fn();
    const out = await rebuildLojaUnicaRecommendations({ read: () => ({ inputs: [INPUT], skipped: [], singleStore: { ...PROD, simulation: true }, cms: "seed" }), build: () => BUILT, promote });
    expect(out).toMatchObject({ ok: false, error: expect.stringContaining("simulação") });
    expect(promote).not.toHaveBeenCalled();
  });

  test("given a refused promotion (validation), then it reports and never throws: the live index stays", async () => {
    const out = await rebuildLojaUnicaRecommendations({ read: () => ({ inputs: [INPUT], skipped: [], singleStore: PROD, cms: "seed" }), build: () => BUILT, promote: async () => { throw new Error("poucas listas"); } });
    expect(out).toEqual({ ok: false, error: "poucas listas" });
  });

  test("given no single-store catalog yet, then it reports and writes nothing", async () => {
    const promote = vi.fn();
    const out = await rebuildLojaUnicaRecommendations({ read: () => ({ inputs: [], skipped: ["use-sul"], singleStore: PROD, cms: "seed" }), promote });
    expect(out).toMatchObject({ ok: false });
    expect(promote).not.toHaveBeenCalled();
  });
});

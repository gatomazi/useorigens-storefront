import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { seedForEnv } from "@/lib/admin/publishing";
import { validateScopeDoc, type PublishedBundle, type Section } from "@/lib/site-config/schema";

const readiness = vi.hoisted(() => ({ ready: { norte: false, "centro-oeste": false, sul: true } as Record<string, boolean> }));
vi.mock("@/lib/catalog/readiness", () => ({
  regionReadiness: (region: string) => ({ region, coveredCities: readiness.ready[region] ? 100 : 3, totalCities: 100, ratio: readiness.ready[region] ? 1 : 0.03, ready: !!readiness.ready[region] }),
}));

const heroFooter = (): Section[] => {
  const sul = seedForEnv().docs.sul.home!.sections;
  return [sul[0], sul[sul.length - 1]].map((s) => structuredClone(s));
};

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "uo-launch-"));
  readiness.ready = { norte: false, "centro-oeste": false, sul: true };
  vi.stubEnv("SITE_CONFIG_DIR", dir);
  vi.stubEnv("SITE_CONFIG_HOME", "on");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

async function publishFile(mutate: (b: PublishedBundle) => void, releaseId = "r9") {
  const bundle = structuredClone(seedForEnv());
  mutate(bundle);
  await writeFile(path.join(dir, "published.json"), JSON.stringify({ ...bundle, releaseId }));
}

describe("which regions are public is decided from the published file", () => {
  test("given no published file, when regions are listed, then only Sul is public", async () => {
    const { launchedRegions } = await import("@/lib/regions/launched");
    expect(launchedRegions()).toEqual(["sul"]);
  });

  test("given Norte is launched in the published release AND its catalog is ready, when regions are listed, then Norte is public; Centro-Oeste (not launched) is not", async () => {
    await publishFile((b) => { b.docs.norte.home = { sections: heroFooter() }; b.docs.norte.launched = true; });
    readiness.ready.norte = true;
    readiness.ready["centro-oeste"] = true;
    const { launchedRegions, isRegionLaunched } = await import("@/lib/regions/launched");
    expect(launchedRegions()).toEqual(["sul", "norte"]);
    expect(isRegionLaunched("centro-oeste")).toBe(false);
  });

  test("given Norte is launched but its catalog is not ready in this environment, when regions are listed, then it stays out (never an empty page or '0 cidades')", async () => {
    await publishFile((b) => { b.docs.norte.home = { sections: heroFooter() }; b.docs.norte.launched = true; });
    const { launchedRegions } = await import("@/lib/regions/launched");
    expect(launchedRegions()).toEqual(["sul"]);
  });

  test("given the CMS flag is off, when Norte is launched and ready, then still only Sul is public (the flag is the master switch)", async () => {
    await publishFile((b) => { b.docs.norte.home = { sections: heroFooter() }; b.docs.norte.launched = true; });
    readiness.ready.norte = true;
    vi.stubEnv("SITE_CONFIG_HOME", "off");
    const { launchedRegions } = await import("@/lib/regions/launched");
    expect(launchedRegions()).toEqual(["sul"]);
  });

  test("given a corrupt published file, when regions are listed, then only Sul is public", async () => {
    await writeFile(path.join(dir, "published.json"), "{not json");
    readiness.ready.norte = true;
    const { launchedRegions } = await import("@/lib/regions/launched");
    expect(launchedRegions()).toEqual(["sul"]);
  });
});

describe("launch blockers guard the public site", () => {
  test("given a region with no home, when checked, then it says the home was not created; a region without catalog coverage says so", async () => {
    const { launchBlockers } = await import("@/lib/admin/launch");
    const doc = structuredClone(seedForEnv().docs.norte);
    const blockers = await launchBlockers("norte", doc);
    expect(blockers.join(" ")).toContain("catálogo da loja Norte");
    expect(blockers.join(" ")).toContain("home");
  });

  test("given a ready catalog but only a hero and footer, when checked, then there is no launch without a real product section", async () => {
    readiness.ready.norte = true;
    const { launchBlockers } = await import("@/lib/admin/launch");
    const doc = structuredClone(seedForEnv().docs.norte);
    doc.home = { sections: heroFooter() };
    expect(await launchBlockers("norte", doc)).toEqual(["nenhuma seção de produtos com pelo menos 3 produtos reais da loja da região"]);
  });
});

describe("the first home of a region is built only from that region's own store", () => {
  test.each(["norte", "centro-oeste"] as const)("given %s, when the initial home is proposed, then it validates, uses only its own INK store, has DOM-safe anchors and copies nothing from Sul", async (region) => {
    const { buildRegionSeed } = await import("@/lib/admin/region-seed");
    const { REGIONS } = await import("@/lib/geo/regions");
    const seed = buildRegionSeed(region);
    const doc = { ...structuredClone(seedForEnv().docs[region]), home: { sections: seed.sections } };
    expect(validateScopeDoc(doc).ok).toBe(true);
    expect(seed.sections[0].template).toBe("hero");
    expect(seed.sections.at(-1)!.template).toBe("footer");
    for (const s of seed.sections) {
      expect(s.anchor).toMatch(/^[a-z0-9-]+$/);
      if (s.source?.kind === "ink-category") expect(s.source.store).toBe(REGIONS[region].storeKey);
    }
    expect(JSON.stringify(seed.sections)).not.toContain("use-sul");
    expect(seed.sections.some((s) => (s.template as string) === "campaign" || (s.template as string) === "reviews")).toBe(false);
  });
});

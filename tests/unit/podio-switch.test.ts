import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { applyOp } from "@/lib/admin/draft-ops";
import { diffDocs } from "@/lib/admin/diff";
import { podioEnabled } from "@/lib/podio/enabled";
import { syncPodio } from "@/lib/podio/sync";
import { podioEnabledIn, validatePodio } from "@/lib/site-config/podio-schema";
import { sanitizeBundle } from "@/lib/site-config/sanitize";
import { validateScopeDoc, type ScopeDoc } from "@/lib/site-config/schema";
import { buildSeedBundle } from "@/lib/site-config/seed";

const seed = () => buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null });
const ctx = { newId: () => "t1" };
const ok = (d: ScopeDoc, op: Parameters<typeof applyOp>[1]) => {
  const r = applyOp(d, op, ctx);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.doc;
};

const dirs: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("pódio switch of a region (document)", () => {
  test("given a region, when the pódio is switched off and back on, then only `podio` changes and on is the default again (no key)", () => {
    const sul = structuredClone(seed().docs.sul);
    expect(podioEnabledIn(sul)).toBe(true);
    const off = ok(sul, { type: "set-podio", enabled: false });
    expect(off.podio).toEqual({ enabled: false });
    expect(podioEnabledIn(off)).toBe(false);
    expect(validateScopeDoc(off).ok).toBe(true);
    const on = ok(off, { type: "set-podio", enabled: true });
    expect("podio" in on).toBe(false);
    expect(on).toEqual(sul);
  });

  test("given the global scope, when the pódio is set there, then it is refused: it belongs to a region", () => {
    expect(applyOp(structuredClone(seed().docs.global), { type: "set-podio", enabled: false }, ctx).ok).toBe(false);
    expect(validateScopeDoc({ ...seed().docs.global, podio: { enabled: false } }).ok).toBe(false);
  });

  test("given bad values, when validated, then each is refused", () => {
    for (const bad of [null, false, {}, { enabled: "false" }, { enabled: false, extra: 1 }]) expect(validatePodio(bad, "norte").ok).toBe(false);
    expect(validatePodio({ enabled: false }, "norte").ok).toBe(true);
  });

  test("given a published bundle, when read, then the switch comes from the region; an invalid one is dropped (pódio on) without losing the region", () => {
    const bundle = seed();
    const raw = { ...bundle, releaseId: "r1", docs: { ...bundle.docs, sul: { ...bundle.docs.sul, podio: { enabled: false } } } };
    expect(podioEnabledIn(sanitizeBundle(raw, bundle).bundle?.docs.sul)).toBe(false);
    expect(podioEnabledIn(sanitizeBundle(raw, bundle).bundle?.docs.norte)).toBe(true);
    const bad = { ...raw, docs: { ...raw.docs, sul: { ...raw.docs.sul, podio: { enabled: "no" } } } };
    const read = sanitizeBundle(bad, bundle);
    expect(podioEnabledIn(read.bundle?.docs.sul)).toBe(true);
    expect(read.bundle?.docs.sul.home).toEqual(bundle.docs.sul.home);
    expect(read.diagnostics.some((d) => d.includes("podio is invalid"))).toBe(true);
  });

  test("given a switched pódio, when the publish screen diffs the region, then it says what happens in the store and to the calculation", () => {
    const sul = structuredClone(seed().docs.sul);
    const off = ok(sul, { type: "set-podio", enabled: false });
    expect(diffDocs(sul, off).map((c) => c.text)).toEqual(["O Pódio sai da home e das páginas de estado, e o cálculo diário desta região para"]);
    expect(diffDocs(off, sul).map((c) => c.text)).toEqual(["O Pódio volta para a home e as páginas de estado, e o cálculo diário desta região volta a rodar"]);
    expect(diffDocs(off, off)).toEqual([]);
  });
});

describe("pódio switch (store and daily calculation)", () => {
  test("given the server kill switch or a region switched off, when asked, then the pódio is off; otherwise on", () => {
    const sul = seed().docs.sul;
    expect(podioEnabled("sul", sul)).toBe(true);
    expect(podioEnabled("sul", { ...sul, podio: { enabled: false } })).toBe(false);
    vi.stubEnv("PODIO_PUBLIC", "off");
    expect(podioEnabled("sul", sul)).toBe(false);
  });

  test("given a region switched off, when the daily sync runs, then it is skipped without reading INK or writing a file; the others still run", async () => {
    const baseDir = mkdtempSync(path.join(tmpdir(), "podio-switch-"));
    dirs.push(baseDir);
    const fetched: string[] = [];
    const results = await syncPodio(["sul", "norte"], {
      baseDir,
      now: () => new Date("2026-10-04T07:00:00Z"),
      enabled: (region) => region !== "sul",
      bindings: async () => [],
      fetchOrders: async (region) => {
        fetched.push(region);
        return { orders: [], requests: 1 };
      },
    });
    expect(results[0]).toEqual({ region: "sul", ok: true, skipped: "disabled" });
    expect(results[1]).toMatchObject({ region: "norte", ok: true, states: [] });
    expect(fetched).toEqual(["norte"]);
    expect(existsSync(path.join(baseDir, "podio", "sul"))).toBe(false);
    expect(existsSync(path.join(baseDir, "podio", "norte", "latest.json"))).toBe(true);
  });
});

import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { applyOp } from "@/lib/admin/draft-ops";
import { diffDocs } from "@/lib/admin/diff";
import { globalParts } from "@/lib/admin/pending";
import { themeBlockers } from "@/lib/admin/publishing";
import { regionlessStyle } from "@/lib/site-config/chrome";
import { neutralThemeCssVars, neutralThemeProblems, resolveNeutralTheme } from "@/lib/site-config/neutral-theme";
import { resolveTheme, validateNeutralTheme, type ThemeConfig } from "@/lib/site-config/navigation";
import { sanitizeBundle } from "@/lib/site-config/sanitize";
import { validateScopeDoc } from "@/lib/site-config/schema";
import { buildSeedBundle } from "@/lib/site-config/seed";

const seed = () => buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null });
const palette: ThemeConfig = { mode: "override", colors: { brandPrimary: "#143e46", accent: "#d6ba8d", pageBackground: "#f8f1e7", pageText: "#202020" } };

test("neutral and inherited regional palettes resolve independently", () => {
  const bundle = seed();
  bundle.docs.global.theme = { mode: "override", colors: { brandPrimary: "#663322" } };
  bundle.docs.norte.theme = { mode: "inherit", colors: {} };
  const before = resolveTheme("norte", bundle.docs.norte, bundle.docs.global);
  bundle.docs.global.neutralTheme = palette;
  expect(resolveTheme("norte", bundle.docs.norte, bundle.docs.global)).toEqual(before);
  expect(resolveNeutralTheme(bundle.docs.global.neutralTheme).effective).toMatchObject({ brandPrimary: "#143e46", headerBackground: "#143e46", mobileMenuBackground: "#143e46" });
  expect(resolveNeutralTheme().effective.brandPrimary).toBe("#000000");
  expect(neutralThemeCssVars()).toEqual({});
});

test("the palette belongs only to the global document and cannot inherit a region or the brand palette", () => {
  const bundle = seed();
  expect(validateNeutralTheme(palette, "global").ok).toBe(true);
  expect(validateNeutralTheme(palette, "sul").ok).toBe(false);
  expect(validateNeutralTheme({ mode: "inherit", colors: {} }, "global").ok).toBe(false);
  expect(validateNeutralTheme({ mode: "override", colors: { pageBackground: "url(https://example.com)" } }, "global").ok).toBe(false);
  expect(validateScopeDoc({ ...bundle.docs.sul, neutralTheme: palette }).ok).toBe(false);
});

test("saving and resetting the neutral draft preserves the regional-global palette and appears in publication review", () => {
  const original = { ...seed().docs.global, theme: { mode: "override" as const, colors: { brandPrimary: "#663322" } } };
  const result = applyOp(original, { type: "set-neutral-theme", theme: palette }, { newId: () => "test" });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.doc.theme).toEqual(original.theme);
  expect(result.doc.neutralTheme).toEqual(palette);
  expect(globalParts(original, result.doc)).toEqual(["cores das páginas sem região"]);
  expect(diffDocs(original, result.doc).map((c) => c.text).join(" ")).toContain("Páginas sem região, cor principal");
  const reset = applyOp(result.doc, { type: "set-neutral-theme", theme: null }, { newId: () => "test" });
  expect(reset.ok && reset.doc).toEqual(original);
  expect(applyOp(seed().docs.sul, { type: "set-neutral-theme", theme: palette }, { newId: () => "test" }).ok).toBe(false);
});

test("the published reader keeps a valid palette and drops only an invalid palette", () => {
  const bundle = seed();
  bundle.docs.global.neutralTheme = palette;
  expect(sanitizeBundle(bundle, seed()).bundle?.docs.global.neutralTheme).toEqual(palette);
  const malformed = { ...bundle, docs: { ...bundle.docs, global: { ...bundle.docs.global, neutralTheme: { mode: "override", colors: { pageText: "invalid" } } } } };
  const result = sanitizeBundle(malformed, seed());
  expect(result.bundle?.docs.global.neutralTheme).toBeUndefined();
  expect(result.bundle?.docs.global.tracking).toEqual(bundle.docs.global.tracking);
  expect(result.diagnostics.join(" ")).toContain("neutralTheme is invalid");
});

test("unreadable neutral colours block a global publication even without an inherited brand palette", () => {
  const bundle = seed();
  delete bundle.docs.global.theme;
  bundle.docs.global.neutralTheme = { mode: "override", colors: { pageBackground: "#ffffff", pageText: "#ffffff" } };
  expect(neutralThemeProblems(bundle.docs.global.neutralTheme).blocking.length).toBeGreaterThan(0);
  expect(themeBlockers(bundle, "global").join(" ")).toContain("Páginas sem região:");
  expect(themeBlockers(bundle, "sul")).toEqual([]);
  bundle.docs.global.neutralTheme = palette;
  expect(themeBlockers(bundle, "global")).toEqual([]);
});

test("partial colour settings use neutral defaults; light page text keeps contrasting control labels", () => {
  expect(neutralThemeCssVars({ mode: "override", colors: { headerBackground: "#143e46" } })).toMatchObject({ "--nav-header-bg": "#143e46", "--nav-header-text": "#ffffff" });
  const dark = neutralThemeCssVars({ mode: "override", colors: { pageBackground: "#111111", pageText: "#ffffff" } });
  expect(dark).toMatchObject({ "--ground": "#111111", "--ink": "#ffffff", "--ink-soft": "#ffffff", "--neutral-on-ink": "#000000" });
});

describe("published-only regionless styling", () => {
  let dir: string;
  let saved: { enabled?: string; dir?: string };
  beforeEach(async () => {
    saved = { enabled: process.env.SITE_CONFIG_HOME, dir: process.env.SITE_CONFIG_DIR };
    dir = await mkdtemp(path.join(tmpdir(), "neutral-colours-"));
    process.env.SITE_CONFIG_HOME = "on";
    process.env.SITE_CONFIG_DIR = dir;
  });
  afterEach(async () => {
    if (saved.enabled === undefined) delete process.env.SITE_CONFIG_HOME; else process.env.SITE_CONFIG_HOME = saved.enabled;
    if (saved.dir === undefined) delete process.env.SITE_CONFIG_DIR; else process.env.SITE_CONFIG_DIR = saved.dir;
    await rm(dir, { recursive: true, force: true });
  });

  test("no file keeps the original look; a published colour update is read without rebuild and never changes the region palette", async () => {
    expect(regionlessStyle()).toEqual({});
    const bundle = seed();
    bundle.docs.global.neutralTheme = palette;
    const file = path.join(dir, "published.json");
    await writeFile(file, JSON.stringify(bundle));
    expect(regionlessStyle()).toMatchObject({ "--nav-header-bg": "#143e46" });
    const draft = structuredClone(bundle);
    draft.docs.global.neutralTheme = { mode: "override", colors: { brandPrimary: "#442233" } };
    expect(regionlessStyle()).toMatchObject({ "--nav-header-bg": "#143e46" });
    await writeFile(file, JSON.stringify(draft));
    const next = new Date(Date.now() + 2000); await utimes(file, next, next);
    expect(regionlessStyle()).toMatchObject({ "--nav-header-bg": "#442233" });
    process.env.SITE_CONFIG_HOME = "off";
    expect(regionlessStyle()).toEqual({});
  });
});

import { describe, expect, test } from "vitest";
import { applyOp } from "@/lib/admin/draft-ops";
import { diffDocs } from "@/lib/admin/diff";
import { normalizeHex, parseNavigationForm, parseThemeForm } from "@/lib/admin/navigation-form";
import { themeBlockers } from "@/lib/admin/publishing";
import { REGION_SLUGS, REGIONS, type RegionSlug } from "@/lib/geo/regions";
import { assembleNavigation, contrastMessage, navData, resolveNavigation, resolveTheme, themeContrast, themeCssVars, themeDefaults, themeProblems, validateNavigation, validateTheme, type NavigationConfig, type ThemeConfig } from "@/lib/site-config/navigation";
import { sanitizeBundle } from "@/lib/site-config/sanitize";
import { validateBundle, validateScopeDoc, type ScopeDoc } from "@/lib/site-config/schema";
import { buildSeedBundle } from "@/lib/site-config/seed";
import { structuredDefaults } from "@/lib/site-config/structured";

const seed = buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null });
const ctx = { newId: () => "n1" };
const ALL: readonly RegionSlug[] = REGION_SLUGS;
const form = (o: Record<string, string>) => ({ get: (k: string) => (k in o ? o[k] : null) });

/** A region document with a home that has the state chooser (and nothing else), like a freshly created regional home. */
const regionWithHome = (region: RegionSlug): ScopeDoc => {
  const s = seed.docs.sul.home!.sections;
  return { ...structuredClone(seed.docs[region]), home: { sections: [structuredClone(s[0]), structuredDefaults("states", region, "custom-e", new Set()), structuredClone(s[s.length - 1])] } };
};
const sulDoc = (): ScopeDoc => structuredClone(seed.docs.sul);
const labels = (region: RegionSlug, doc: ScopeDoc | undefined, launched: readonly RegionSlug[] = ALL, covered: readonly string[] | null = null) => resolveNavigation({ region, doc, launched, coveredUfs: covered });
const block = (nav: ReturnType<typeof labels>, kind: "primary" | "states" | "regions") => nav.blocks.find((b) => b.kind === kind);

describe("regional menu: the hierarchy comes from real data", () => {
  test("given Sul with everything launched, when the menu is built, then it is Comprar, Estados do Sul (PR, SC, RS) and the other two regions", () => {
    const nav = labels("sul", sulDoc());
    expect(nav.blocks.map((b) => [b.kind, b.label])).toEqual([["primary", "Comprar"], ["states", "Estados do Sul"], ["regions", "Explorar outras regiões"]]);
    expect(block(nav, "primary")!.items.map((i) => i.label)).toEqual(["Estilos", "Fala daqui", "Estados"]);
    expect(block(nav, "states")!.items.map((i) => i.label)).toEqual(["Paraná", "Santa Catarina", "Rio Grande do Sul"]);
    expect(block(nav, "regions")!.items.map((i) => i.label)).toEqual(["Norte", "Centro-Oeste"]);
  });

  test("given Norte, when the menu is built, then only its own seven states are listed, and the other regions are Sul and Centro-Oeste", () => {
    const nav = labels("norte", regionWithHome("norte"));
    expect(block(nav, "states")!.label).toBe("Estados do Norte");
    expect(block(nav, "states")!.items.map((i) => i.trackState!.state)).toEqual(["AC", "AM", "AP", "PA", "RO", "RR", "TO"]);
    expect(block(nav, "regions")!.items.map((i) => i.label)).toEqual(["Sul", "Centro-Oeste"]);
  });

  test("given Centro-Oeste, when the menu is built, then DF, GO, MS and MT are listed and the other regions are Sul and Norte", () => {
    const nav = labels("centro-oeste", regionWithHome("centro-oeste"));
    expect(block(nav, "states")!.items.map((i) => i.trackState!.state)).toEqual(["DF", "GO", "MS", "MT"]);
    expect(block(nav, "regions")!.items.map((i) => i.label)).toEqual(["Sul", "Norte"]);
  });

  test("given any region, when the other regions are listed, then the current one never appears", () => {
    for (const region of ALL) expect(block(labels(region, undefined), "regions")!.items.map((i) => i.href)).not.toContain(`/${region}`);
  });

  test("given a region that is not launched, when the menu is built, then it is not offered (no link to a page that would 404)", () => {
    const nav = labels("sul", sulDoc(), ["sul", "norte"]);
    expect(block(nav, "regions")!.items.map((i) => i.label)).toEqual(["Norte"]);
    expect(block(labels("sul", sulDoc(), ["sul"]), "regions")).toBeUndefined(); // nothing to show: the block is not drawn at all
  });

  test("given a state without products, when the menu is built, then it is not listed; with unknown coverage every state of the region is (never an empty menu)", () => {
    expect(block(labels("norte", regionWithHome("norte"), ALL, ["AC", "AM"]), "states")!.items.map((i) => i.label)).toEqual(["Acre", "Amazonas"]);
    expect(block(labels("norte", regionWithHome("norte"), ALL, null), "states")!.items).toHaveLength(7);
    expect(block(labels("norte", regionWithHome("norte"), ALL, []), "states")!.items).toHaveLength(7);
  });

  test("given the links, when built, then every href comes from the route helpers (regions, states, home anchors)", () => {
    const nav = labels("sul", sulDoc());
    expect(block(nav, "primary")!.items.map((i) => i.href)).toEqual(["/sul#estilos", "/sul#fala", "/sul#estados"]);
    expect(block(nav, "states")!.items.map((i) => i.href)).toEqual(["/sul/pr", "/sul/sc", "/sul/rs"]);
    expect(block(nav, "regions")!.items.map((i) => i.href)).toEqual(["/norte", "/centro-oeste"]);
  });

  test("given a home without 'Fala daqui', when built, then no dead link is offered", () => {
    expect(block(labels("norte", regionWithHome("norte")), "primary")!.items.map((i) => i.label)).toEqual(["Estados"]);
  });

  test("given the config-driven home off (no document), when built, then the historical three links appear", () => {
    expect(block(labels("sul", undefined), "primary")!.items.map((i) => i.label)).toEqual(["Estilos", "Fala daqui", "Estados"]);
  });
});

describe("regional menu: labels, order and visibility from the CMS", () => {
  const config = (over: NavigationConfig): ScopeDoc => ({ ...sulDoc(), navigation: over });

  test("given new block titles, when built, then they replace the defaults", () => {
    const nav = labels("sul", config({ primaryBlock: { label: "Loja", visible: true, order: 10 }, statesBlock: { label: "Por estado", visible: true, order: 20 }, regionsBlock: { label: "Outros cantos", visible: true, order: 30 } }));
    expect(nav.blocks.map((b) => b.label)).toEqual(["Loja", "Por estado", "Outros cantos"]);
  });

  test("given a different block order, when built, then the blocks follow it (and the desktop lists are unaffected)", () => {
    const nav = labels("sul", config({ primaryBlock: { label: "Comprar", visible: true, order: 30 }, statesBlock: { label: "Estados do Sul", visible: true, order: 10 }, regionsBlock: { label: "Explorar outras regiões", visible: true, order: 20 } }));
    expect(nav.blocks.map((b) => b.kind)).toEqual(["states", "regions", "primary"]);
  });

  test("given a hidden states block, when built, then it is gone from the mobile menu AND from the desktop dropdown data", () => {
    const nav = labels("sul", config({ statesBlock: { label: "Estados do Sul", visible: false, order: 20 } }));
    expect(nav.blocks.map((b) => b.kind)).toEqual(["primary", "regions"]);
    expect(nav.states).toEqual([]);
    expect(nav.regions.length).toBe(2);
  });

  test("given primary links re-labelled, re-ordered and hidden, when built, then only the known ones change and a hidden one disappears", () => {
    const nav = labels("sul", config({
      primaryLinks: [
        { id: "styles", destination: "styles", label: "Camisetas", visible: true, order: 30 },
        { id: "speech", destination: "speech", label: "Fala daqui", visible: false, order: 20 },
        { id: "states", destination: "states", label: "Escolha o estado", visible: true, order: 10 },
      ],
    }));
    expect(nav.primary.map((i) => i.label)).toEqual(["Escolha o estado", "Camisetas"]);
    expect(nav.primary.map((i) => i.href)).toEqual(["/sul#estados", "/sul#estilos"]);
  });

  test("given a page link chosen in the home's own menu settings, when built, then it stays (the CMS only manages the three known links)", () => {
    const doc = sulDoc();
    const first = doc.home!.sections.find((s) => s.anchor === "terra")!;
    first.nav = { label: "Pais", dest: { kind: "page", pageKind: "hotpage", slug: "dia-dos-pais" } };
    doc.pages = [{ id: "p1", kind: "hotpage", slug: "dia-dos-pais", title: "Dia dos Pais", active: true, archived: false, version: 1, seo: { indexable: false }, sections: [] } as never];
    const items = block(labels("sul", doc), "primary")!.items;
    expect(items.map((i) => i.href)).toEqual(["/sul/h/dia-dos-pais"]);
  });

  test("given the same real data, when the assembler runs on an unsaved form state, then the preview matches what the store would publish", () => {
    const doc = sulDoc();
    const data = navData({ region: "sul", doc, launched: ALL, coveredUfs: null });
    const draft: NavigationConfig = { statesBlock: { label: "Escolha", visible: true, order: 1 } };
    expect(assembleNavigation("sul", draft, data)).toEqual(resolveNavigation({ region: "sul", doc: { ...doc, navigation: draft }, launched: ALL, coveredUfs: null }));
  });
});

describe("regional theme: global, region override, inherit and no config", () => {
  const override = (colors: ThemeConfig["colors"]): ScopeDoc => ({ ...sulDoc(), theme: { mode: "override", colors } });

  test("given no theme anywhere, when resolved, then nothing is configured and no CSS variable is emitted (the current look, untouched)", () => {
    for (const region of ALL) {
      const t = resolveTheme(region, seed.docs[region], seed.docs.global);
      expect(t.mode).toBe("default");
      expect(themeCssVars(t.configured)).toEqual({});
      expect(t.effective).toEqual(themeDefaults(region));
    }
  });

  test("given a global palette but a region with no theme, when resolved, then the region does NOT change by itself", () => {
    const global: ScopeDoc = { ...structuredClone(seed.docs.global), theme: { mode: "override", colors: { mobileMenuBackground: "#123456" } } };
    expect(themeCssVars(resolveTheme("norte", seed.docs.norte, global).configured)).toEqual({});
  });

  test("given a region that overrides, when resolved, then its own colours win, the rest keep the current look, and the global is ignored", () => {
    const global: ScopeDoc = { ...structuredClone(seed.docs.global), theme: { mode: "override", colors: { mobileMenuBackground: "#123456" } } };
    const t = resolveTheme("sul", override({ mobileMenuBackground: "#1f2a44" }), global);
    expect(t.mode).toBe("override");
    expect(t.effective.mobileMenuBackground).toBe("#1f2a44");
    expect(t.effective.headerBackground).toBe("#4d543d"); // Sul's olive, as today
    expect(t.origin.mobileMenuBackground).toBe("own");
    expect(themeCssVars(t.configured)).toEqual({ "--nav-menu-bg": "#1f2a44" });
  });

  test("given a region that inherits, when the global changes, then the region follows it without any change of its own", () => {
    const inherit: ScopeDoc = { ...regionWithHome("norte"), theme: { mode: "inherit", colors: {} } };
    const before = resolveTheme("norte", inherit, { theme: { mode: "override", colors: { mobileMenuBackground: "#111111" } } });
    const after = resolveTheme("norte", inherit, { theme: { mode: "override", colors: { mobileMenuBackground: "#222222" } } });
    expect(before.effective.mobileMenuBackground).toBe("#111111");
    expect(after.effective.mobileMenuBackground).toBe("#222222");
    expect(after.origin.mobileMenuBackground).toBe("global");
    expect(after.effective.headerBackground).toBe("#234b50"); // what the global does not set stays Norte's petrol blue
  });

  test("given a region that inherits an empty global, when resolved, then it looks as it does today", () => {
    expect(themeCssVars(resolveTheme("sul", { theme: { mode: "inherit", colors: {} } }, seed.docs.global).configured)).toEqual({});
  });

  test("given a new principal colour, when resolved, then the header follows it unless the header has its own colour", () => {
    expect(resolveTheme("sul", override({ brandPrimary: "#003366" }), undefined).effective.headerBackground).toBe("#003366");
    expect(resolveTheme("sul", override({ brandPrimary: "#003366", headerBackground: "#000000" }), undefined).effective.headerBackground).toBe("#000000");
    expect(themeCssVars({ brandPrimary: "#003366" })).toMatchObject({ "--region-primary": "#003366", "--region-primary-rgb": "0 51 102", "--region-ink": "#003366" });
  });
});

describe("regional theme: contrast", () => {
  test("given the colours the storefront has today, when measured, then every pair passes AA", () => {
    for (const region of ALL) expect(themeContrast(themeDefaults(region)).map((p) => p.level)).toEqual(["ok", "ok", "ok", "ok"]);
  });

  test("given white text on a light menu, when measured, then it is blocking and the message says why", () => {
    const pair = themeContrast({ ...themeDefaults("sul"), mobileMenuBackground: "#f5f5f5" }).find((p) => p.id === "menu")!;
    expect(pair.level).toBe("blocking");
    expect(contrastMessage(pair)).toContain("quase ilegível");
  });

  test("given a mid-grey pair between 3:1 and 4.5:1, when measured, then it only warns", () => {
    const pair = themeContrast({ ...themeDefaults("sul"), mobileMenuBackground: "#767676", mobileMenuText: "#ffffff" }).find((p) => p.id === "menu")!;
    expect(pair.ratio).toBeGreaterThan(4.4);
    const weaker = themeContrast({ ...themeDefaults("sul"), mobileMenuBackground: "#8a8a8a" }).find((p) => p.id === "menu")!;
    expect(weaker.level).toBe("warning");
  });

  test("given a region with no theme, when problems are listed, then there are none; with a bad palette they are listed", () => {
    expect(themeProblems("sul", seed.docs.sul, seed.docs.global)).toEqual({ blocking: [], warnings: [] });
    const bad: ScopeDoc = { ...sulDoc(), theme: { mode: "override", colors: { headerText: "#4d543f" } } };
    expect(themeProblems("sul", bad, seed.docs.global).blocking).toHaveLength(1);
  });

  test("given a global palette, when it is checked, then only the regions that inherit it count", () => {
    const global: ScopeDoc = { ...structuredClone(seed.docs.global), theme: { mode: "override", colors: { headerText: "#ffffff" } } };
    // white on Centro-Oeste's terracotta passes; on a light region colour it would not — only inheriting regions are checked
    expect(themeProblems("global", global, global, []).blocking).toEqual([]);
    const pale: ScopeDoc = { ...structuredClone(seed.docs.global), theme: { mode: "override", colors: { headerBackground: "#f0f0f0", headerText: "#ffffff" } } };
    expect(themeProblems("global", pale, pale, ["norte"]).blocking[0]).toContain("Norte: ");
  });

  test("given a composed bundle, when the publish pre-flight checks the palette, then an unreadable one is refused as a publish blocker", () => {
    const bundle = structuredClone(seed);
    bundle.docs.sul = { ...bundle.docs.sul, theme: { mode: "override", colors: { pageBackground: "#111111" } } };
    expect(themeBlockers(bundle, "sul")[0]).toContain("Aparência:");
    bundle.docs.sul = { ...bundle.docs.sul, theme: { mode: "override", colors: { pageBackground: "#ffffff" } } };
    expect(themeBlockers(bundle, "sul")).toEqual([]);
  });
});

describe("navigation and theme in the document (schema, backwards compatibility, tolerant reader)", () => {
  test("given a document from before this feature (no navigation, no theme), when validated, then it is still valid", () => {
    expect(validateBundle(seed).ok).toBe(true);
    for (const scope of ["global", "sul", "norte", "centro-oeste"] as const) expect(validateScopeDoc(seed.docs[scope]).ok).toBe(true);
  });

  test("given bad navigation input, when validated, then labels, positions, unknown fields and duplicate destinations are refused", () => {
    const good: NavigationConfig = { primaryBlock: { label: "Comprar", visible: true, order: 10 } };
    expect(validateNavigation(good, "sul").ok).toBe(true);
    expect(validateNavigation({ primaryBlock: { label: "", visible: true, order: 10 } }, "sul").ok).toBe(false);
    expect(validateNavigation({ primaryBlock: { label: "x".repeat(41), visible: true, order: 10 } }, "sul").ok).toBe(false);
    expect(validateNavigation({ primaryBlock: { label: "Linha\nquebrada", visible: true, order: 10 } }, "sul").ok).toBe(false);
    expect(validateNavigation({ primaryBlock: { label: "A", visible: true, order: -1 } }, "sul").ok).toBe(false);
    expect(validateNavigation({ statesList: ["AC"] }, "sul").ok).toBe(false); // no manual list of states, ever
    expect(validateNavigation({ primaryLinks: [{ id: "a", destination: "https://evil.example", label: "A", visible: true, order: 1 }] }, "sul").ok).toBe(false);
    expect(validateNavigation({ primaryLinks: [{ id: "a", destination: "styles", label: "A", visible: true, order: 1 }, { id: "b", destination: "styles", label: "B", visible: true, order: 2 }] }, "sul").ok).toBe(false);
    expect(validateNavigation(good, "global").ok).toBe(false);
  });

  test("given bad theme input, when validated, then unknown colours, non-hex values and inherit-on-global are refused", () => {
    expect(validateTheme({ mode: "override", colors: { accent: "#e39a2d" } }, "norte").ok).toBe(true);
    expect(validateTheme({ mode: "override", colors: { accent: "red" } }, "norte").ok).toBe(false);
    expect(validateTheme({ mode: "override", colors: { accent: "url(x)" } }, "norte").ok).toBe(false);
    expect(validateTheme({ mode: "override", colors: { sidebar: "#000000" } }, "norte").ok).toBe(false);
    expect(validateTheme({ mode: "inherit", colors: {} }, "global").ok).toBe(false);
    expect(validateTheme({ mode: "inherit", colors: {} }, "sul").ok).toBe(true);
    expect(validateTheme({ mode: "sepia", colors: {} }, "sul").ok).toBe(false);
  });

  test("given a published file with an invalid theme, when read, then only the theme is dropped, with a diagnostic, and the region keeps its home", () => {
    const raw = structuredClone(seed) as unknown as { docs: Record<string, Record<string, unknown>> };
    raw.docs.sul.theme = { mode: "override", colors: { accent: "not-a-colour" } };
    raw.docs.sul.navigation = { statesList: ["AC"] };
    const { bundle, diagnostics } = sanitizeBundle(raw, seed);
    expect(bundle!.docs.sul.theme).toBeUndefined();
    expect(bundle!.docs.sul.navigation).toBeUndefined();
    expect(bundle!.docs.sul.home!.sections.length).toBe(seed.docs.sul.home!.sections.length);
    expect(diagnostics.join(" ")).toContain("theme is invalid");
    expect(diagnostics.join(" ")).toContain("navigation is invalid");
  });

  test("given a valid theme and navigation in a published file, when read, then both survive", () => {
    const raw = structuredClone(seed) as unknown as { docs: Record<string, Record<string, unknown>> };
    raw.docs.norte.theme = { mode: "inherit", colors: {} };
    raw.docs.global.theme = { mode: "override", colors: { mobileMenuBackground: "#1f2a44" } };
    raw.docs.sul.navigation = { statesBlock: { label: "Por estado", visible: true, order: 5 } };
    const { bundle, diagnostics } = sanitizeBundle(raw, seed);
    expect(diagnostics).toEqual([]);
    expect(bundle!.docs.norte.theme).toEqual({ mode: "inherit", colors: {} });
    expect(bundle!.docs.global.theme!.colors.mobileMenuBackground).toBe("#1f2a44");
    expect(bundle!.docs.sul.navigation!.statesBlock!.label).toBe("Por estado");
  });
});

describe("editing: draft operations, forms and the publish screen's list of changes", () => {
  const nav = (over: Record<string, string> = {}) =>
    form({
      primaryBlock_label: "Comprar", primaryBlock_visible: "on", primaryBlock_order: "10",
      statesBlock_label: "Estados do Sul", statesBlock_visible: "on", statesBlock_order: "20",
      regionsBlock_label: "Explorar outras regiões", regionsBlock_visible: "on", regionsBlock_order: "30",
      link_styles_label: "Estilos", link_styles_visible: "on", link_styles_order: "10",
      link_speech_label: "Fala daqui", link_speech_visible: "on", link_speech_order: "20",
      link_states_label: "Estados", link_states_visible: "on", link_states_order: "30",
      ...over,
    });

  test("given the navigation form, when parsed, then it becomes the full validated configuration", () => {
    const parsed = parseNavigationForm(nav({ statesBlock_label: "Por estado", link_speech_visible: "" }), "sul");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.statesBlock).toEqual({ label: "Por estado", visible: true, order: 20 });
      expect(parsed.value.primaryLinks!.find((l) => l.destination === "speech")!.visible).toBe(false);
    }
  });

  test("given an invalid navigation form, when parsed, then the errors are in plain Portuguese, per field", () => {
    const empty = parseNavigationForm(nav({ regionsBlock_label: "  " }), "sul");
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.errors[0]).toContain("Bloco de outras regiões: o rótulo");
    const order = parseNavigationForm(nav({ primaryBlock_order: "abc" }), "sul");
    expect(order.ok).toBe(false);
  });

  test("given the theme form, when parsed, then colours are normalised, empty means not set, and bad hex is refused", () => {
    expect(normalizeHex("4D543D")).toBe("#4d543d");
    expect(normalizeHex("")).toBe("");
    expect(normalizeHex("#12345")).toBeNull();
    const ok = parseThemeForm(form({ mode: "override", color_mobileMenuBackground: "1F2A44", color_accent: "" }), "norte");
    expect(ok).toEqual({ ok: true, value: { mode: "override", colors: { mobileMenuBackground: "#1f2a44" } } });
    expect(parseThemeForm(form({ mode: "override", color_accent: "#zzzzzz" }), "norte").ok).toBe(false);
    expect(parseThemeForm(form({ mode: "none" }), "norte")).toEqual({ ok: true, value: null });
    expect(parseThemeForm(form({ mode: "inherit", color_accent: "#ffffff" }), "norte")).toEqual({ ok: true, value: { mode: "inherit", colors: {} } }); // an inheriting region keeps no colours of its own
    expect(parseThemeForm(form({ mode: "inherit" }), "global").ok).toBe(false);
    expect(parseThemeForm(form({}), "sul").ok).toBe(false);
  });

  test("given set-navigation and set-theme, when applied, then the document is validated, and null goes back to the default", () => {
    const doc = sulDoc();
    const withNav = applyOp(doc, { type: "set-navigation", navigation: { statesBlock: { label: "Por estado", visible: true, order: 5 } } }, ctx);
    expect(withNav.ok && withNav.doc.navigation?.statesBlock?.label).toBe("Por estado");
    const reset = withNav.ok ? applyOp(withNav.doc, { type: "set-navigation", navigation: null }, ctx) : withNav;
    expect(reset.ok && "navigation" in reset.doc).toBe(false);
    const withTheme = applyOp(doc, { type: "set-theme", theme: { mode: "override", colors: { accent: "#123456" } } }, ctx);
    expect(withTheme.ok && withTheme.doc.theme?.colors.accent).toBe("#123456");
    expect(applyOp(doc, { type: "set-theme", theme: { mode: "override", colors: { accent: "nope" } } }, ctx).ok).toBe(false);
    expect(applyOp(seed.docs.global, { type: "set-navigation", navigation: { statesBlock: { label: "x", visible: true, order: 1 } } }, ctx).ok).toBe(false);
    expect(applyOp(doc, { type: "set-theme", theme: { mode: "inherit", colors: {} } }, ctx).ok).toBe(true);
    expect(applyOp(seed.docs.global, { type: "set-theme", theme: { mode: "inherit", colors: {} } }, ctx).ok).toBe(false);
    expect(doc.navigation).toBeUndefined(); // the input document is never mutated
  });

  test("given a draft that changes only the menu or the palette, when diffed, then the publish screen lists it (the change is not invisible)", () => {
    const published = sulDoc();
    expect(diffDocs(published, published)).toEqual([]);
    const draft: ScopeDoc = { ...published, navigation: { statesBlock: { label: "Por estado", visible: false, order: 5 } }, theme: { mode: "override", colors: { mobileMenuBackground: "#1f2a44" } } };
    const texts = diffDocs(published, draft).map((c) => c.text);
    expect(texts.some((t) => t.includes("bloco Estados da região") && t.includes("oculto"))).toBe(true);
    expect(texts).toContain("Aparência: visual atual (sem configuração) → paleta própria");
    expect(texts).toContain("Aparência, fundo do menu mobile: padrão → #1f2a44");
  });

  test("given a global palette draft, when diffed, then the change is labelled as the Use Origens palette", () => {
    const draft: ScopeDoc = { ...structuredClone(seed.docs.global), theme: { mode: "override", colors: { accent: "#ffaa00" } } };
    expect(diffDocs(seed.docs.global, draft).map((c) => c.text)).toEqual(["Aparência global (Use Origens), cor de destaque: padrão → #ffaa00"]);
  });
});

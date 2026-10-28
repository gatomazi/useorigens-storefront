/**
 * Regional navigation and visual identity of the storefront chrome, as CMS configuration. Pure (no I/O, no `server-only`): the admin
 * (draft validation, live preview), the publisher and the storefront run the very same rules.
 *
 * NAVIGATION — the editor controls labels, order and visibility of a few BLOCKS and of the known primary links; never a list of states or
 * regions. Those come from real data (`resolveNavigation`): the states of the region that have products, the regions that are launched.
 * THEME — a palette that is global ("Use Origens") or per region: a region either inherits the global palette or overrides it. A region
 * with no theme keeps exactly the look it has today (`resolveTheme` emits no CSS variable at all in that case).
 */
import { REGION_SLUGS, REGIONS, STATE_NAMES, type RegionSlug } from "../geo/regions";
import { REGION_THEME } from "../theme/region-theme";
import { contrastRatio, rgbTriplet } from "./color";
import { headerLinks } from "./nav";
import { NAV_DESTINATIONS, THEME_COLOR_KEYS, type NavBlockConfig, type NavDestination, type NavigationConfig, type ThemeColorKey, type ThemeColors } from "./navigation-schema";
import { hasEditorialChrome, homeThemeOf, type CollectionHighlight, type MenuHighlightColors, type Scope, type ScopeDoc } from "./schema";

export * from "./navigation-schema";

const ANCHOR_OF: Record<NavDestination, string> = { styles: "estilos", speech: "fala", states: "estados" };
const DESTINATION_OF: Record<string, NavDestination> = Object.fromEntries(NAV_DESTINATIONS.map((d) => [ANCHOR_OF[d], d]));
export const NAV_DESTINATION_LABEL: Record<NavDestination, string> = { styles: "Estilos", speech: "Fala daqui", states: "Estados" };

export const THEME_COLOR_LABEL: Record<ThemeColorKey, string> = {
  brandPrimary: "Cor principal",
  headerBackground: "Fundo do header",
  headerText: "Texto do header",
  mobileMenuBackground: "Fundo do menu mobile",
  mobileMenuText: "Texto do menu mobile",
  accent: "Cor de destaque",
  pageBackground: "Fundo da página",
  pageText: "Texto principal",
};

// ── Defaults (what the storefront does with no configuration) ─────────────────────────────────────────────────

export const DEFAULT_PRIMARY_BLOCK_LABEL = "Comprar";
export const DEFAULT_CATEGORIES_BLOCK_LABEL = "Categorias";
export const DEFAULT_REGIONS_BLOCK_LABEL = "Explorar outras regiões";
export const defaultStatesBlockLabel = (region: RegionSlug): string => `Estados do ${REGIONS[region].name}`;

export const DEFAULT_ORDER = { primary: 10, categories: 15, states: 20, regions: 30 } as const;

/** The colours the storefront uses today, per region: the fallback of every colour the CMS does not set. */
export function themeDefaults(region: RegionSlug, brandPrimary?: string): ThemeColors {
  const t = REGION_THEME[region];
  const brand = brandPrimary ?? t.primary;
  return {
    brandPrimary: brand,
    headerBackground: brand, // the header is always the region's primary colour today
    headerText: "#ffffff",
    mobileMenuBackground: brand, // the drawer follows the region's primary colour, like the header
    mobileMenuText: "#ffffff",
    accent: t.accent,
    pageBackground: "#e5e5e5", // --ground: the flat grey behind every INK product photo
    pageText: "#000000",
  };
}

// ── Theme resolution ──────────────────────────────────────────────────────────────────────────────────────────

export type ThemeOrigin = "default" | "global" | "own";
export type ResolvedTheme = {
  /** `default` = nothing configured: the storefront's current look, untouched. */
  mode: "default" | "inherit" | "override";
  /** Only the colours somebody actually set (the CSS variables to emit). */
  configured: Partial<ThemeColors>;
  /** Every colour, configured or not: what the screen shows and what contrast is measured on. */
  effective: ThemeColors;
  origin: Record<ThemeColorKey, ThemeOrigin>;
};

/**
 * Region with no theme → current look; `override` → its own colours over the current look; `inherit` → the global colours over the current look. Each home
 * theme keeps its own palette (`theme` of the theme in use; the editorial one starts with the editorial colours), so nothing here depends on the theme.
 */
export function resolveTheme(region: RegionSlug, doc: Pick<ScopeDoc, "theme"> | undefined, global: Pick<ScopeDoc, "theme"> | undefined): ResolvedTheme {
  const own = doc?.theme;
  const mode: ResolvedTheme["mode"] = !own ? "default" : own.mode;
  const configured: Partial<ThemeColors> = mode === "override" ? { ...own!.colors } : mode === "inherit" ? { ...(global?.theme?.colors ?? {}) } : {};
  const defaults = themeDefaults(region, configured.brandPrimary);
  const effective = { ...defaults, ...configured };
  const origin = Object.fromEntries(THEME_COLOR_KEYS.map((k) => [k, k in configured ? (mode === "inherit" ? "global" : "own") : "default"])) as Record<ThemeColorKey, ThemeOrigin>;
  return { mode, configured, effective, origin };
}

/**
 * What the editorial theme (and the seasonal ones made from it) adds beyond its palette: the strip above the header and the footer on the palette's main colour (so they follow it when the
 * owner edits it; the strip's own colours, CMS "Faixa do topo", still win). Empty for the original theme: nothing changes.
 */
export function homeThemeCssVars(doc: Pick<ScopeDoc, "homeTheme"> | undefined, effective: ThemeColors): Record<string, string> {
  if (!hasEditorialChrome(homeThemeOf(doc))) return {};
  return { "--strip-bg": effective.brandPrimary, "--footer-bg": effective.brandPrimary };
}

/**
 * The CSS custom properties a resolved theme adds to the region wrapper: none at all when nothing is configured. With `effective`, a configured accent
 * that reads as TEXT on the page ground (3:1, large type) also becomes `--region-accent-ink`: the colour of the few words the store draws in the accent
 * (the last line of the editorial opening, the UF of a state). Unset, those words keep the region's primary colour (`var(--region-accent-ink, …)`).
 */
export function themeCssVars(configured: Partial<ThemeColors>, effective?: ThemeColors): Record<string, string> {
  const vars: Record<string, string> = {};
  const c = configured;
  if (c.brandPrimary) Object.assign(vars, { "--region-primary": c.brandPrimary, "--region-primary-rgb": rgbTriplet(c.brandPrimary), "--region-ink": c.brandPrimary });
  if (c.accent) Object.assign(vars, { "--region-accent": c.accent, "--region-fill": c.accent });
  if (c.accent && effective && contrastRatio(c.accent, effective.pageBackground) >= CONTRAST_BLOCKING) vars["--region-accent-ink"] = c.accent;
  if (c.headerBackground) vars["--nav-header-bg"] = c.headerBackground;
  if (c.headerText) vars["--nav-header-text"] = c.headerText;
  if (c.mobileMenuBackground) vars["--nav-menu-bg"] = c.mobileMenuBackground;
  if (c.mobileMenuText) vars["--nav-menu-text"] = c.mobileMenuText;
  if (c.pageBackground) vars["--ground"] = c.pageBackground;
  if (c.pageText) vars["--ink"] = c.pageText;
  return vars;
}

// ── Contrast ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Same thresholds as the section editor (admin/contrast.ts): under 3:1 the text is practically unreadable (blocks a publish); under 4.5:1 (WCAG AA) only warns. */
export const CONTRAST_BLOCKING = 3;
export const CONTRAST_AA = 4.5;

export type ContrastPair = { id: "header" | "menu" | "page" | "accent"; label: string; foreground: string; background: string; ratio: number; level: "ok" | "warning" | "blocking" };

export function themeContrast(colors: ThemeColors): ContrastPair[] {
  const pair = (id: ContrastPair["id"], label: string, foreground: string, background: string, kind: "text" | "graphic"): ContrastPair => {
    const ratio = contrastRatio(foreground, background);
    // The accent is a decorative marker, not text: it needs 3:1 (WCAG 1.4.11), and never blocks.
    const level = kind === "graphic" ? (ratio < CONTRAST_BLOCKING ? "warning" : "ok") : ratio < CONTRAST_BLOCKING ? "blocking" : ratio < CONTRAST_AA ? "warning" : "ok";
    return { id, label, foreground, background, ratio, level };
  };
  return [
    pair("header", "Texto do header sobre o fundo do header", colors.headerText, colors.headerBackground, "text"),
    pair("menu", "Texto do menu mobile sobre o fundo do menu", colors.mobileMenuText, colors.mobileMenuBackground, "text"),
    pair("page", "Texto principal sobre o fundo da página", colors.pageText, colors.pageBackground, "text"),
    pair("accent", "Cor de destaque sobre o fundo do menu mobile", colors.accent, colors.mobileMenuBackground, "graphic"),
  ];
}

/**
 * The readability of one highlighted collection of the bar, where it really shows (`resolveTheme`): the desktop header and the phone menu. Its text over
 * its button (each falling back to that surface's own colour), at the worse of the two, blocks a publish under 3:1 and warns under AA; the line under it
 * is a marker (under 3:1 over the button, a warning). Nothing to check when it sets neither text nor button colour (only the line).
 */
export function highlightContrast(colors: MenuHighlightColors, theme: Pick<ThemeColors, "headerBackground" | "headerText" | "mobileMenuBackground" | "mobileMenuText">): { level: "blocking" | "warning"; message: string }[] {
  const surfaces = [
    { background: colors.background ?? theme.headerBackground, text: colors.text ?? theme.headerText },
    { background: colors.background ?? theme.mobileMenuBackground, text: colors.text ?? theme.mobileMenuText },
  ];
  const out: { level: "blocking" | "warning"; message: string }[] = [];
  if (colors.background || colors.text) {
    const ratio = Math.min(...surfaces.map((s) => contrastRatio(s.text, s.background)));
    if (ratio < CONTRAST_BLOCKING) out.push({ level: "blocking", message: `texto sobre o botão com contraste ${ratio.toFixed(1)}:1, quase ilegível (mínimo aceito para publicar: ${CONTRAST_BLOCKING}:1)` });
    else if (ratio < CONTRAST_AA) out.push({ level: "warning", message: `texto sobre o botão com contraste ${ratio.toFixed(1)}:1, abaixo do AA (${CONTRAST_AA}:1)` });
  }
  if (colors.underline) {
    const ratio = Math.min(...surfaces.map((s) => contrastRatio(colors.underline!, s.background)));
    if (ratio < CONTRAST_BLOCKING) out.push({ level: "warning", message: `linha embaixo com contraste ${ratio.toFixed(1)}:1 sobre o botão (recomendado: ${CONTRAST_BLOCKING}:1)` });
  }
  return out;
}

/** Contrast problems of a region's highlighted collections, by name (`nameOf`, e.g. from the synced collections; the id otherwise). */
export function highlightProblems(region: RegionSlug, doc: ScopeDoc | undefined, global: Pick<ScopeDoc, "theme"> | undefined, nameOf: (h: CollectionHighlight) => string = (h) => `coleção #${h.collectionId}`): { blocking: string[]; warnings: string[] } {
  const header = resolveTheme(region, doc, global).effective;
  const blocking: string[] = [];
  const warnings: string[] = [];
  for (const h of doc?.collections?.highlights ?? []) {
    for (const issue of highlightContrast(h, header)) (issue.level === "blocking" ? blocking : warnings).push(`Destaque de "${nameOf(h)}" no menu: ${issue.message}.`);
  }
  return { blocking, warnings };
}

export const contrastMessage = (p: ContrastPair): string =>
  p.level === "blocking"
    ? `${p.label}: contraste ${p.ratio.toFixed(1)}:1, quase ilegível (mínimo aceito para publicar: ${CONTRAST_BLOCKING}:1).`
    : `${p.label}: contraste ${p.ratio.toFixed(1)}:1, abaixo do AA (${p.id === "accent" ? CONTRAST_BLOCKING : CONTRAST_AA}:1).`;

/**
 * Contrast problems of what a region would show. The global palette is checked against the own defaults of every region that INHERITS it
 * (`inheriting`) for the colours it leaves unset, because such a region gets exactly that mix.
 */
export function themeProblems(scope: Scope, doc: Pick<ScopeDoc, "theme">, global: Pick<ScopeDoc, "theme"> | undefined, inheriting: readonly RegionSlug[] = REGION_SLUGS): { blocking: string[]; warnings: string[] } {
  const regions = scope === "global" ? inheriting : [scope as RegionSlug];
  const blocking: string[] = [];
  const warnings: string[] = [];
  for (const region of regions) {
    const resolved = scope === "global" ? resolveTheme(region, { theme: { mode: "inherit", colors: {} } }, doc) : resolveTheme(region, doc, global);
    if (Object.keys(resolved.configured).length === 0) continue;
    const prefix = scope === "global" ? `${REGIONS[region].name}: ` : "";
    for (const p of themeContrast(resolved.effective)) {
      if (p.level === "blocking") blocking.push(prefix + contrastMessage(p));
      else if (p.level === "warning") warnings.push(prefix + contrastMessage(p));
    }
  }
  return { blocking, warnings };
}

// ── Navigation resolution ─────────────────────────────────────────────────────────────────────────────────────

export const regionPath = (region: RegionSlug): string => `/${region}`;
export const statePath = (region: RegionSlug, uf: string): string => `/${region}/${uf.toLowerCase()}`;

export type NavItemData = {
  label: string;
  href: string;
  /** A short mark drawn before the label in the open menus: a state's UF. */
  badge?: string;
  /** One short line under the label in the open menus: a state's number of places, a collection's description. */
  detail?: string;
  /** A highlighted collection of the bar: its button, text and line colours (`collections.highlights`). */
  highlight?: MenuHighlightColors;
  /** Present only on state entries, so `select_state` can still fire (plain data: the menu is rendered from a Server Component). */
  trackState?: { state: string; region: string };
};
export type NavBlockData = { kind: "primary" | "categories" | "states" | "regions"; label: string; items: NavItemData[] };
/**
 * `primary` = the links of the home's sections and pages; `collections` = the collections the owner put on the bar (desktop bar only: on the phone they
 * open "Categorias"); `categories` = every collection of the menu, the bar's first, under `categoriesLabel` (the desktop dropdown).
 */
export type ResolvedNavigation = {
  blocks: NavBlockData[];
  primary: NavItemData[];
  collections: NavItemData[];
  categories: NavItemData[];
  categoriesLabel: string;
  states: NavItemData[];
  regions: NavItemData[];
};

/** A primary link the region's home really offers, before the CMS labels / hides / re-orders it. `destination` is null for links the CMS does not manage (custom sections, pages). */
export type PrimaryCandidate = NavItemData & { destination: NavDestination | null };
/**
 * The REAL data a menu is made of, independent of any editor choice here: what the home offers, the region's collection menu (resolved on the server from
 * the synced collections: on the bar, and all of "Categorias"), the launched states, the launched other regions.
 */
export type NavData = { primary: PrimaryCandidate[]; collections: NavItemData[]; categories: NavItemData[]; states: NavItemData[]; regions: NavItemData[] };
export type CollectionNavData = { top: NavItemData[]; categories: NavItemData[] };

export type NavigationInput = {
  region: RegionSlug;
  /** The region's PUBLISHED document (undefined while the config-driven home is off). */
  doc: ScopeDoc | undefined;
  /** Publicly launched regions. */
  launched: readonly RegionSlug[];
  /** UFs of this region that have at least one product; `null` = unknown (no catalog): show every state of the region, never an empty menu. */
  coveredUfs: readonly string[] | null;
  /** The region's collection menu with links (`catalog/collection-menu.ts`); none = no collection in the header. */
  collections?: CollectionNavData;
  /** Per UF, how many places the state has ("399 cidades"), drawn under its name in the open menus; absent = the name alone. */
  stateDetails?: Readonly<Record<string, string>>;
};

export function navData(input: NavigationInput): NavData {
  const covered = input.coveredUfs && input.coveredUfs.length > 0 ? new Set(input.coveredUfs) : null;
  return {
    primary: headerLinks(input.doc).map((l) => ({ label: l.label, href: l.href ? l.href(input.region) : `${regionPath(input.region)}#${l.anchor}`, destination: DESTINATION_OF[l.anchor] ?? null })),
    collections: input.collections?.top ?? [],
    categories: input.collections?.categories ?? [],
    // The region's own (editorial) order, as the storefront has always listed them; only launched states (with products) when that is known.
    states: REGIONS[input.region].ufs
      .filter((uf) => (covered ? covered.has(uf) : true))
      .map((uf) => ({ label: STATE_NAMES[uf], href: statePath(input.region, uf), badge: uf, ...(input.stateDetails?.[uf] ? { detail: input.stateDetails[uf] } : {}), trackState: { state: uf, region: input.region } })),
    regions: REGION_SLUGS.filter((slug) => slug !== input.region && input.launched.includes(slug)).map((slug) => ({ label: REGIONS[slug].name, href: regionPath(slug) })),
  };
}

const blockOf = (config: NavBlockConfig | undefined, label: string, order: number): NavBlockConfig => config ?? { label, visible: true, order };

/** The primary links: what the home really has, with the CMS label / visibility / order laid over the known ones (the rest keep the home's own order and label). */
function orderedPrimary(config: NavigationConfig | undefined, candidates: PrimaryCandidate[]): NavItemData[] {
  return candidates
    .map((c, index) => {
      const own = c.destination ? config?.primaryLinks?.find((l) => l.destination === c.destination) : undefined;
      return { item: { label: own?.label ?? c.label, href: c.href } satisfies NavItemData, visible: own?.visible ?? true, order: own?.order ?? (index + 1) * 10, index };
    })
    .filter((entry) => entry.visible)
    .sort((a, b) => a.order - b.order || a.index - b.index)
    .map((entry) => entry.item);
}

/** Lays a navigation configuration over real data. Also what the admin preview runs, live, on the editor's unsaved choices. */
export function assembleNavigation(region: RegionSlug, config: NavigationConfig | undefined, data: NavData): ResolvedNavigation {
  const primary = orderedPrimary(config, data.primary);
  const categoriesBlock = blockOf(config?.categoriesBlock, DEFAULT_CATEGORIES_BLOCK_LABEL, DEFAULT_ORDER.categories);
  const blocks: { block: NavBlockConfig; data: NavBlockData }[] = [
    { block: blockOf(config?.primaryBlock, DEFAULT_PRIMARY_BLOCK_LABEL, DEFAULT_ORDER.primary), data: { kind: "primary", label: "", items: primary } },
    { block: categoriesBlock, data: { kind: "categories", label: "", items: data.categories } },
    { block: blockOf(config?.statesBlock, defaultStatesBlockLabel(region), DEFAULT_ORDER.states), data: { kind: "states", label: "", items: data.states } },
    { block: blockOf(config?.regionsBlock, DEFAULT_REGIONS_BLOCK_LABEL, DEFAULT_ORDER.regions), data: { kind: "regions", label: "", items: data.regions } },
  ];
  const visible = blocks
    .map((entry, index) => ({ ...entry, index }))
    .filter(({ block, data: b }) => block.visible && b.items.length > 0) // a block with nothing to show is never drawn
    .sort((a, b) => a.block.order - b.block.order || a.index - b.index)
    .map(({ block, data: b }) => ({ ...b, label: block.label }));
  // The desktop dropdowns read the same data: a block the editor hides disappears from both. The primary LINKS have their own visibility (the
  // "Comprar" title only groups them on mobile).
  const shown = (kind: NavBlockData["kind"], items: NavItemData[]) => (visible.some((b) => b.kind === kind) ? items : []);
  return {
    blocks: visible,
    primary,
    collections: data.collections,
    categories: shown("categories", data.categories),
    categoriesLabel: categoriesBlock.label,
    states: shown("states", data.states),
    regions: shown("regions", data.regions),
  };
}

export const resolveNavigation = (input: NavigationInput): ResolvedNavigation => assembleNavigation(input.region, input.doc?.navigation, navData(input));

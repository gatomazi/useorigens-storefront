/**
 * Pure editing operations on a scope document (the Sul home). The editor never mutates JSON by hand: every action is one of these ops,
 * applied to the current draft and re-validated with the SAME validators the publisher and the storefront use. Nothing here does I/O.
 *
 * Structural rules enforced here (not just in the UI):
 *  - the hero is always first and the footer always last; neither moves, is removed or is deactivated;
 *  - only sections created in the CMS (id `custom-…`) can be removed; the seeded home sections can be edited, reordered and hidden;
 *  - a section can only be moved among the movable ones (never past the hero or the footer);
 *  - a duplicate gets a new id and a unique anchor and starts INACTIVE, so a copy never appears on the home by accident.
 */
import { sectionsUsing } from "../site-config/collections-enabled";
import { effectiveMenu, movedOnTop, withMenu, withMenuPosition, type MenuPosition } from "../site-config/collection-menu";
import { SINGLETON_TEMPLATES, structuredDefaults, uniqueAnchor, type StructuredTemplate } from "../site-config/structured";
import { newCollectionLanding, newPage, uniqueSlug } from "../site-config/pages";
import type { NavigationConfig, ThemeConfig } from "../site-config/navigation-schema";
import type { PromotionsConfig } from "../site-config/promotions-schema";
import type { TopBarConfig } from "../site-config/top-bar-schema";
import type { CardsConfig } from "../site-config/cards-schema";
import type { CarouselEndConfig } from "../site-config/carousel-end-schema";
import type { MundoModo } from "../site-config/mundo-schema";
import type { InkThemeConfig } from "../site-config/ink-theme-schema";
import { withStatePageSection, type StatePageSection } from "../site-config/state-page-schema";
import { validateCustomizer, validatePage, validateScopeDoc, validateSection, homeThemeOf, type Appearance, type CollectionNote, type CollectionRef, type HomeThemeName, type StateSubcategories, type Customizer, type CustomizerSource, type Destination, type Page, type PageBackdrop, type PageKind, type PageSeo, type ProductDisplay, type Section, type ScopeDoc, type Source, type TrackingConfig } from "../site-config/schema";
import { HOME_THEME_LABEL, hasHomeTheme, newEditorialTheme, swapHomeTheme, type EditorialCollections } from "../site-config/home-themes";
import type { RegionSlug } from "../geo/regions";

export type Editable = Pick<Section, "title" | "subtitle" | "cta" | "layout" | "source" | "fallback" | "appearance" | "count" | "stateCovers" | "featured" | "featuredRotation" | "heroColors" | "nav" | "customizerCard" | "tiles" | "grid" | "variant">;

export type DraftOp =
  /** `display: "grid"` creates the section already as a product grid (absent = a carousel). */
  | { type: "add-carousel"; title: string; source: Source; cta?: Section["cta"]; display?: ProductDisplay }
  /** Adds one of the structured home components (city styles, state chooser, regional campaign, image grid) with the defaults of THIS region. */
  | { type: "add-structured"; template: StructuredTemplate }
  /** A split campaign that opens one personalisation model (e.g. "Localidade"): its name, description and picture, the button to its page. */
  | { type: "add-customizer-section"; customizerId: string }
  | { type: "duplicate"; id: string }
  | { type: "move"; id: string; direction: "up" | "down" }
  /** The whole order at once (drag and drop in the panel): the same sections, the hero first and the footer last, fixed sections where they were. */
  | { type: "reorder"; ids: string[] }
  | { type: "set-active"; id: string; active: boolean }
  | { type: "remove"; id: string }
  | { type: "update"; id: string; patch: Partial<Editable> }
  | ({ type: "set-collection-enabled"; enabled: boolean } & CollectionRef)
  /**
   * The order and hidden products of ONE collection in this region (every section built on it and its collection page follow them). Both lists empty =
   * INK's order; the entry stays, as "INK's order", only while an older section still carries an order of its own that it must override.
   */
  | ({ type: "set-collection-arrangement"; productIds: string[]; hiddenIds: string[] } & CollectionRef)
  /** Every link to the INK page of one of these collections (buttons, menu links, grid tiles; home and pages) leads to the collection's page on the site instead. */
  | { type: "link-collection-pages"; refs: CollectionRef[] }
  /** Several operations as one save: all of them apply, or none (the first refusal comes back). */
  | { type: "batch"; ops: DraftOp[] }
  /**
   * Places a collection in the region's collection menu (storefront header and INK navbar): "none" | "top" | "more" ("Categorias"). `isPublic` = public on
   * INK, which decides what "no choice" means for it (public: in "Categorias"; internal: out). Independent of `set-collection-enabled`.
   */
  | ({ type: "set-collection-menu-position"; position: MenuPosition; isPublic: boolean } & CollectionRef)
  /** Moves a collection one step on the bar. */
  | ({ type: "move-collection-menu"; direction: "up" | "down" } & CollectionRef)
  /** Gives a document from before the collection menu its own menu, unchanged (the Worker then follows it once published). */
  | { type: "adopt-collection-menu" }
  /**
   * The home's theme: the current sections are kept under the current theme and the chosen theme's come back (the editorial one, the first time, is
   * built from the current sections with `collections`, the real collections the server found in the region's store).
   */
  | { type: "set-home-theme"; theme: HomeThemeName; collections?: EditorialCollections }
  /** Sets up a theme the region does not have yet (the editorial one, built from the current sections), WITHOUT putting it in use. */
  | { type: "create-home-theme"; theme: HomeThemeName; collections?: EditorialCollections }
  /**
   * Any other operation, applied to the sections (and palette) of `theme` instead of the theme in use: the panel edits a kept theme in place, and the
   * theme in use is left exactly as it was.
   */
  | { type: "in-home-theme"; theme: HomeThemeName; op: DraftOp }
  /** The short descriptions of the menu's collections, all at once (the panel's form). An empty list removes them. */
  | { type: "set-collection-descriptions"; descriptions: CollectionNote[] }
  /**
   * The state page's CATEGORIES (`collections.stateCategories`): puts a collection in (`on`) or takes it out, or moves it one step. `base` is what the
   * list is now (the menu bar while the region has no list of its own, computed by the caller), so the first edit starts from it instead of from nothing.
   */
  | ({ type: "set-state-category"; on: boolean; base: CollectionRef[] } & CollectionRef)
  | ({ type: "move-state-category"; direction: "up" | "down"; base: CollectionRef[] } & CollectionRef)
  /** Back to the menu bar. */
  | { type: "reset-state-categories" }
  /**
   * The state page's SUBCATEGORIES (`collections.stateSubcategories`, automatic): takes a collection out (`on: false`) or puts it back / brings an
   * internal one in (`on: true`). `isPublic` = public on INK (only those are automatic). `base` = the current choice in that shape, computed by the
   * caller (from a legacy `stateRows` list, if the document still has one, which this edit then replaces).
   */
  | ({ type: "set-state-subcategory"; on: boolean; isPublic: boolean; base: StateSubcategories } & CollectionRef)
  /** Back to automatic: every public collection that is neither a state's nor a category (a hand-picked list is dropped too). */
  | { type: "reset-state-subcategories" }
  /**
   * The state page's SUBCATEGORIES chosen by hand (`collections.stateSubcategoryList`). `start-…` writes the list as `base` (what shows today, computed
   * by the caller), so switching to manual changes nothing on the site; `set-…`/`move-…` put one in or take it out, or move it one step, starting from
   * `base` while there is no list yet. Writing the list drops the automatic choice (`stateSubcategories`) and the legacy `stateRows`.
   */
  | { type: "start-manual-subcategories"; base: CollectionRef[] }
  | ({ type: "set-manual-subcategory"; on: boolean; base: CollectionRef[] } & CollectionRef)
  | ({ type: "move-manual-subcategory"; direction: "up" | "down"; base: CollectionRef[] } & CollectionRef)
  /** One state-page row shown as a grid (`grid`) or back to a carousel (`collections.stateGrids`). */
  | ({ type: "set-state-row-display"; grid: boolean } & CollectionRef)
  /** REGION only: shows or hides one state-page section that is not built from collections ("Destaques", "Escolha o estilo", "Regiões e cidades"). */
  | { type: "set-state-page-section"; section: StatePageSection; shown: boolean }
  /** Creates the home of a region that has none yet, from sections the caller built out of REAL sources (see admin/region-seed.ts). */
  | { type: "init-home"; sections: Section[] }
  /** Replaces the tracking configuration of the document (validated: formats, legacy only for Sul, an inactive ID only in global). */
  | { type: "set-tracking"; tracking: TrackingConfig }
  /** Replaces the navigation configuration of a region (`null` = back to the default menu). Strictly validated. */
  | { type: "set-navigation"; navigation: NavigationConfig | null }
  /** Replaces the palette of a region (`inherit` / `override`) or of the global scope; `null` = no theme (the region keeps its current look). */
  | { type: "set-theme"; theme: ThemeConfig | null }
  | { type: "set-neutral-theme"; theme: ThemeConfig | null }
  /** Replaces the coupons and promotions of a region (an empty list is valid: no button). Strictly validated. */
  | { type: "set-promotions"; promotions: PromotionsConfig }
  /** Replaces the top strip of a region (messages and production time; no message and no time removes the setting). Strictly validated. */
  | { type: "set-top-bar"; topBar: TopBarConfig }
  /** GLOBAL only: a buy button on every product card of the store (`cards.buyLabel`), or `null` to leave it to each section again. */
  | { type: "set-cards"; cards: CardsConfig | null }
  /** GLOBAL only: the last card of every product carousel ("Ver todas as {n} peças dessa coleção"), or `null` to take it out again. */
  | { type: "set-carousel-end"; carouselEnd: CarouselEndConfig | null }
  /** GLOBAL only: the "Estampas" group of the search on (true, the default: no setting kept) or off. */
  | { type: "set-search-designs"; on: boolean }
  | { type: "set-mundo"; modo: MundoModo | null }
  /** REGION only: switches "O Pódio" on or off (home teaser, state pages and the daily calculation); on removes the setting (the default). */
  | { type: "set-podio"; enabled: boolean }
  /** REGION only: replaces the "Tema da INK" (surfaces on/off and presets). Strictly validated. */
  | { type: "set-ink-theme"; inkTheme: InkThemeConfig }
  /** Launches / recalls a region publicly (takes effect only when published). */
  | { type: "set-launched"; launched: boolean }
  // ── Pages (hotpages and parent-category landings) ──
  /** `collection`: a parent-category landing that is the page of that collection (its hero, then every product of it, paged). */
  | { type: "create-page"; kind: PageKind; title: string; slug?: string; collection?: CollectionRef }
  /**
   * Title, slug, SEO and ground of a page (the slug of an already-published page is refused by the caller: its URL must not change).
   * `backdrop: null` takes the page back to the region's ground.
   */
  | { type: "update-page"; id: string; patch: { title?: string; slug?: string; seo?: PageSeo; backdrop?: PageBackdrop | null } }
  | { type: "duplicate-page"; id: string }
  | { type: "set-page-archived"; id: string; archived: boolean }
  | { type: "remove-page"; id: string }
  /** Applies an ordinary section operation to the sections of ONE page (same rules as the home, minus the footer). */
  | { type: "in-page"; page: string; op: DraftOp }
  // ── Personalization models ──
  | { type: "create-customizer"; name: string; slug?: string; source: CustomizerSource }
  | { type: "update-customizer"; id: string; patch: Partial<Omit<Customizer, "id" | "version">> }
  | { type: "duplicate-customizer"; id: string }
  | { type: "remove-customizer"; id: string };

export type OpResult = { ok: true; doc: ScopeDoc; focusId?: string } | { ok: false; errors: string[] };

export type OpContext = {
  newId: () => string;
  /** `page`: the sections are those of a page (no footer; new sections go at the end). */
  mode?: "home" | "page";
};

export const CUSTOM_PREFIX = "custom-";

export const defaultAppearance = (): Appearance => ({
  fill: { kind: "none" },
  focal: { mobile: { x: 50, y: 50 }, desktop: { x: 50, y: 50 } },
  overlay: { preset: "none" },
});

const slug = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "secao";


const isLocked = (s: Section) => s.template === "hero" || s.template === "footer" || s.locked === true;
const fail = (...errors: string[]): OpResult => ({ ok: false, errors });

/** Applies one operation. The input document is never mutated; on any problem nothing changes and the reasons come back. */
export function applyOp(doc: ScopeDoc, op: DraftOp, ctx: OpContext): OpResult {
  if (op.type === "create-page" || op.type === "update-page" || op.type === "duplicate-page" || op.type === "set-page-archived" || op.type === "remove-page" || op.type === "in-page") return pageOp(doc, op, ctx);
  if (op.type === "create-customizer" || op.type === "update-customizer" || op.type === "duplicate-customizer" || op.type === "remove-customizer") return customizerOp(doc, op, ctx);
  if (op.type === "batch") {
    let current = doc;
    let focusId: string | undefined;
    for (const inner of op.ops) {
      const r = applyOp(current, inner, ctx);
      if (!r.ok) return r;
      current = r.doc;
      focusId ??= r.focusId;
    }
    return { ok: true, doc: current, ...(focusId ? { focusId } : {}) };
  }
  if (op.type === "set-collection-enabled") return setCollectionEnabled(doc, op);
  if (op.type === "set-collection-arrangement") return setCollectionArrangement(doc, op);
  if (op.type === "link-collection-pages") return linkCollectionPages(doc, op.refs);
  if (op.type === "set-collection-menu-position" || op.type === "move-collection-menu" || op.type === "adopt-collection-menu") return editMenu(doc, op);
  if (op.type === "set-state-category" || op.type === "move-state-category" || op.type === "reset-state-categories") return editStateCategories(doc, op);
  if (op.type === "set-state-subcategory" || op.type === "reset-state-subcategories") return editStateSubcategories(doc, op);
  if (op.type === "start-manual-subcategories" || op.type === "set-manual-subcategory" || op.type === "move-manual-subcategory") return editManualSubcategories(doc, op);
  if (op.type === "set-state-row-display") return editStateRowDisplay(doc, op);
  if (op.type === "set-home-theme" || op.type === "create-home-theme") {
    if (doc.scope === "global" || !doc.home) return fail("only a region's home has a theme");
    const created = op.theme === "editorial" && !hasHomeTheme(doc, "editorial") ? newEditorialTheme(doc.scope as RegionSlug, doc.home.sections, op.collections ?? {}, ctx.newId) : undefined;
    let next: ScopeDoc | null;
    if (op.type === "set-home-theme") {
      next = swapHomeTheme(doc, op.theme, created);
      if (!next) return fail(`o tema ${HOME_THEME_LABEL[op.theme]} não existe nesta região`);
    } else {
      if (hasHomeTheme(doc, op.theme)) return { ok: true, doc };
      if (!created) return fail(`o tema ${HOME_THEME_LABEL[op.theme]} não pode ser criado`);
      next = { ...doc, homeThemes: { ...(doc.homeThemes ?? {}), [op.theme]: created } };
    }
    const check = validateScopeDoc(next);
    return check.ok ? { ok: true, doc: next } : { ok: false, errors: check.errors };
  }
  if (op.type === "in-home-theme") {
    if (doc.scope === "global" || op.theme === homeThemeOf(doc)) return applyOp(doc, op.op, ctx);
    if (op.op.type === "in-home-theme" || op.op.type === "set-home-theme" || op.op.type === "create-home-theme") return fail("a theme operation is never applied inside another theme");
    const view = swapHomeTheme(doc, op.theme);
    if (!view) return fail(`o tema ${HOME_THEME_LABEL[op.theme]} ainda não foi criado nesta região`);
    const r = applyOp(view, op.op, ctx);
    if (!r.ok) return r;
    const back = swapHomeTheme(r.doc, homeThemeOf(doc));
    if (!back) return fail("the theme in use could not be restored");
    const check = validateScopeDoc(back);
    return check.ok ? { ok: true, doc: back, ...(r.focusId ? { focusId: r.focusId } : {}) } : { ok: false, errors: check.errors };
  }
  if (op.type === "set-collection-descriptions") {
    if (doc.scope === "global") return fail("global has no collections");
    const collections = { ...(doc.collections ?? { enabled: [] }) };
    if (op.descriptions.length > 0) collections.descriptions = op.descriptions.map((d) => ({ store: d.store, collectionId: d.collectionId, text: d.text }));
    else delete collections.descriptions;
    const next: ScopeDoc = { ...doc, collections };
    const check = validateScopeDoc(next);
    return check.ok ? { ok: true, doc: next } : { ok: false, errors: check.errors };
  }
  if (op.type === "set-state-page-section") {
    if (doc.scope === "global") return fail("global has no state pages");
    const next = withStatePageSection(doc, op.section, op.shown);
    const check = validateScopeDoc(next);
    return check.ok ? { ok: true, doc: next } : { ok: false, errors: check.errors };
  }
  if (op.type === "init-home") {
    if (doc.scope === "global") return fail("global has no home");
    if (doc.home) return fail("this region already has a home");
    const created: ScopeDoc = { ...doc, home: { sections: op.sections } };
    const check = validateScopeDoc(created);
    return check.ok ? { ok: true, doc: created } : { ok: false, errors: check.errors };
  }
  if (op.type === "set-tracking") {
    const next: ScopeDoc = { ...doc, tracking: op.tracking };
    const check = validateScopeDoc(next);
    return check.ok ? { ok: true, doc: next } : { ok: false, errors: check.errors };
  }
  if (op.type === "set-navigation" || op.type === "set-theme" || op.type === "set-neutral-theme") {
    if (op.type === "set-neutral-theme" && doc.scope !== "global") return fail("the neutral palette belongs to the global document");
    const key = op.type === "set-navigation" ? "navigation" : op.type === "set-neutral-theme" ? "neutralTheme" : "theme";
    const value = op.type === "set-navigation" ? op.navigation : op.theme;
    const { [key]: _dropped, ...rest } = doc;
    void _dropped;
    const next = (value === null ? rest : { ...rest, [key]: value }) as ScopeDoc;
    const check = validateScopeDoc(next);
    return check.ok ? { ok: true, doc: next } : { ok: false, errors: check.errors };
  }
  if (op.type === "set-promotions") {
    if (doc.scope === "global") return fail("promotions belong to a region");
    const next: ScopeDoc = { ...doc, promotions: op.promotions };
    const check = validateScopeDoc(next);
    return check.ok ? { ok: true, doc: next } : { ok: false, errors: check.errors };
  }
  if (op.type === "set-top-bar") {
    if (doc.scope === "global") return fail("the top strip belongs to a region");
    const empty = op.topBar.messages.length === 0 && op.topBar.productionDays === undefined && op.topBar.style === undefined && op.topBar.colors === undefined;
    const next: ScopeDoc = { ...doc, topBar: op.topBar };
    if (empty) delete next.topBar;
    const check = validateScopeDoc(next);
    return check.ok ? { ok: true, doc: next } : { ok: false, errors: check.errors };
  }
  if (op.type === "set-cards") {
    if (doc.scope !== "global") return fail("the cards' setting belongs to the global scope");
    const next: ScopeDoc = { ...doc, cards: op.cards ?? undefined };
    if (!op.cards) delete next.cards;
    const check = validateScopeDoc(next);
    return check.ok ? { ok: true, doc: next } : { ok: false, errors: check.errors };
  }
  if (op.type === "set-search-designs") {
    if (doc.scope !== "global") return fail("the search setting belongs to the global scope");
    const next: ScopeDoc = { ...doc };
    if (op.on) delete next.search;
    else next.search = { designs: false };
    const check = validateScopeDoc(next);
    return check.ok ? { ok: true, doc: next } : { ok: false, errors: check.errors };
  }
  if (op.type === "set-carousel-end") {
    if (doc.scope !== "global") return fail("the carousels' last card belongs to the global scope");
    const next: ScopeDoc = { ...doc, carouselEnd: op.carouselEnd ?? undefined };
    if (!op.carouselEnd) delete next.carouselEnd;
    const check = validateScopeDoc(next);
    return check.ok ? { ok: true, doc: next } : { ok: false, errors: check.errors };
  }
  if (op.type === "set-mundo") {
    if (doc.scope !== "global") return fail("the Meu Pequeno Mundo switch belongs to the global scope");
    const next: ScopeDoc = { ...doc, mundo: op.modo ? { modo: op.modo } : undefined };
    if (!op.modo) delete next.mundo;
    const check = validateScopeDoc(next);
    return check.ok ? { ok: true, doc: next } : { ok: false, errors: check.errors };
  }
  if (op.type === "set-podio") {
    if (doc.scope === "global") return fail("the pódio belongs to a region");
    const next: ScopeDoc = { ...doc, podio: { enabled: false } };
    if (op.enabled) delete next.podio;
    return { ok: true, doc: next };
  }
  if (op.type === "set-ink-theme") {
    if (doc.scope === "global") return fail("the INK theme belongs to a region");
    const next: ScopeDoc = { ...doc, inkTheme: op.inkTheme };
    const check = validateScopeDoc(next);
    return check.ok ? { ok: true, doc: next } : { ok: false, errors: check.errors };
  }
  if (op.type === "set-launched") {
    if (doc.scope === "global" || doc.scope === "sul") return fail("only Norte and Centro-Oeste are launched separately (Sul is always public)");
    return { ok: true, doc: { ...doc, launched: op.launched } };
  }
  const sections = doc.home?.sections;
  if (!sections) return fail("this scope has no home");
  const index = "id" in op ? sections.findIndex((s) => s.id === op.id) : -1;
  if ("id" in op && index < 0) return fail(`section "${op.id}" does not exist`);
  const next = sections.map((s) => structuredClone(s));
  const withSections = (list: Section[], focusId?: string): OpResult => ({ ok: true, doc: { ...doc, home: { sections: list } }, focusId });

  switch (op.type) {
    case "add-carousel": {
      const title = op.title.trim();
      if (title.length === 0 || title.length > 120) return fail("the title must have 1 to 120 characters");
      const id = `${CUSTOM_PREFIX}${ctx.newId()}`;
      const anchor = uniqueAnchor(`colecao-${slug(title)}`, new Set(sections.map((s) => s.anchor)));
      const created: Section = {
        id, anchor, headingId: `${anchor}-title`, template: "product-carousel", active: true, title,
        layout: { variant: "standard", tone: "light", surface: "plain", ...(op.display === "grid" ? { display: "grid" as const } : {}) },
        source: op.source, analyticsSource: op.source.kind === "umapenca" ? "homeUmaPenca" : "homeCollection", appearance: defaultAppearance(),
        ...(op.cta ? { cta: op.cta } : {}),
      };
      const check = validateSection(created);
      if (!check.ok) return { ok: false, errors: check.errors };
      // New sections go right before the closing campaign (the block before the footer), never after the footer.
      const at = ctx.mode === "page" ? next.length : Math.max(1, next.length - 2);
      next.splice(at, 0, created);
      return withSections(next, id);
    }
    case "add-structured": {
      if (doc.scope === "global") return fail("global has no home");
      const existing = SINGLETON_TEMPLATES.includes(op.template) ? sections.find((s) => s.template === op.template) : undefined;
      if (existing) return fail(`this region already has this section ("${existing.title ?? existing.id}"): edit it instead of adding another`);
      const id = `${CUSTOM_PREFIX}${ctx.newId()}`;
      const created = structuredDefaults(op.template, doc.scope, id, new Set(sections.map((s) => s.anchor)));
      const check = validateSection(created);
      if (!check.ok) return { ok: false, errors: check.errors };
      // City styles go right after the hero (as on the Sul home); the state chooser and campaigns go before the footer, campaigns last; a grid goes
      // where a new carousel goes (before the closing campaign).
      const at = op.template === "city-styles" ? 1 : ctx.mode === "page" ? next.length : op.template === "image-grid" ? Math.max(1, next.length - 2) : next.length - 1;
      next.splice(at, 0, created);
      return withSections(next, id);
    }
    case "add-customizer-section": {
      if (doc.scope === "global") return fail("global has no home");
      const model = doc.customizers?.find((m) => m.id === op.customizerId);
      if (!model) return fail("unknown personalisation model");
      const id = `${CUSTOM_PREFIX}${ctx.newId()}`;
      const taken = new Set(sections.map((s) => s.anchor));
      const anchor = uniqueAnchor(`personalizar-${model.slug}`, taken);
      const base = structuredDefaults("campaign", doc.scope, id, taken);
      // The model's own words to start from (the owner rewrites them), its picture beside them (no picture of the section's own: see HomeSections),
      // on a warm light ground so it never reads as a second closing campaign.
      const created: Section = {
        ...base, anchor, headingId: `${anchor}-title`, variant: "split",
        title: model.name.slice(0, 120),
        ...(model.description ? { subtitle: model.description.slice(0, 300) } : {}),
        cta: { label: "Personalizar a minha", dest: { kind: "customizer", customizerId: model.id } },
        appearance: { ...base.appearance, fill: { kind: "solid", color: "#e8c9a9" } },
      };
      if (!model.description) delete created.subtitle;
      const check = validateSection(created);
      if (!check.ok) return { ok: false, errors: check.errors };
      // Before the footer (a page has none: at the end).
      next.splice(ctx.mode === "page" ? next.length : next.length - 1, 0, created);
      return withSections(next, id);
    }
    case "duplicate": {
      const source = next[index];
      if (source.template !== "product-carousel") return fail("only carousels can be duplicated");
      const id = `${CUSTOM_PREFIX}${ctx.newId()}`;
      const anchor = uniqueAnchor(`${source.anchor}-copia`, new Set(sections.map((s) => s.anchor)));
      const copy: Section = { ...structuredClone(source), id, anchor, headingId: `${anchor}-title`, active: false, locked: undefined, title: `${source.title ?? ""} (cópia)`.slice(0, 120) };
      delete copy.locked;
      const check = validateSection(copy);
      if (!check.ok) return { ok: false, errors: check.errors };
      next.splice(index + 1, 0, copy);
      return withSections(next, id);
    }
    case "move": {
      if (isLocked(next[index])) return fail("the hero and the footer cannot be moved");
      const target = index + (op.direction === "up" ? -1 : 1);
      if (target < 1 || target > (ctx.mode === "page" ? next.length - 1 : next.length - 2)) return fail(ctx.mode === "page" ? "it cannot go above the page hero" : "it cannot go past the hero or the footer");
      [next[index], next[target]] = [next[target], next[index]];
      return withSections(next, op.id);
    }
    case "reorder": {
      const byId = new Map(next.map((s) => [s.id, s]));
      if (op.ids.length !== next.length || new Set(op.ids).size !== op.ids.length || op.ids.some((id) => !byId.has(id))) return fail("the new order must list every section exactly once");
      const fixed = next.findIndex((s, i) => (i === 0 || isLocked(s) || (ctx.mode !== "page" && i === next.length - 1)) && op.ids[i] !== s.id);
      if (fixed >= 0) return fail(ctx.mode === "page" ? "it cannot go above the page hero" : "it cannot go past the hero or the footer");
      return withSections(op.ids.map((id) => byId.get(id)!));
    }
    case "set-active": {
      if (isLocked(next[index]) && !op.active) return fail("the hero and the footer cannot be hidden");
      next[index].active = op.active;
      return withSections(next, op.id);
    }
    case "remove": {
      if (!op.id.startsWith(CUSTOM_PREFIX)) return fail("only sections created in the CMS can be removed; hide the others instead");
      next.splice(index, 1);
      return withSections(next);
    }
    case "update": {
      const merged: Section = { ...next[index], ...op.patch, id: next[index].id, anchor: next[index].anchor, headingId: next[index].headingId, template: next[index].template };
      // An optional key set to undefined means "clear it".
      for (const key of Object.keys(op.patch) as (keyof Editable)[]) if (op.patch[key] === undefined) delete (merged as Partial<Section>)[key];
      const check = validateSection(merged);
      if (!check.ok) return { ok: false, errors: check.errors };
      next[index] = merged;
      // Region-level rules (a Norte button cannot lead to /sul, a section cannot use another region's store) live on the whole document:
      // only the problems of THIS section are reported, so an edit is never blocked by something unrelated.
      const whole = ctx.mode === "page" ? ({ ok: true } as const) : validateScopeDoc({ ...doc, home: { sections: next } });
      if (!whole.ok) {
        const own = whole.errors.filter((e) => e.startsWith(`doc.home.sections[${index}]`));
        if (own.length > 0) return { ok: false, errors: own };
      }
      return withSections(next, op.id);
    }
  }
}

/**
 * Enables or disables an INTERNAL collection for this document (its explicit, reversible editorial permission; nothing in INK changes).
 * Disabling is refused while any section still uses the collection, and the reply names those sections: nothing is broken silently.
 */
function setCollectionEnabled(doc: ScopeDoc, op: { store: CollectionRef["store"]; collectionId: number; enabled: boolean }): OpResult {
  const current = doc.collections?.enabled ?? [];
  const has = current.some((r) => r.store === op.store && r.collectionId === op.collectionId);
  if (op.enabled) {
    if (has) return { ok: true, doc };
    const next: ScopeDoc = { ...doc, collections: { ...doc.collections, enabled: [...current, { store: op.store, collectionId: op.collectionId }] } };
    const check = validateScopeDoc(next);
    return check.ok ? { ok: true, doc: next } : { ok: false, errors: check.errors };
  }
  if (!has) return { ok: true, doc };
  const using = sectionsUsing(doc, op.store, op.collectionId);
  if (using.length > 0) {
    return { ok: false, errors: [`Esta coleção é usada por: ${using.map((s) => `"${s.title ?? s.id}"`).join(", ")}. Remova ou troque a fonte dessas seções antes de desabilitá-la.`] };
  }
  const remaining = current.filter((r) => !(r.store === op.store && r.collectionId === op.collectionId));
  const next: ScopeDoc = { ...doc };
  // The menu, the older navbar lists and the arrangements are separate decisions: emptying the enablements must not drop them.
  const c = doc.collections;
  const others = Boolean(c?.menu) || (c?.navbarGroups?.top.length ?? 0) + (c?.navbarGroups?.more.length ?? 0) > 0 || (c?.navbar?.length ?? 0) > 0 || (c?.arrangements?.length ?? 0) > 0;
  if (remaining.length > 0 || others) next.collections = { ...doc.collections, enabled: remaining };
  else delete next.collections;
  return { ok: true, doc: next };
}

/** See the op. Only the destination's kind changes (same collection, same label); a link to a collection not listed stays on INK. */
function linkCollectionPages(doc: ScopeDoc, refs: CollectionRef[]): OpResult {
  const wanted = new Set(refs.map((r) => `${r.store}:${r.collectionId}`));
  const swap = <T extends { kind: string }>(dest: T): T =>
    dest.kind === "ink-collection" && wanted.has(`${(dest as unknown as CollectionRef).store}:${(dest as unknown as CollectionRef).collectionId}`) ? ({ ...dest, kind: "collection-page" } as T) : dest;
  const fix = (s: Section): Section => ({
    ...s,
    ...(s.cta ? { cta: { ...s.cta, dest: swap(s.cta.dest) } } : {}),
    ...(s.nav?.dest ? { nav: { ...s.nav, dest: swap(s.nav.dest) } } : {}),
    ...(s.tiles ? { tiles: s.tiles.map((t) => ({ ...t, dest: swap(t.dest) })) } : {}),
  });
  const next: ScopeDoc = { ...doc, ...(doc.home ? { home: { sections: doc.home.sections.map(fix) } } : {}), ...(doc.pages ? { pages: doc.pages.map((p) => ({ ...p, sections: p.sections.map(fix) })) } : {}) };
  const check = validateScopeDoc(next);
  return check.ok ? { ok: true, doc: next } : { ok: false, errors: check.errors };
}

/** Does any section of the document (home or page) still carry an order of its own for this collection, from before orders belonged to collections? */
function olderSectionOrder(doc: ScopeDoc, ref: CollectionRef): boolean {
  return [...(doc.home?.sections ?? []), ...(doc.pages ?? []).flatMap((p) => p.sections)].some(
    (s) => s.source?.kind === "ink-category" && s.source.store === ref.store && s.source.collectionId === ref.collectionId && ((s.source.order === "manual" && (s.source.productIds?.length ?? 0) > 0) || (s.source.hiddenIds?.length ?? 0) > 0),
  );
}

/** Sets how this region arranges a collection (see the op). Nothing in INK changes; the sections keep their own settings (limit, layout). */
function setCollectionArrangement(doc: ScopeDoc, op: CollectionRef & { productIds: string[]; hiddenIds: string[] }): OpResult {
  if (doc.scope === "global") return fail("global has no collections");
  const ref: CollectionRef = { store: op.store, collectionId: op.collectionId };
  const productIds = [...new Set(op.productIds)];
  const hiddenIds = [...new Set(op.hiddenIds)];
  const entry = { ...ref, ...(productIds.length > 0 ? { productIds } : {}), ...(hiddenIds.length > 0 ? { hiddenIds } : {}) };
  const keep = productIds.length > 0 || hiddenIds.length > 0 || olderSectionOrder(doc, ref);
  const current = doc.collections?.arrangements ?? [];
  const same = (a: CollectionRef) => a.store === ref.store && a.collectionId === ref.collectionId;
  // In place when it already has one (a stable document, a readable diff), at the end when it is new.
  const arrangements = current.some(same) ? current.flatMap((a) => (same(a) ? (keep ? [entry] : []) : [a])) : keep ? [...current, entry] : current;
  const { arrangements: _old, ...rest } = doc.collections ?? { enabled: [] };
  void _old;
  const next: ScopeDoc = { ...doc, collections: { ...rest, enabled: rest.enabled ?? [], ...(arrangements.length > 0 ? { arrangements } : {}) } };
  const check = validateScopeDoc(next);
  if (!check.ok) {
    const own = check.errors.filter((e) => e.startsWith("doc.collections.arrangements"));
    if (own.length > 0) return { ok: false, errors: own };
  }
  return { ok: true, doc: next };
}

/**
 * Edits the region's collection menu. Independent of the home: it never touches `enabled` nor the sections. Only references are stored; whether a collection
 * has a page of ours or on INK is checked when the menu is read (`catalog/collection-menu.ts`), so one that later disappears stops rendering without losing
 * the owner's choice. The first edit of a document from before the menu starts from what it already shows (its older "Topo" stays on top).
 */
type MenuOp = ({ type: "set-collection-menu-position"; position: MenuPosition; isPublic: boolean } & CollectionRef) | ({ type: "move-collection-menu"; direction: "up" | "down" } & CollectionRef) | { type: "adopt-collection-menu" };
function editMenu(doc: ScopeDoc, op: MenuOp): OpResult {
  if (doc.scope === "global") return fail("global has no collections");
  const { menu, own } = effectiveMenu(doc);
  const next =
    op.type === "adopt-collection-menu" ? menu
    : op.type === "set-collection-menu-position" ? withMenuPosition(menu, { store: op.store, collectionId: op.collectionId }, op.position, op.isPublic)
    : movedOnTop(menu, { store: op.store, collectionId: op.collectionId }, op.direction);
  if (next === menu && own) return { ok: true, doc }; // nothing changed
  const edited = withMenu(doc, next);
  const check = validateScopeDoc(edited);
  return check.ok ? { ok: true, doc: edited } : { ok: false, errors: check.errors };
}

/** Edits the state page's categories. Only references are kept; which rows show in each state is decided when the page is read (state-hierarchy.ts). */
type StateCategoriesOp = Extract<DraftOp, { type: "set-state-category" | "move-state-category" | "reset-state-categories" }>;
function editStateCategories(doc: ScopeDoc, op: StateCategoriesOp): OpResult {
  if (doc.scope === "global") return fail("global has no state pages");
  const collections = doc.collections ?? { enabled: [] };
  let next: CollectionRef[] | undefined;
  if (op.type === "reset-state-categories") next = undefined;
  else {
    const same = (r: CollectionRef) => r.store === op.store && r.collectionId === op.collectionId;
    const list = (collections.stateCategories ?? op.base).map((r) => ({ store: r.store, collectionId: r.collectionId }));
    if (op.type === "set-state-category") next = op.on ? (list.some(same) ? list : [...list, { store: op.store, collectionId: op.collectionId }]) : list.filter((r) => !same(r));
    else {
      const i = list.findIndex(same);
      const j = op.direction === "up" ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= list.length) return fail("this collection cannot move that way");
      [list[i], list[j]] = [list[j], list[i]];
      next = list;
    }
  }
  const edited: ScopeDoc = { ...doc, collections: { ...collections } };
  if (next) edited.collections!.stateCategories = next;
  else delete edited.collections!.stateCategories;
  const check = validateScopeDoc(edited);
  return check.ok ? { ok: true, doc: edited } : { ok: false, errors: check.errors };
}

/** Edits the state page's subcategories (automatic, so only what departs from it is kept). The legacy flat list goes away on the first edit. */
type StateSubcategoriesOp = Extract<DraftOp, { type: "set-state-subcategory" | "reset-state-subcategories" }>;
function editStateSubcategories(doc: ScopeDoc, op: StateSubcategoriesOp): OpResult {
  if (doc.scope === "global") return fail("global has no state pages");
  const { stateRows: _legacy, stateSubcategories: current, stateSubcategoryList: _manual, ...rest } = doc.collections ?? { enabled: [] };
  void _legacy;
  void _manual;
  const collections: NonNullable<ScopeDoc["collections"]> = { ...rest, enabled: rest.enabled ?? [] };
  if (op.type === "set-state-subcategory") {
    const same = (r: CollectionRef) => r.store === op.store && r.collectionId === op.collectionId;
    const entry: CollectionRef = { store: op.store, collectionId: op.collectionId };
    const start = current ?? op.base;
    const hidden = start.hidden.filter((r) => !same(r)).map((r) => ({ store: r.store, collectionId: r.collectionId }));
    const added = start.added.filter((r) => !same(r)).map((r) => ({ store: r.store, collectionId: r.collectionId }));
    if (op.isPublic && !op.on) hidden.push(entry);
    if (!op.isPublic && op.on) added.push(entry);
    if (hidden.length > 0 || added.length > 0) collections.stateSubcategories = { hidden, added };
  }
  const edited: ScopeDoc = { ...doc, collections };
  const check = validateScopeDoc(edited);
  return check.ok ? { ok: true, doc: edited } : { ok: false, errors: check.errors };
}

/** Edits the hand-picked subcategories. The list is the whole choice, so the automatic one and the legacy list go away with the first write. */
type ManualSubcategoriesOp = Extract<DraftOp, { type: "start-manual-subcategories" | "set-manual-subcategory" | "move-manual-subcategory" }>;
function editManualSubcategories(doc: ScopeDoc, op: ManualSubcategoriesOp): OpResult {
  if (doc.scope === "global") return fail("global has no state pages");
  const { stateRows: _legacy, stateSubcategories: _auto, stateSubcategoryList: current, ...rest } = doc.collections ?? { enabled: [] };
  void _legacy;
  void _auto;
  const copy = (refs: readonly CollectionRef[]) => refs.map((r) => ({ store: r.store, collectionId: r.collectionId }));
  let list = copy(current ?? op.base);
  if (op.type !== "start-manual-subcategories") {
    const same = (r: CollectionRef) => r.store === op.store && r.collectionId === op.collectionId;
    if (op.type === "set-manual-subcategory") list = op.on ? (list.some(same) ? list : [...list, { store: op.store, collectionId: op.collectionId }]) : list.filter((r) => !same(r));
    else {
      const i = list.findIndex(same);
      const j = op.direction === "up" ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= list.length) return fail("this collection cannot move that way");
      [list[i], list[j]] = [list[j], list[i]];
    }
  }
  const edited: ScopeDoc = { ...doc, collections: { ...rest, enabled: rest.enabled ?? [], stateSubcategoryList: list } };
  const check = validateScopeDoc(edited);
  return check.ok ? { ok: true, doc: edited } : { ok: false, errors: check.errors };
}

/** Shows one state-page row as a grid or back as a carousel. An empty list is removed (every row a carousel). */
function editStateRowDisplay(doc: ScopeDoc, op: Extract<DraftOp, { type: "set-state-row-display" }>): OpResult {
  if (doc.scope === "global") return fail("global has no state pages");
  const collections = doc.collections ?? { enabled: [] };
  const same = (r: CollectionRef) => r.store === op.store && r.collectionId === op.collectionId;
  const now = (collections.stateGrids ?? []).filter((r) => !same(r)).map((r) => ({ store: r.store, collectionId: r.collectionId }));
  const next = op.grid ? [...now, { store: op.store, collectionId: op.collectionId }] : now;
  const edited: ScopeDoc = { ...doc, collections: { ...collections } };
  if (next.length > 0) edited.collections!.stateGrids = next;
  else delete edited.collections!.stateGrids;
  const check = validateScopeDoc(edited);
  return check.ok ? { ok: true, doc: edited } : { ok: false, errors: check.errors };
}

// ── Pages ────────────────────────────────────────────────────────────────────────────────────────────────────

const PAGE_PREFIX = "pg-";
const withPages = (doc: ScopeDoc, pages: Page[], focusId?: string): OpResult => {
  const next: ScopeDoc = { ...doc, pages };
  if (pages.length === 0) delete next.pages;
  const check = validateScopeDoc(next);
  return check.ok ? { ok: true, doc: next, focusId } : { ok: false, errors: check.errors };
};

function pageOp(doc: ScopeDoc, op: Extract<DraftOp, { type: "create-page" | "update-page" | "duplicate-page" | "set-page-archived" | "remove-page" | "in-page" }>, ctx: OpContext): OpResult {
  if (doc.scope === "global") return fail("global has no pages");
  const pages = (doc.pages ?? []).map((p) => structuredClone(p));
  const taken = (kind: PageKind) => new Set(pages.filter((p) => p.kind === kind).map((p) => p.slug));
  if (op.type === "create-page") {
    const title = op.title.trim();
    if (title.length === 0 || title.length > 120) return fail("the title must have 1 to 120 characters");
    const slug = op.slug?.trim() ? op.slug.trim() : uniqueSlug(title, taken(op.kind));
    if (taken(op.kind).has(slug)) return fail(`this region already has a page with the address "${slug}"`);
    const page = op.collection && op.kind === "categoryLanding"
      ? newCollectionLanding({ id: `${PAGE_PREFIX}${ctx.newId()}`, heroId: `${CUSTOM_PREFIX}${ctx.newId()}`, gridId: `${CUSTOM_PREFIX}${ctx.newId()}`, title, slug, ref: op.collection })
      : newPage({ id: `${PAGE_PREFIX}${ctx.newId()}`, kind: op.kind, title, slug, heroId: `${CUSTOM_PREFIX}${ctx.newId()}`, subtitle: op.kind === "hotpage" ? undefined : undefined });
    const check = validatePage(page, doc.scope);
    if (!check.ok) return { ok: false, errors: check.errors };
    return withPages(doc, [...pages, page], page.id);
  }
  const targetId = op.type === "in-page" ? op.page : op.id;
  const index = pages.findIndex((p) => p.id === targetId);
  if (index < 0) return fail("this page does not exist");
  const page = pages[index];
  if (op.type === "update-page") {
    const merged: Page = { ...page, ...(op.patch.title !== undefined ? { title: op.patch.title.trim() } : {}), ...(op.patch.slug !== undefined ? { slug: op.patch.slug.trim() } : {}), ...(op.patch.seo !== undefined ? { seo: op.patch.seo } : {}), ...(op.patch.backdrop ? { backdrop: op.patch.backdrop } : {}) };
    if (op.patch.backdrop === null) delete merged.backdrop;
    if (op.patch.slug !== undefined && merged.slug !== page.slug && pages.some((p, i) => i !== index && p.kind === merged.kind && p.slug === merged.slug)) return fail(`this region already has a page with the address "${merged.slug}"`);
    pages[index] = merged;
    return withPages(doc, pages, merged.id);
  }
  if (op.type === "duplicate-page") {
    const slug = uniqueSlug(`${page.slug}-copia`, taken(page.kind));
    const copy: Page = { ...structuredClone(page), id: `${PAGE_PREFIX}${ctx.newId()}`, slug, title: `${page.title} (cópia)`.slice(0, 120), archived: undefined, version: 1, seo: { ...page.seo, indexable: false } };
    delete copy.archived;
    return withPages(doc, [...pages, copy], copy.id);
  }
  if (op.type === "set-page-archived") {
    pages[index] = { ...page, ...(op.archived ? { archived: true } : {}) };
    if (!op.archived) delete pages[index].archived;
    return withPages(doc, pages, page.id);
  }
  if (op.type === "remove-page") {
    pages.splice(index, 1);
    return withPages(doc, pages);
  }
  // in-page: reuse the section operations on the page's sections.
  const inner = applyOp({ ...doc, home: { sections: page.sections } }, op.op, { ...ctx, mode: "page" });
  if (!inner.ok) return inner;
  const updated: Page = { ...page, sections: inner.doc.home!.sections };
  const check = validatePage(updated, doc.scope);
  if (!check.ok) return { ok: false, errors: check.errors };
  pages[index] = updated;
  return withPages(doc, pages, inner.focusId);
}

// ── Personalization models ───────────────────────────────────────────────────────────────────────────────────

const withCustomizers = (doc: ScopeDoc, list: Customizer[], focusId?: string): OpResult => {
  const next: ScopeDoc = { ...doc, customizers: list };
  if (list.length === 0) delete next.customizers;
  const check = validateScopeDoc(next);
  return check.ok ? { ok: true, doc: next, focusId } : { ok: false, errors: check.errors };
};

function customizerOp(doc: ScopeDoc, op: Extract<DraftOp, { type: "create-customizer" | "update-customizer" | "duplicate-customizer" | "remove-customizer" }>, ctx: OpContext): OpResult {
  if (doc.scope === "global") return fail("global has no personalization models");
  const list = (doc.customizers ?? []).map((m) => structuredClone(m));
  const taken = new Set(list.map((m) => m.slug));
  if (op.type === "create-customizer") {
    const name = op.name.trim();
    if (name.length === 0 || name.length > 80) return fail("the name must have 1 to 80 characters");
    const slug = op.slug?.trim() ? op.slug.trim() : uniqueSlug(name, taken);
    if (taken.has(slug)) return fail(`this region already has a model with the address "${slug}"`);
    const created: Customizer = { id: `cz-${ctx.newId()}`, slug, name, source: op.source, fields: [], previewMode: "mockupWithTextSummary", active: false, version: 1 };
    const check = validateCustomizer(created, doc.scope);
    if (!check.ok) return { ok: false, errors: check.errors };
    return withCustomizers(doc, [...list, created], created.id);
  }
  const index = list.findIndex((m) => m.id === op.id);
  if (index < 0) return fail("this model does not exist");
  const model = list[index];
  if (op.type === "update-customizer") {
    const merged = { ...model, ...op.patch, id: model.id, version: model.version } as Customizer;
    for (const key of Object.keys(op.patch) as (keyof typeof op.patch)[]) if (op.patch[key] === undefined) delete (merged as Partial<Customizer>)[key];
    if (merged.slug !== model.slug && list.some((m, i) => i !== index && m.slug === merged.slug)) return fail(`this region already has a model with the address "${merged.slug}"`);
    const check = validateCustomizer(merged, doc.scope);
    if (!check.ok) return { ok: false, errors: check.errors };
    list[index] = merged;
    return withCustomizers(doc, list, model.id);
  }
  if (op.type === "duplicate-customizer") {
    const copy: Customizer = { ...structuredClone(model), id: `cz-${ctx.newId()}`, slug: uniqueSlug(`${model.slug}-copia`, taken), name: `${model.name} (cópia)`.slice(0, 80), active: false, version: 1 };
    return withCustomizers(doc, [...list, copy], copy.id);
  }
  // remove: refused while any section still shows it as the first card, or a button or a tile still opens it
  const sectionsWhere = [...(doc.home?.sections ?? []).map((s) => ({ where: "a home", s })), ...(doc.pages ?? []).flatMap((p) => p.sections.map((s) => ({ where: `a página "${p.title}"`, s })))];
  const users = sectionsWhere.filter(({ s }) => s.customizerCard?.customizerId === model.id);
  if (users.length > 0) return fail(`Este modelo é o primeiro card de "${users[0].s.title ?? users[0].s.id}" em ${users[0].where}. Troque ou remova o card antes.`);
  const opens = (d: Destination | undefined) => d?.kind === "customizer" && d.customizerId === model.id;
  const linked = sectionsWhere.find(({ s }) => opens(s.cta?.dest) || (s.tiles ?? []).some((t) => opens(t.dest)));
  if (linked) return fail(`A seção "${linked.s.title ?? linked.s.id}" em ${linked.where} tem um botão ou bloco que abre este modelo. Troque o destino ou remova a seção antes.`);
  list.splice(index, 1);
  return withCustomizers(doc, list);
}

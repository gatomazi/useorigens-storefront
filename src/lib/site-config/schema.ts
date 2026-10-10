/**
 * Contract of the storefront CMS configuration (docs/admin/cms-v1-plan.md §3.1, refined by
 * docs/admin/cms-v1-round2.md). Pure types + validators: no I/O, no `server-only`, no dependency, so the admin (draft
 * validation) and the storefront (published-snapshot validation) run the very same checks.
 *
 * The storefront reads only a `PublishedBundle` (a validated snapshot, resolved at publish time: media entries carry the
 * final URL and dimensions, so rendering never needs the database or the storage API).
 */
import { isAllowedMediaSrc } from "./media-hosts";
import { validateNavigation, validateTheme, type NavigationConfig, type ThemeConfig } from "./navigation-schema";
import { validatePromotions, type PromotionsConfig } from "./promotions-schema";
import { REGIONS, type CommerceStoreKey, type RegionSlug } from "../geo/regions";
import { ARTICLE_KIND_LABELS, ARTICLE_KINDS, type ArticleKind } from "../umapenca/types";

export const SCOPES = ["global", "sul", "norte", "centro-oeste"] as const;
export type Scope = (typeof SCOPES)[number];

export const TEMPLATE_KEYS = ["hero", "page-hero", "city-styles", "product-carousel", "states", "campaign", "image-grid", "footer"] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

/** Closed list of analytics origins a carousel may report (keys of `SOURCES`); never a free string (would pollute Meta/GA4). */
export const CAROUSEL_SOURCE_KEYS = ["homeTerra", "homeRedesenhos", "homeFeitoParaVoce", "homeFala", "homeDdd", "homeCollection", "homeUmaPenca"] as const;
export type CarouselSourceKey = (typeof CAROUSEL_SOURCE_KEYS)[number];

export const EDITORIAL_MODULE_KEYS = ["terra", "recreations", "lenda", "dizeres", "ddd"] as const;
export type EditorialModuleKey = (typeof EDITORIAL_MODULE_KEYS)[number];

/** Named theme colours (map to static Tailwind classes, so they follow the region theme) or a custom `#rrggbb`. */
export const COLOR_TOKENS = ["ground", "region-primary", "near-black"] as const;
export type ColorToken = (typeof COLOR_TOKENS)[number];
export type Color = `#${string}` | `token:${ColorToken}`;

export type Fill =
  | { kind: "none" } // no layer: the section keeps the page ground / its own surface
  | { kind: "solid"; color: Color }
  | { kind: "gradient"; from: Color; to: Color; angle: number };

export const OVERLAY_PRESETS = ["none", "regional-wash", "regional-wash-primary", "regional-wash-dark"] as const;
export type OverlayPreset = (typeof OVERLAY_PRESETS)[number];
export type Overlay = { preset: OverlayPreset } | { color: `#${string}`; opacity: number };

export type Point = { x: number; y: number };
export type MediaRef = { assetId: string; alt: string; decorative: boolean };

export type Appearance = {
  fill: Fill;
  image?: { mobile?: MediaRef; desktop?: MediaRef; reuseMobileOnDesktop?: boolean };
  focal: { mobile: Point; desktop: Point };
  overlay: Overlay;
};

export type PageKind = "hotpage" | "categoryLanding";
export const PAGE_KINDS: readonly PageKind[] = ["hotpage", "categoryLanding"];
/** Public path segment of each page kind under `/<region>/…` (static segments: they never collide with `[uf]`). */
export const PAGE_SEGMENT: Record<PageKind, string> = { hotpage: "h", categoryLanding: "colecoes" };
export const CUSTOMIZER_SEGMENT = "personalizar";

export type Destination =
  | { kind: "route"; path: string }
  /** A published page of this region (resolved to its URL at render time; publishing requires that it exists and is live). */
  | { kind: "page"; pageKind: PageKind; slug: string }
  /** An anchor on the page itself (`#anchor`). */
  | { kind: "anchor"; anchor: string }
  | { kind: "ink-collection"; store: CommerceStoreKey; collectionId: number }
  | { kind: "external"; url: string };

export type Source =
  | { kind: "editorial-module"; key: EditorialModuleKey }
  | {
      kind: "ink-category";
      store: CommerceStoreKey;
      collectionId: number;
      /** "category" = INK's own order; "manual" = `productIds` first (the owner's order), then whatever the collection has that they are not. */
      order: "category" | "manual";
      limit: number;
      /**
       * `order: "manual"` only: the collection's products (INK ids) in the order the owner set in the panel. A product INK adds later is not here, so
       * it follows these in INK's order; an id that left the collection (or its first products) is skipped. Never a copy of a name or a price.
       */
      productIds?: string[];
      /** Products of the collection taken out of THIS section (INK ids), in either order. */
      hiddenIds?: string[];
    }
  | { kind: "manual"; productIds: string[]; limit: number }
  /** Canecas/ecobags from the synced Uma Penca feed (src/lib/umapenca), in feed order. No INK collection is involved. */
  | { kind: "umapenca"; articleKinds: ArticleKind[]; limit: number };

export type FeaturedProductRef = { store: CommerceStoreKey; productId: string };
export const MAX_FEATURED = 3;

/**
 * `display` (product sections only): "carousel" = one row that scrolls sideways (the default, also when absent); "grid" = every card laid out on the page,
 * two per row on phones, three on tablets and four on desktop, like a category page.
 * `buyLabel` (product sections only): a buy button under every product card, with this text; absent = no button. It is part of the card's own
 * link, so it opens the same store page (where size and colour are chosen) and reports the same click. The suggested text says just that: "Ver produto".
 */
export const PRODUCT_DISPLAYS = ["carousel", "grid"] as const;
export type ProductDisplay = (typeof PRODUCT_DISPLAYS)[number];
/**
 * Tags drawn on the product pictures of a section (product sections only; absent = none). `discount`: "18% OFF" on every product INK (or Uma Penca)
 * has on promotion right now, worked out from the two prices the store sent, never typed. `text`: the section's own tag on every product card
 * ("Black Friday", "Lançamento"), the same for all of them.
 */
export type ProductTags = { discount?: true; text?: string };
export const MAX_TAG_TEXT = 24;
export type CarouselLayout = { variant: "standard" | "poster"; tone: "light" | "dark"; surface: "paper" | "plain" | "region-primary"; display?: ProductDisplay; buyLabel?: string; tags?: ProductTags };
export const DEFAULT_BUY_LABEL = "Ver produto";
export const MAX_BUY_LABEL = 20;
/** Cards of a product section: a carousel scrolls through at most 24; a grid lays out up to 48 (every product an INK collection keeps for showcases). */
export const MIN_SECTION_PRODUCTS = 3;
export const MAX_CAROUSEL_PRODUCTS = 24;
export const MAX_GRID_PRODUCTS = 48;
export const maxSectionProducts = (display: ProductDisplay | undefined): number => (display === "grid" ? MAX_GRID_PRODUCTS : MAX_CAROUSEL_PRODUCTS);

/**
 * Image grid ("Compre por peça", "Coleções"…): each tile is a picture with a name that leads somewhere real. Nothing is read from the catalog,
 * so a tile never shows a price or a count it could get wrong; the destination goes through the same rules as any button (own region, live page).
 * A tile without a picture is drawn as a plain colour block with its name (a "Ver tudo" tile, or a grid still waiting for its photos).
 */
export type GridTile = { label: string; caption?: string; image?: MediaRef; dest: Destination };
export const GRID_COLUMNS = [2, 3, 4] as const;
export const GRID_ASPECTS = ["square", "portrait", "landscape"] as const;
export const GRID_LABELS = ["below", "overlay"] as const;
/** `columns` is the desktop count (phones always show two side by side); `labels`: the name under the picture or over its lower edge. */
export type GridLayout = { columns: (typeof GRID_COLUMNS)[number]; aspect: (typeof GRID_ASPECTS)[number]; labels: (typeof GRID_LABELS)[number] };
export const MIN_GRID_TILES = 2;
export const MAX_GRID_TILES = 12;

export type Section = {
  id: string;
  /** DOM id of the `<section>` (existing anchors keep working). */
  anchor: string;
  /** DOM id of the heading, referenced by `aria-labelledby`. */
  headingId: string;
  template: TemplateKey;
  active: boolean;
  locked?: boolean;
  title?: string;
  subtitle?: string;
  cta?: { label: string; dest: Destination };
  layout?: CarouselLayout;
  source?: Source;
  analyticsSource?: CarouselSourceKey;
  /** Campaign only: what shows when no background image is published. */
  fallback?: "crops" | "fill";
  /** City styles only: how many of the city's style cards to show (1..8; fewer when the region's catalog has fewer real ones). */
  count?: number;
  /**
   * Hero only: the (up to three) products shown as cards next to the headline, by stable reference (store + INK product id, never a copy of
   * a price or a photo: those are read from the catalog snapshot at render time). `undefined` = not customised: Sul keeps the three cards
   * the code has always shown, the other regions show none. `[]` = customised to show no card.
   */
  featured?: FeaturedProductRef[];
  /** Show this section in the storefront header menu, under this label (the "apelido"). Not for the hero or the footer. `dest` sends the link to a page instead of this section. */
  nav?: { label: string; dest?: Destination };
  /**
   * Product carousels only: the FIRST card is not a product but a "personalize yours on this model" card that leads to the region's own customizer
   * page. The other cards are ordinary products (the section's total stays what it was: 1 + N-1).
   */
  customizerCard?: { customizerId: string; image?: MediaRef; title: string; description?: string; button: string };
  /**
   * State chooser only: a cover picture per state (key = UF, e.g. "PA"). A state without one keeps the cover the code has for it (Sul) or shows
   * none. The images are resolved into the published media table like any section image.
   */
  stateCovers?: Record<string, MediaRef>;
  /** Image grid only: the tiles, in order (MIN_GRID_TILES..MAX_GRID_TILES). */
  tiles?: GridTile[];
  /** Image grid only. */
  grid?: GridLayout;
  appearance: Appearance;
};

/**
 * One tool (Meta Pixel or GA4) in one document. Independent per tool, per document:
 *   inherit   the region uses the GLOBAL document's ID for this tool, but only while the global one is active ("override" there);
 *   override  the document's OWN ID replaces the global one (never both);
 *   disabled  no ID for this tool. In the GLOBAL document `disabled` may keep a remembered `id` (an inactive global ID, kept so the owner
 *             can switch it on later without retyping);
 *   legacy    Sul only: keep using the build-time NEXT_PUBLIC_* value the storefront had before the CMS existed, until an explicit
 *             configuration replaces it. Never available to other regions, and never copied to them.
 */
export type VendorSetting = { mode: "inherit" } | { mode: "override"; id: string } | { mode: "disabled"; id?: string } | { mode: "legacy" };
export type TrackingConfig = { meta: VendorSetting; ga4: VendorSetting };

export type CollectionRef = { store: CommerceStoreKey; collectionId: number };

/**
 * A page of a region outside the home: an editorial hotpage or a parent-category landing. Made of the SAME sections as the home (rendered by the
 * same components); the first is always a `page-hero`. Lives in the region's document but is published on its own (see admin/publishing.ts).
 */
export type PageSeo = { title?: string; description?: string; ogImage?: MediaRef; indexable: boolean };
/**
 * A page's own ground, for a themed page (Black Friday, Natal…): a colour under every section and, optionally, a picture repeated over it as a pattern
 * (always decorative). A section with a surface of its own (a photo, a colour, paper) keeps painting it. `tone` is the ground's lightness, the same word
 * the sections use: "light" = dark text (the store's usual look), "dark" = light text. `size` is the width of one repeat in CSS pixels; `opacity` lets the
 * pattern sit softly over the colour.
 */
export type PageBackdrop = { color: `#${string}`; tone: "light" | "dark"; pattern?: { image: MediaRef; size: number; opacity: number } };
export const PATTERN_SIZE = { min: 40, max: 600 } as const;
export const PATTERN_OPACITY = { min: 0.05, max: 1 } as const;
export type Page = {
  id: string;
  kind: PageKind;
  slug: string;
  title: string;
  seo: PageSeo;
  /** Absent = the region's own ground (the page looks like the rest of the store). */
  backdrop?: PageBackdrop;
  sections: Section[];
  /** An archived page is not served (404) and cannot be a link target; its content is kept. */
  archived?: boolean;
  version: number;
};

export type CustomField = { key: string; label: string; placeholder?: string; helperText?: string; required: boolean; maxLength: number; defaultValue?: string; position: number; type: "text" };
/** A repeatable group of text lines (for example the four to six lines of a shirt): the customer sees `initial` lines and may add or remove within min..max. */
export type LineGroup = { key: string; label: string; helperText?: string; placeholder?: string; lineLabel: string; min: number; initial: number; max: number; maxLength: number; defaults?: string[] };
/** A model of a shirt: the INK collection it belongs to (same store as the region; an internal collection must be enabled in the Library). */
export type InkCustomizerSource = { store: CommerceStoreKey; collectionId: number };
/** A model of an Uma Penca article ("Crie a sua" caneca or ecobag): no INK collection, the team prepares the product in the Uma Penca store. */
export type UmaPencaCustomizerSource = { kind: "umapenca"; articleKind: ArticleKind };
export type CustomizerSource = InkCustomizerSource | UmaPencaCustomizerSource;
export const isUmaPencaSource = (source: CustomizerSource): source is UmaPencaCustomizerSource => "kind" in source && source.kind === "umapenca";
/** "Camiseta" / "Caneca" / "Ecobag": the product a model makes, for default alt texts and labels. */
export const customizerProductLabel = (source: CustomizerSource): string => (isUmaPencaSource(source) ? ARTICLE_KIND_LABELS[source.articleKind].singular : "Camiseta");

export type Customizer = {
  id: string;
  slug: string;
  name: string;
  description?: string;
  /** Where the product is sold: an INK collection (shirts, the original shape, kept as-is) or Uma Penca (canecas, ecobags). */
  source: CustomizerSource;
  /** The exact INK product, when the operator picked one; otherwise the model has no linked checkout product. Never on an Uma Penca model. */
  inkProductId?: string;
  cardImage?: MediaRef;
  pageMockup?: MediaRef;
  fields: CustomField[];
  lineGroup?: LineGroup;
  /** V1: the static mockup plus a live text summary. The mockup already carries printed text, so text is never drawn over it. */
  previewMode: "mockupWithTextSummary";
  active: boolean;
  version: number;
};

export const MAX_CUSTOM_FIELDS = 10;
export const MAX_LINE_GROUP = 10;
export const MAX_PAGES = 60;
export const MAX_CUSTOMIZERS = 40;
export const PAGE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Segments a page or a customizer may never use as its slug (static routes and words that would read as routes). */
export const RESERVED_SLUGS: readonly string[] = ["h", "colecoes", "personalizar", "privacidade", "solicitacao", "api", "admin", "media", "novo", "preview"];

export type ScopeDoc = {
  schemaVersion: 1;
  scope: Scope;
  tracking: TrackingConfig;
  home?: { sections: Section[] };
  /**
   * Regions other than Sul: is the region publicly LAUNCHED (reachable in the storefront, listed in the navigation)? A region can be fully
   * editable, drafted and previewed in the CMS long before that. Absent/false = still in preview. Sul is always launched and ignores this.
   * Part of the document, so publishing (or restoring) a release changes it together with everything else, per region, and a release is
   * the audit trail of every launch and recall.
   */
  launched?: boolean;
  /**
   * Header / mobile-menu navigation of this REGION (labels, order and visibility of a few blocks and of the known primary links; the states and
   * the other regions are never listed here: they come from real data). Absent = the default hierarchy with the default labels. Published with the region.
   */
  navigation?: NavigationConfig;
  /**
   * Palette of the storefront chrome. On a region: `inherit` (the global palette) or `override` (its own); absent = the look the region has today.
   * On `global`: the "Use Origens" palette regions may inherit (always `override`). Published with its scope.
   */
  theme?: ThemeConfig;
  /**
   * "Cupons e promoções" of this REGION: copyable coupons and announcements without a code, each with its own texts, order and optional window.
   * Absent or empty = no button anywhere. Published with the region (never with a page); the public reads only live items (site-config/promotions.ts).
   */
  promotions?: PromotionsConfig;
  /**
   * Hotpages and parent-category landings of this region. Part of the document for storage and rollback, but PUBLISHED ON THEIR OWN: publishing the
   * home never publishes a draft page, and publishing a page never touches the home (admin/publishing.ts composes the bundle per target).
   */
  pages?: Page[];
  /** Personalization models of this region (published on their own, like the pages). */
  customizers?: Customizer[];
  /**
   * INK collections this scope's CMS has explicitly ENABLED as section sources. Only meaningful for internal (hidden-on-INK) collections:
   * public ones are usable by default. Part of the document, so a publish and a rollback carry it together with the sections that use it.
   */
  collections?: {
    enabled: CollectionRef[];
    /**
     * LEGACY (round 1 of the INK navbar): a flat list of collections shown in the navbar, ordered by INK's own position. Kept readable so documents
     * published before the two groups existed keep their selection: `effectiveNavbarGroups` maps it to `top`. New edits write `navbarGroups` and
     * drop this key. Never written by new code.
     */
    navbar?: CollectionRef[];
    /**
     * Where each PUBLIC INK collection appears in the navbar the Worker draws on the INK product pages: `top` (straight on the bar) or `more`
     * ("Demais categorias" dropdown). A collection not listed is not shown. Any number in each group, in the order listed (the owner's order, never
     * alphabetical); a collection belongs to at most ONE group. INDEPENDENT of `enabled` (home sections). Only collections that are PUBLIC on INK, have
     * products and a valid slug are ever published to the Worker, checked at read time (`site-config/navbar.ts`); an ineligible one keeps its place here.
     * There are no special slots ("Novidades", "destaque"): those are just names of collections.
     */
    navbarGroups?: { top: CollectionRef[]; more: CollectionRef[] };
  };
};

/** `variants` (uploads only): the pre-sized WebP widths the storefront uses as a `srcset`, so an uploaded image never goes through the image optimizer. */
export type MediaAssetInfo = { src: string; width: number; height: number; variants?: { w: number; src: string }[] };

/** What the storefront reads: every scope, plus the resolved media table. Written atomically by the publisher. */
export type PublishedBundle = {
  schemaVersion: 1;
  releaseId: string;
  docs: Record<Scope, ScopeDoc>;
  media: Record<string, MediaAssetInfo>;
};

// ── Validation ────────────────────────────────────────────────────────────────────────────────────────────────

const HEX = /^#[0-9a-fA-F]{6}$/;
const SLUG = /^[a-z0-9-]{1,40}$/;
const ID = /^[A-Za-z0-9_-]{1,40}$/;
/** ULID for uploads (`01J…`) or `legacy:<path>` for the files that already live in /public (migration seed). */
const ASSET_ID = /^[A-Za-z0-9_:/-]{1,60}$/;
const META_PIXEL = /^\d{10,20}$/; // same rule as validateMetaPixelId (src/lib/config/env.ts)
const GA4 = /^G-[A-Z0-9]{4,20}$/; // same rule as validateGaMeasurementId
const STORES: readonly string[] = ["use-sul", "use-norte", "use-centro", "use-origens"];
const MAX_OVERLAY_OPACITY = 0.85;
/** Hosts an `external` destination may use — mirrors ALLOWED_COMMERCE_HOSTS in src/lib/ink/config.ts (kept literal here so this file stays pure). */
export const ALLOWED_DESTINATION_HOSTS: readonly string[] = ["www.usesul.com.br", "www.usenorte.com.br", "www.usecentro.com.br", "loja.useorigens.com.br"];

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

class Collector {
  readonly errors: string[] = [];
  fail(path: string, message: string) {
    this.errors.push(`${path}: ${message}`);
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

function checkColor(c: Collector, path: string, v: unknown): void {
  if (typeof v !== "string") return c.fail(path, "must be a colour");
  if (v.startsWith("token:")) {
    if (!(COLOR_TOKENS as readonly string[]).includes(v.slice(6))) c.fail(path, `unknown colour token "${v}"`);
  } else if (!HEX.test(v)) c.fail(path, "must be #rrggbb or token:<name>");
}

function checkPoint(c: Collector, path: string, v: unknown): void {
  if (!isRecord(v) || typeof v.x !== "number" || typeof v.y !== "number" || v.x < 0 || v.x > 100 || v.y < 0 || v.y > 100) c.fail(path, "focal point must be {x,y} within 0..100");
}

function checkFill(c: Collector, path: string, v: unknown): void {
  if (!isRecord(v)) return c.fail(path, "must be an object");
  if (v.kind === "none") return;
  if (v.kind === "solid") return checkColor(c, `${path}.color`, v.color);
  if (v.kind === "gradient") {
    checkColor(c, `${path}.from`, v.from);
    checkColor(c, `${path}.to`, v.to);
    if (typeof v.angle !== "number" || v.angle < 0 || v.angle > 360) c.fail(`${path}.angle`, "must be 0..360");
    return;
  }
  c.fail(`${path}.kind`, "must be none | solid | gradient");
}

function checkMediaRef(c: Collector, path: string, v: unknown): void {
  if (!isRecord(v)) return c.fail(path, "must be an object");
  if (typeof v.assetId !== "string" || !ASSET_ID.test(v.assetId) || v.assetId.includes("..")) c.fail(`${path}.assetId`, "invalid asset id");
  if (typeof v.decorative !== "boolean") c.fail(`${path}.decorative`, "must be boolean");
  if (typeof v.alt !== "string" || v.alt.length > 200) c.fail(`${path}.alt`, "alt text ≤ 200 chars");
  // Accessibility: a meaningful image must describe itself; a decorative one must not.
  else if (v.decorative === false && v.alt.trim() === "") c.fail(`${path}.alt`, "required unless decorative");
  else if (v.decorative === true && v.alt !== "") c.fail(`${path}.alt`, "must be empty when decorative");
}

function checkAppearance(c: Collector, path: string, v: unknown): void {
  if (!isRecord(v)) return c.fail(path, "must be an object");
  checkFill(c, `${path}.fill`, v.fill);
  if (v.image !== undefined) {
    if (!isRecord(v.image)) c.fail(`${path}.image`, "must be an object");
    else {
      if (v.image.mobile !== undefined) checkMediaRef(c, `${path}.image.mobile`, v.image.mobile);
      if (v.image.desktop !== undefined) checkMediaRef(c, `${path}.image.desktop`, v.image.desktop);
      if (v.image.reuseMobileOnDesktop !== undefined && typeof v.image.reuseMobileOnDesktop !== "boolean") c.fail(`${path}.image.reuseMobileOnDesktop`, "must be boolean");
    }
  }
  if (!isRecord(v.focal)) c.fail(`${path}.focal`, "must have mobile and desktop points");
  else {
    checkPoint(c, `${path}.focal.mobile`, v.focal.mobile);
    checkPoint(c, `${path}.focal.desktop`, v.focal.desktop);
  }
  const o = v.overlay;
  if (!isRecord(o)) c.fail(`${path}.overlay`, "must be an object");
  else if ("preset" in o) {
    if (!(OVERLAY_PRESETS as readonly unknown[]).includes(o.preset)) c.fail(`${path}.overlay.preset`, "unknown preset");
  } else {
    if (typeof o.color !== "string" || !HEX.test(o.color)) c.fail(`${path}.overlay.color`, "must be #rrggbb");
    if (typeof o.opacity !== "number" || o.opacity < 0 || o.opacity > MAX_OVERLAY_OPACITY) c.fail(`${path}.overlay.opacity`, `must be 0..${MAX_OVERLAY_OPACITY}`);
  }
}

function checkDestination(c: Collector, path: string, v: unknown): void {
  if (!isRecord(v)) return c.fail(path, "must be an object");
  if (v.kind === "route") {
    // Internal, absolute, no scheme/host, no traversal: `/sul`, `/sul/sc`, `/sul/sc/tijucas`.
    if (typeof v.path !== "string" || !/^\/[a-z0-9-]+(\/[a-z0-9-]+){0,2}$/.test(v.path)) c.fail(`${path}.path`, "must be an internal route like /sul/sc");
  } else if (v.kind === "ink-collection") {
    if (typeof v.store !== "string" || !STORES.includes(v.store)) c.fail(`${path}.store`, "unknown store");
    if (typeof v.collectionId !== "number" || !Number.isInteger(v.collectionId) || v.collectionId <= 0) c.fail(`${path}.collectionId`, "must be a positive integer");
  } else if (v.kind === "page") {
    if (!(PAGE_KINDS as readonly unknown[]).includes(v.pageKind)) c.fail(`${path}.pageKind`, "must be hotpage | categoryLanding");
    if (typeof v.slug !== "string" || !PAGE_SLUG.test(v.slug) || v.slug.length > 60) c.fail(`${path}.slug`, "invalid page slug");
  } else if (v.kind === "anchor") {
    if (typeof v.anchor !== "string" || !SLUG.test(v.anchor)) c.fail(`${path}.anchor`, "must match [a-z0-9-]{1,40}");
  } else if (v.kind === "external") {
    let ok = false;
    if (typeof v.url === "string") {
      try {
        const u = new URL(v.url);
        ok = u.protocol === "https:" && ALLOWED_DESTINATION_HOSTS.includes(u.hostname) && u.username === "" && u.password === "";
      } catch {
        ok = false;
      }
    }
    if (!ok) c.fail(`${path}.url`, "must be https on an allowed store host");
  } else c.fail(`${path}.kind`, "must be route | page | anchor | ink-collection | external");
}

/** An ink-category's own order / hidden list: at most the products a collection keeps for showcases (MAX_STORED_MEMBERS = 48), with room to spare. */
export const MAX_ARRANGED_IDS = 100;
const isInkIdList = (v: unknown): boolean =>
  Array.isArray(v) && v.length <= MAX_ARRANGED_IDS && v.every((p) => typeof p === "string" && /^\d{1,20}$/.test(p)) && new Set(v).size === v.length;

function checkSource(c: Collector, path: string, v: unknown, max: number): void {
  if (!isRecord(v)) return c.fail(path, "must be an object");
  const badLimit = (n: unknown) => typeof n !== "number" || !Number.isInteger(n) || n < MIN_SECTION_PRODUCTS || n > max;
  if (v.kind === "editorial-module") {
    if (!(EDITORIAL_MODULE_KEYS as readonly unknown[]).includes(v.key)) c.fail(`${path}.key`, "unknown editorial module");
  } else if (v.kind === "ink-category" || v.kind === "manual") {
    if (badLimit(v.limit)) c.fail(`${path}.limit`, `must be an integer ${MIN_SECTION_PRODUCTS}..${max}`);
    if (v.kind === "ink-category") {
      if (typeof v.store !== "string" || !STORES.includes(v.store)) c.fail(`${path}.store`, "unknown store");
      if (typeof v.collectionId !== "number" || !Number.isInteger(v.collectionId) || v.collectionId <= 0) c.fail(`${path}.collectionId`, "must be a positive integer");
      if (v.order !== "category" && v.order !== "manual") c.fail(`${path}.order`, "must be category | manual");
      if (v.productIds !== undefined && (v.order !== "manual" || !isInkIdList(v.productIds))) c.fail(`${path}.productIds`, `only with order manual: ≤ ${MAX_ARRANGED_IDS} distinct numeric INK ids`);
      if (v.hiddenIds !== undefined && !isInkIdList(v.hiddenIds)) c.fail(`${path}.hiddenIds`, `must be ≤ ${MAX_ARRANGED_IDS} distinct numeric INK ids`);
    } else if (!Array.isArray(v.productIds) || v.productIds.length > 100 || v.productIds.some((p) => typeof p !== "string" || !/^\d{1,20}$/.test(p))) {
      c.fail(`${path}.productIds`, "must be ≤ 100 numeric INK ids");
    }
  } else if (v.kind === "umapenca") {
    if (badLimit(v.limit)) c.fail(`${path}.limit`, `must be an integer ${MIN_SECTION_PRODUCTS}..${max}`);
    const kinds = v.articleKinds;
    if (!Array.isArray(kinds) || kinds.length === 0 || kinds.some((k) => !(ARTICLE_KINDS as readonly unknown[]).includes(k)) || new Set(kinds).size !== kinds.length) c.fail(`${path}.articleKinds`, `a non-empty list of distinct ${ARTICLE_KINDS.join(", ")}`);
  } else c.fail(`${path}.kind`, "must be editorial-module | ink-category | manual | umapenca");
}

function checkSection(c: Collector, path: string, v: unknown): void {
  if (!isRecord(v)) return c.fail(path, "must be an object");
  if (typeof v.id !== "string" || !ID.test(v.id)) c.fail(`${path}.id`, "invalid id");
  if (typeof v.anchor !== "string" || !SLUG.test(v.anchor)) c.fail(`${path}.anchor`, "must match [a-z0-9-]{1,40}");
  if (typeof v.headingId !== "string" || !SLUG.test(v.headingId)) c.fail(`${path}.headingId`, "must match [a-z0-9-]{1,40}");
  if (!(TEMPLATE_KEYS as readonly unknown[]).includes(v.template)) c.fail(`${path}.template`, "unknown template");
  if (typeof v.active !== "boolean") c.fail(`${path}.active`, "must be boolean");
  if (v.title !== undefined && !isStr(v.title, 120)) c.fail(`${path}.title`, "1..120 chars");
  if (v.subtitle !== undefined && !isStr(v.subtitle, 300)) c.fail(`${path}.subtitle`, "1..300 chars");
  if (v.cta !== undefined) {
    if (!isRecord(v.cta) || !isStr(v.cta.label, 32)) c.fail(`${path}.cta.label`, "1..32 chars");
    else checkDestination(c, `${path}.cta.dest`, v.cta.dest);
  }
  if (v.layout !== undefined) {
    const l = v.layout;
    if (!isRecord(l) || (l.variant !== "standard" && l.variant !== "poster") || (l.tone !== "light" && l.tone !== "dark") || !["paper", "plain", "region-primary"].includes(l.surface as string)) {
      c.fail(`${path}.layout`, "must be {variant: standard|poster, tone: light|dark, surface: paper|plain|region-primary}");
    } else {
      if (l.display !== undefined && (v.template !== "product-carousel" || !(PRODUCT_DISPLAYS as readonly unknown[]).includes(l.display))) c.fail(`${path}.layout.display`, `product sections only: ${PRODUCT_DISPLAYS.join(" | ")}`);
      if (l.buyLabel !== undefined && (v.template !== "product-carousel" || !isStr(l.buyLabel, MAX_BUY_LABEL) || l.buyLabel.trim() !== l.buyLabel)) c.fail(`${path}.layout.buyLabel`, `product sections only: 1..${MAX_BUY_LABEL} chars, no leading or trailing spaces`);
      if (l.tags !== undefined) {
        const t = l.tags;
        const ok =
          v.template === "product-carousel" &&
          isRecord(t) &&
          Object.keys(t).every((k) => k === "discount" || k === "text") &&
          (t.discount === undefined || t.discount === true) &&
          (t.text === undefined || (isStr(t.text, MAX_TAG_TEXT) && t.text.trim() === t.text)) &&
          (t.discount === true || t.text !== undefined);
        if (!ok) c.fail(`${path}.layout.tags`, `product sections only: { discount?: true, text?: 1..${MAX_TAG_TEXT} chars }, at least one`);
      }
    }
  }
  // A grid shows more cards than a carousel scrolls through: the ceiling follows the display.
  if (v.source !== undefined) checkSource(c, `${path}.source`, v.source, isRecord(v.layout) && v.layout.display === "grid" ? MAX_GRID_PRODUCTS : MAX_CAROUSEL_PRODUCTS);
  if (v.analyticsSource !== undefined && !(CAROUSEL_SOURCE_KEYS as readonly unknown[]).includes(v.analyticsSource)) c.fail(`${path}.analyticsSource`, "not an allowed analytics origin");
  if (v.fallback !== undefined && v.fallback !== "crops" && v.fallback !== "fill") c.fail(`${path}.fallback`, "must be crops | fill");
  if (v.featured !== undefined) {
    if (v.template !== "hero" || !Array.isArray(v.featured) || v.featured.length > MAX_FEATURED) c.fail(`${path}.featured`, `hero only, at most ${MAX_FEATURED} products`);
    else {
      const seen = new Set<string>();
      v.featured.forEach((ref, i) => {
        if (!isRecord(ref) || typeof ref.store !== "string" || !STORES.includes(ref.store) || typeof ref.productId !== "string" || !/^\d{1,20}$/.test(ref.productId)) return c.fail(`${path}.featured[${i}]`, "must be { store, productId (numeric INK id) }");
        const key = `${ref.store}:${ref.productId}`;
        if (seen.has(key)) c.fail(`${path}.featured[${i}]`, "the same product twice");
        seen.add(key);
      });
    }
  }
  if (v.nav !== undefined) {
    if (v.template === "hero" || v.template === "footer" || v.template === "page-hero" || !isRecord(v.nav) || !isStr(v.nav.label, 24)) c.fail(`${path}.nav`, "not for the hero or footer; label 1..24 characters");
    else if (v.nav.dest !== undefined) checkDestination(c, `${path}.nav.dest`, v.nav.dest);
  }
  if (v.customizerCard !== undefined) {
    const cc = v.customizerCard;
    if (v.template !== "product-carousel" || !isRecord(cc)) c.fail(`${path}.customizerCard`, "product carousels only");
    else {
      if (typeof cc.customizerId !== "string" || !ID.test(cc.customizerId)) c.fail(`${path}.customizerCard.customizerId`, "invalid customizer id");
      if (!isStr(cc.title, 60)) c.fail(`${path}.customizerCard.title`, "1..60 chars");
      if (cc.description !== undefined && !isStr(cc.description, 120)) c.fail(`${path}.customizerCard.description`, "1..120 chars");
      if (!isStr(cc.button, 24)) c.fail(`${path}.customizerCard.button`, "1..24 chars");
      if (cc.image !== undefined) checkMediaRef(c, `${path}.customizerCard.image`, cc.image);
    }
  }
  if (v.stateCovers !== undefined) {
    if (v.template !== "states" || !isRecord(v.stateCovers) || Object.keys(v.stateCovers).length > 27) c.fail(`${path}.stateCovers`, "state chooser only, at most one cover per state");
    else for (const [uf, ref] of Object.entries(v.stateCovers)) {
      if (!/^[A-Z]{2}$/.test(uf)) c.fail(`${path}.stateCovers.${uf}`, "the key must be a UF such as PA");
      else checkMediaRef(c, `${path}.stateCovers.${uf}`, ref);
    }
  }
  if (v.tiles !== undefined) {
    if (v.template !== "image-grid" || !Array.isArray(v.tiles) || v.tiles.length < MIN_GRID_TILES || v.tiles.length > MAX_GRID_TILES) c.fail(`${path}.tiles`, `image grid only, ${MIN_GRID_TILES}..${MAX_GRID_TILES} tiles`);
    else v.tiles.forEach((t, i) => {
      const at = `${path}.tiles[${i}]`;
      if (!isRecord(t)) return c.fail(at, "must be an object");
      if (!isStr(t.label, 40)) c.fail(`${at}.label`, "1..40 chars");
      if (t.caption !== undefined && !isStr(t.caption, 80)) c.fail(`${at}.caption`, "1..80 chars");
      if (t.image !== undefined) checkMediaRef(c, `${at}.image`, t.image);
      checkDestination(c, `${at}.dest`, t.dest);
    });
  }
  if (v.grid !== undefined) {
    const g = v.grid;
    if (v.template !== "image-grid" || !isRecord(g) || !(GRID_COLUMNS as readonly unknown[]).includes(g.columns) || !(GRID_ASPECTS as readonly unknown[]).includes(g.aspect) || !(GRID_LABELS as readonly unknown[]).includes(g.labels)) {
      c.fail(`${path}.grid`, `image grid only: {columns: ${GRID_COLUMNS.join("|")}, aspect: ${GRID_ASPECTS.join("|")}, labels: ${GRID_LABELS.join("|")}}`);
    }
  }
  if (v.template === "image-grid") {
    if (!v.title) c.fail(`${path}.title`, "required for an image grid");
    if (!v.tiles) c.fail(`${path}.tiles`, "required for an image grid");
    if (!v.grid) c.fail(`${path}.grid`, "required for an image grid");
  }
  if (v.count !== undefined && (v.template !== "city-styles" || typeof v.count !== "number" || !Number.isInteger(v.count) || v.count < 1 || v.count > 8)) c.fail(`${path}.count`, "city styles only, an integer 1..8");
  if (v.template === "page-hero" && !v.title) c.fail(`${path}.title`, "required for a page hero");
  if (v.template === "product-carousel") {
    if (!v.layout) c.fail(`${path}.layout`, "required for product-carousel");
    if (!v.source) c.fail(`${path}.source`, "required for product-carousel");
    if (!v.analyticsSource) c.fail(`${path}.analyticsSource`, "required for product-carousel");
    if (!v.title) c.fail(`${path}.title`, "required for product-carousel");
  }
  checkAppearance(c, `${path}.appearance`, v.appearance);
}

const TEMPLATES_IN_PAGES: readonly string[] = ["page-hero", "product-carousel", "campaign", "states", "city-styles", "image-grid"];

function checkSlug(c: Collector, path: string, v: unknown): void {
  if (typeof v !== "string" || v.length < 2 || v.length > 60 || !PAGE_SLUG.test(v)) c.fail(path, "2..60 chars: lowercase letters, digits and single hyphens");
  else if (RESERVED_SLUGS.includes(v)) c.fail(path, `"${v}" is reserved`);
}

function checkPageBackdrop(c: Collector, path: string, v: unknown): void {
  if (!isRecord(v)) return c.fail(path, "must be { color, tone, pattern? }");
  if (typeof v.color !== "string" || !HEX.test(v.color)) c.fail(`${path}.color`, "must be #rrggbb");
  if (v.tone !== "light" && v.tone !== "dark") c.fail(`${path}.tone`, "must be light | dark");
  if (v.pattern === undefined) return;
  const p = v.pattern;
  if (!isRecord(p)) return c.fail(`${path}.pattern`, "must be { image, size, opacity }");
  checkMediaRef(c, `${path}.pattern.image`, p.image);
  // The pattern is texture, never content: always decorative.
  if (isRecord(p.image) && p.image.decorative !== true) c.fail(`${path}.pattern.image.decorative`, "a pattern is always decorative");
  if (typeof p.size !== "number" || !Number.isInteger(p.size) || p.size < PATTERN_SIZE.min || p.size > PATTERN_SIZE.max) c.fail(`${path}.pattern.size`, `an integer ${PATTERN_SIZE.min}..${PATTERN_SIZE.max} (pixels)`);
  if (typeof p.opacity !== "number" || !Number.isFinite(p.opacity) || p.opacity < PATTERN_OPACITY.min || p.opacity > PATTERN_OPACITY.max) c.fail(`${path}.pattern.opacity`, `${PATTERN_OPACITY.min}..${PATTERN_OPACITY.max}`);
}

function checkPage(c: Collector, path: string, v: unknown): void {
  if (!isRecord(v)) return c.fail(path, "must be an object");
  if (typeof v.id !== "string" || !ID.test(v.id)) c.fail(`${path}.id`, "invalid id");
  if (!(PAGE_KINDS as readonly unknown[]).includes(v.kind)) c.fail(`${path}.kind`, "must be hotpage | categoryLanding");
  checkSlug(c, `${path}.slug`, v.slug);
  if (!isStr(v.title, 120)) c.fail(`${path}.title`, "1..120 chars");
  if (typeof v.version !== "number" || !Number.isInteger(v.version) || v.version < 1) c.fail(`${path}.version`, "must be a positive integer");
  if (v.archived !== undefined && typeof v.archived !== "boolean") c.fail(`${path}.archived`, "must be boolean");
  if (!isRecord(v.seo) || typeof v.seo.indexable !== "boolean") c.fail(`${path}.seo`, "must be { indexable, title?, description?, ogImage? }");
  else {
    if (v.seo.title !== undefined && !isStr(v.seo.title, 70)) c.fail(`${path}.seo.title`, "1..70 chars");
    if (v.seo.description !== undefined && !isStr(v.seo.description, 200)) c.fail(`${path}.seo.description`, "1..200 chars");
    if (v.seo.ogImage !== undefined) checkMediaRef(c, `${path}.seo.ogImage`, v.seo.ogImage);
  }
  if (v.backdrop !== undefined) checkPageBackdrop(c, `${path}.backdrop`, v.backdrop);
  const sections = v.sections;
  if (!Array.isArray(sections) || sections.length < 1 || sections.length > 40) return c.fail(`${path}.sections`, "1..40 sections");
  sections.forEach((s, i) => {
    checkSection(c, `${path}.sections[${i}]`, s);
    if (!isRecord(s)) return;
    if (typeof s.template === "string" && !TEMPLATES_IN_PAGES.includes(s.template)) c.fail(`${path}.sections[${i}].template`, "not allowed in a page");
    if (i === 0 && s.template !== "page-hero") c.fail(`${path}.sections[0]`, "the first section must be the page hero");
    if (i > 0 && s.template === "page-hero") c.fail(`${path}.sections[${i}]`, "the page hero appears once, first");
  });
  const anchors = new Set<string>();
  const ids = new Set<string>();
  sections.forEach((s, i) => {
    if (!isRecord(s)) return;
    if (typeof s.anchor === "string") {
      if (anchors.has(s.anchor)) c.fail(`${path}.sections[${i}].anchor`, "duplicate anchor");
      anchors.add(s.anchor);
    }
    if (typeof s.id === "string") {
      if (ids.has(s.id)) c.fail(`${path}.sections[${i}].id`, "duplicate id");
      ids.add(s.id);
    }
  });
}

function checkTextField(c: Collector, path: string, f: unknown, keyPattern = /^[a-z][a-z0-9_]{0,29}$/): void {
  if (!isRecord(f)) return c.fail(path, "must be an object");
  if (typeof f.key !== "string" || !keyPattern.test(f.key)) c.fail(`${path}.key`, "stable key: lowercase letters, digits and _");
  if (!isStr(f.label, 60)) c.fail(`${path}.label`, "1..60 chars");
  for (const [name, max] of [["placeholder", 80], ["helperText", 200], ["defaultValue", 120]] as const) if (f[name] !== undefined && (typeof f[name] !== "string" || (f[name] as string).length > max)) c.fail(`${path}.${name}`, `≤ ${max} chars`);
}

function checkCustomizer(c: Collector, path: string, v: unknown): void {
  if (!isRecord(v)) return c.fail(path, "must be an object");
  if (typeof v.id !== "string" || !ID.test(v.id)) c.fail(`${path}.id`, "invalid id");
  checkSlug(c, `${path}.slug`, v.slug);
  if (!isStr(v.name, 80)) c.fail(`${path}.name`, "1..80 chars");
  if (v.description !== undefined && !isStr(v.description, 300)) c.fail(`${path}.description`, "1..300 chars");
  if (isRecord(v.source) && v.source.kind === "umapenca") {
    if (typeof v.source.articleKind !== "string" || !(ARTICLE_KINDS as readonly string[]).includes(v.source.articleKind)) c.fail(`${path}.source.articleKind`, `one of ${ARTICLE_KINDS.join(", ")}`);
    if (v.inkProductId !== undefined) c.fail(`${path}.inkProductId`, "an Uma Penca model has no INK product");
  } else {
    if (!isRecord(v.source) || typeof v.source.store !== "string" || !STORES.includes(v.source.store) || typeof v.source.collectionId !== "number" || !Number.isInteger(v.source.collectionId) || v.source.collectionId <= 0) c.fail(`${path}.source`, "must be { store, collectionId } or { kind: \"umapenca\", articleKind }");
    if (v.inkProductId !== undefined && (typeof v.inkProductId !== "string" || !/^\d{1,20}$/.test(v.inkProductId))) c.fail(`${path}.inkProductId`, "numeric INK id");
  }
  if (v.cardImage !== undefined) checkMediaRef(c, `${path}.cardImage`, v.cardImage);
  if (v.pageMockup !== undefined) checkMediaRef(c, `${path}.pageMockup`, v.pageMockup);
  if (v.previewMode !== "mockupWithTextSummary") c.fail(`${path}.previewMode`, "must be mockupWithTextSummary");
  if (typeof v.active !== "boolean") c.fail(`${path}.active`, "must be boolean");
  else if (v.active && !v.pageMockup) c.fail(`${path}.pageMockup`, "an active model needs its page mockup");
  if (typeof v.version !== "number" || !Number.isInteger(v.version) || v.version < 1) c.fail(`${path}.version`, "must be a positive integer");
  const keys = new Set<string>();
  if (!Array.isArray(v.fields) || v.fields.length > MAX_CUSTOM_FIELDS) c.fail(`${path}.fields`, `at most ${MAX_CUSTOM_FIELDS} fields`);
  else v.fields.forEach((f, i) => {
    checkTextField(c, `${path}.fields[${i}]`, f);
    if (!isRecord(f)) return;
    if (typeof f.required !== "boolean") c.fail(`${path}.fields[${i}].required`, "must be boolean");
    if (typeof f.maxLength !== "number" || !Number.isInteger(f.maxLength) || f.maxLength < 1 || f.maxLength > 200) c.fail(`${path}.fields[${i}].maxLength`, "integer 1..200");
    if (f.type !== "text") c.fail(`${path}.fields[${i}].type`, "V1 supports text only");
    if (typeof f.position !== "number" || !Number.isInteger(f.position)) c.fail(`${path}.fields[${i}].position`, "must be an integer");
    if (typeof f.defaultValue === "string" && typeof f.maxLength === "number" && f.defaultValue.length > f.maxLength) c.fail(`${path}.fields[${i}].defaultValue`, "longer than maxLength");
    if (typeof f.key === "string") {
      if (keys.has(f.key)) c.fail(`${path}.fields[${i}].key`, "duplicate key");
      keys.add(f.key);
    }
  });
  if (v.lineGroup !== undefined) {
    const g = v.lineGroup;
    checkTextField(c, `${path}.lineGroup`, g);
    if (isRecord(g)) {
      if (!isStr(g.lineLabel, 40)) c.fail(`${path}.lineGroup.lineLabel`, "1..40 chars (use {n} for the line number)");
      const int = (x: unknown, lo: number, hi: number) => typeof x === "number" && Number.isInteger(x) && x >= lo && x <= hi;
      if (!int(g.min, 0, MAX_LINE_GROUP) || !int(g.max, 1, MAX_LINE_GROUP) || !int(g.initial, 0, MAX_LINE_GROUP)) c.fail(`${path}.lineGroup`, `min, initial and max are integers up to ${MAX_LINE_GROUP}`);
      else if ((g.min as number) > (g.max as number) || (g.initial as number) < (g.min as number) || (g.initial as number) > (g.max as number)) c.fail(`${path}.lineGroup`, "must satisfy min ≤ initial ≤ max");
      if (!int(g.maxLength, 1, 200)) c.fail(`${path}.lineGroup.maxLength`, "integer 1..200");
      if (typeof g.key === "string" && keys.has(g.key)) c.fail(`${path}.lineGroup.key`, "duplicate key");
      if (g.defaults !== undefined && (!Array.isArray(g.defaults) || g.defaults.length > MAX_LINE_GROUP || g.defaults.some((d) => typeof d !== "string" || d.length > 200))) c.fail(`${path}.lineGroup.defaults`, "a list of short texts");
    }
  }
}

/** Validates ONE page (used by the editor and by the tolerant published reader); `scope` adds the region rules (own store, own routes). */
export function validatePage(input: unknown, scope: Scope, path = "page"): ValidationResult<Page> {
  const c = new Collector();
  checkPage(c, path, input);
  if (isRecord(input) && Array.isArray(input.sections)) checkRegionRules(c, path, input.sections, scope);
  return c.errors.length === 0 ? { ok: true, value: input as Page } : { ok: false, errors: c.errors };
}
export function validateCustomizer(input: unknown, scope: Scope, path = "customizer"): ValidationResult<Customizer> {
  const c = new Collector();
  checkCustomizer(c, path, input);
  const own = REGIONS[scope as RegionSlug]?.storeKey;
  if (isRecord(input) && isRecord(input.source) && input.source.kind !== "umapenca" && own && input.source.store !== own) c.fail(`${path}.source.store`, "belongs to another region's INK store");
  return c.errors.length === 0 ? { ok: true, value: input as Customizer } : { ok: false, errors: c.errors };
}

/** The region rules shared by the home and the pages: a section's sources, buttons and cards stay inside THIS region. */
function checkRegionRules(c: Collector, base: string, sections: unknown[], sc: Scope): void {
  const region = REGIONS[sc as RegionSlug];
  if (!region) return;
  sections.forEach((s, i) => {
    if (!isRecord(s)) return;
    const at = `${base}.sections[${i}]`;
    if (isRecord(s.source) && s.source.kind === "ink-category" && s.source.store !== region.storeKey) c.fail(`${at}.source.store`, "belongs to another region's INK store");
    for (const [name, dest] of [["cta", isRecord(s.cta) && isRecord(s.cta.dest) ? s.cta.dest : null], ["nav", isRecord(s.nav) && isRecord(s.nav.dest) ? s.nav.dest : null]] as const) {
      if (!dest) continue;
      if (dest.kind === "ink-collection" && dest.store !== region.storeKey) c.fail(`${at}.${name}.dest.store`, "belongs to another region's INK store");
      if (dest.kind === "route" && typeof dest.path === "string" && dest.path !== `/${sc}` && !dest.path.startsWith(`/${sc}/`)) c.fail(`${at}.${name}.dest.path`, "must be a page of this region");
    }
    if (isRecord(s.stateCovers)) for (const uf of Object.keys(s.stateCovers)) if (!(region.ufs as readonly string[]).includes(uf)) c.fail(`${at}.stateCovers.${uf}`, "not a state of this region");
    checkTileRegion(c, at, s.tiles, sc);
    if (Array.isArray(s.featured)) s.featured.forEach((ref, j) => { if (isRecord(ref) && ref.store !== region.storeKey) c.fail(`${at}.featured[${j}].store`, "belongs to another region's INK store"); });
  });
}

/** A grid tile, like a button, stays inside its region: its own INK store, its own pages. */
function checkTileRegion(c: Collector, at: string, tiles: unknown, sc: Scope): void {
  const region = REGIONS[sc as RegionSlug];
  if (!region || !Array.isArray(tiles)) return;
  tiles.forEach((t, j) => {
    const dest = isRecord(t) && isRecord(t.dest) ? t.dest : null;
    if (!dest) return;
    if (dest.kind === "ink-collection" && dest.store !== region.storeKey) c.fail(`${at}.tiles[${j}].dest.store`, "belongs to another region's INK store");
    if (dest.kind === "route" && typeof dest.path === "string" && dest.path !== `/${sc}` && !dest.path.startsWith(`/${sc}/`)) c.fail(`${at}.tiles[${j}].dest.path`, "must be a page of this region");
  });
}

function checkVendor(c: Collector, path: string, v: unknown, pattern: RegExp, scope: Scope): void {
  if (!isRecord(v)) return c.fail(path, "must be an object");
  if (v.mode === "override") {
    if (typeof v.id !== "string" || !pattern.test(v.id)) c.fail(`${path}.id`, "invalid id format for this vendor");
  } else if (v.mode === "inherit") {
    if (scope === "global") c.fail(`${path}.mode`, "global cannot inherit");
  } else if (v.mode === "legacy") {
    if (scope !== "sul") c.fail(`${path}.mode`, "legacy (build-time IDs) exists only for sul");
  } else if (v.mode === "disabled") {
    if (v.id !== undefined && (scope !== "global" || typeof v.id !== "string" || !pattern.test(v.id))) c.fail(`${path}.id`, "only the global document may keep an inactive ID, in the vendor's format");
  } else c.fail(`${path}.mode`, "must be inherit | override | disabled | legacy");
}

/** Validates ONE section on its own (used by the editor and by the tolerant published-bundle reader). */
export function validateSection(input: unknown, path = "section"): ValidationResult<Section> {
  const c = new Collector();
  checkSection(c, path, input);
  return c.errors.length === 0 ? { ok: true, value: input as Section } : { ok: false, errors: c.errors };
}

/** Sanity ceiling per navbar group (payload size), NOT an editorial limit: the owner decides how many collections go on top or in the dropdown. */
export const MAX_NAVBAR_GROUP = 60;

function checkRefList(c: Collector, path: string, list: unknown, max: number): void {
  if (!Array.isArray(list)) return c.fail(path, "must be an array");
  if (list.length > max) c.fail(path, `at most ${max} entries`);
  const seen = new Set<string>();
  list.forEach((ref, i) => {
    if (!isRecord(ref) || typeof ref.store !== "string" || !STORES.includes(ref.store) || typeof ref.collectionId !== "number" || !Number.isInteger(ref.collectionId) || ref.collectionId <= 0) {
      return c.fail(`${path}[${i}]`, "must be { store, collectionId }");
    }
    const key = `${ref.store}:${ref.collectionId}`;
    if (seen.has(key)) c.fail(`${path}[${i}]`, "duplicate");
    seen.add(key);
  });
}

function checkCollections(c: Collector, path: string, v: unknown): void {
  if (!isRecord(v) || !Array.isArray(v.enabled)) return c.fail(path, "must be { enabled: [...] }");
  checkRefList(c, `${path}.enabled`, v.enabled, 300);
  if (v.navbar !== undefined) checkRefList(c, `${path}.navbar`, v.navbar, 300); // legacy flat list
  if (v.navbarGroups !== undefined) {
    if (!isRecord(v.navbarGroups) || !Array.isArray(v.navbarGroups.top) || !Array.isArray(v.navbarGroups.more)) return c.fail(`${path}.navbarGroups`, "must be { top: [...], more: [...] }");
    checkRefList(c, `${path}.navbarGroups.top`, v.navbarGroups.top, MAX_NAVBAR_GROUP);
    checkRefList(c, `${path}.navbarGroups.more`, v.navbarGroups.more, MAX_NAVBAR_GROUP);
    // One collection, one place: never on top AND in the dropdown.
    const top = new Set(v.navbarGroups.top.filter(isRecord).map((r) => `${r.store}:${r.collectionId}`));
    v.navbarGroups.more.forEach((r, i) => { if (isRecord(r) && top.has(`${r.store}:${r.collectionId}`)) c.fail(`${path}.navbarGroups.more[${i}]`, "already in the top group"); });
  }
}

export function validateScopeDoc(input: unknown): ValidationResult<ScopeDoc> {
  const c = new Collector();
  if (!isRecord(input)) return { ok: false, errors: ["doc: must be an object"] };
  if (input.schemaVersion !== 1) c.fail("doc.schemaVersion", "must be 1");
  const scope = input.scope;
  if (!(SCOPES as readonly unknown[]).includes(scope)) c.fail("doc.scope", "unknown scope");
  const sc = scope as Scope;
  if (!isRecord(input.tracking)) c.fail("doc.tracking", "required");
  else {
    checkVendor(c, "doc.tracking.meta", input.tracking.meta, META_PIXEL, sc);
    checkVendor(c, "doc.tracking.ga4", input.tracking.ga4, GA4, sc);
  }
  if (input.launched !== undefined) {
    if (typeof input.launched !== "boolean") c.fail("doc.launched", "must be boolean");
    else if (sc === "global") c.fail("doc.launched", "global is not a region");
  }
  if (input.navigation !== undefined) {
    const r = validateNavigation(input.navigation, sc, "doc.navigation");
    if (!r.ok) r.errors.forEach((e) => c.errors.push(e));
  }
  if (input.theme !== undefined) {
    const r = validateTheme(input.theme, sc, "doc.theme");
    if (!r.ok) r.errors.forEach((e) => c.errors.push(e));
  }
  if (input.promotions !== undefined) {
    const r = validatePromotions(input.promotions, sc, "doc.promotions");
    if (!r.ok) r.errors.forEach((e) => c.errors.push(e));
  }
  if (input.collections !== undefined) {
    if (sc === "global") c.fail("doc.collections", "global has no collections in V1");
    else {
      checkCollections(c, "doc.collections", input.collections);
      // A region only enables collections of ITS OWN INK store: the wrong store's collection can never be enabled here.
      if (isRecord(input.collections)) {
        const groups = isRecord(input.collections.navbarGroups) ? input.collections.navbarGroups : {};
        const lists: [string, unknown][] = [["enabled", input.collections.enabled], ["navbar", input.collections.navbar], ["navbarGroups.top", groups.top], ["navbarGroups.more", groups.more]];
        for (const [key, list] of lists) {
          if (!Array.isArray(list)) continue;
          list.forEach((ref, i) => {
            if (isRecord(ref) && ref.store !== REGIONS[sc as RegionSlug]?.storeKey) c.fail(`doc.collections.${key}[${i}].store`, "belongs to another region's INK store");
          });
        }
      }
    }
  }
  if (input.home !== undefined) {
    if (sc === "global") c.fail("doc.home", "global has no home in V1");
    const sections = isRecord(input.home) ? input.home.sections : undefined;
    if (!Array.isArray(sections)) c.fail("doc.home.sections", "must be an array");
    else {
      sections.forEach((s, i) => checkSection(c, `doc.home.sections[${i}]`, s));
      // Sources and "Ver todos" targets must come from THIS region's INK store (a Norte section can never show or link Sul's collection).
      const ownStore = REGIONS[sc as RegionSlug]?.storeKey;
      if (ownStore) {
        sections.forEach((s, i) => {
          if (!isRecord(s)) return;
          if (isRecord(s.source) && s.source.kind === "ink-category" && s.source.store !== ownStore) c.fail(`doc.home.sections[${i}].source.store`, "belongs to another region's INK store");
          const dest = isRecord(s.cta) && isRecord(s.cta.dest) ? s.cta.dest : null;
          if (dest && dest.kind === "ink-collection" && dest.store !== ownStore) c.fail(`doc.home.sections[${i}].cta.dest.store`, "belongs to another region's INK store");
          // A state cover belongs to a state of THIS region.
          if (isRecord(s.stateCovers)) for (const uf of Object.keys(s.stateCovers)) if (!(REGIONS[sc as RegionSlug]?.ufs as readonly string[] | undefined)?.includes(uf)) c.fail(`doc.home.sections[${i}].stateCovers.${uf}`, "not a state of this region");
          // The hero's cards are products of THIS region's own INK store (a Norte card can never be a Sul product).
          if (Array.isArray(s.featured)) s.featured.forEach((ref, j) => { if (isRecord(ref) && ref.store !== ownStore) c.fail(`doc.home.sections[${i}].featured[${j}].store`, "belongs to another region's INK store"); });
          const navDest = isRecord(s.nav) && isRecord(s.nav.dest) ? s.nav.dest : null;
          if (navDest && navDest.kind === "ink-collection" && navDest.store !== ownStore) c.fail(`doc.home.sections[${i}].nav.dest.store`, "belongs to another region's INK store");
          if (navDest && navDest.kind === "route" && typeof navDest.path === "string" && navDest.path !== `/${sc}` && !navDest.path.startsWith(`/${sc}/`)) c.fail(`doc.home.sections[${i}].nav.dest.path`, "must be a page of this region");
          if (s.template === "page-hero") c.fail(`doc.home.sections[${i}].template`, "the page hero belongs to pages, not to the home");
          checkTileRegion(c, `doc.home.sections[${i}]`, s.tiles, sc);
          // An internal route stays inside the region's own pages (a Norte button never leads to /sul/...).
          if (dest && dest.kind === "route" && typeof dest.path === "string" && dest.path !== `/${sc}` && !dest.path.startsWith(`/${sc}/`)) c.fail(`doc.home.sections[${i}].cta.dest.path`, "must be a page of this region");
        });
      }
      const anchors = new Set<string>();
      const ids = new Set<string>();
      sections.forEach((s, i) => {
        if (!isRecord(s)) return;
        if (typeof s.anchor === "string") {
          if (anchors.has(s.anchor)) c.fail(`doc.home.sections[${i}].anchor`, "duplicate anchor");
          anchors.add(s.anchor);
        }
        if (typeof s.id === "string") {
          if (ids.has(s.id)) c.fail(`doc.home.sections[${i}].id`, "duplicate id");
          ids.add(s.id);
        }
      });
      const first = sections[0];
      const last = sections[sections.length - 1];
      if (sections.length > 0 && (!isRecord(first) || first.template !== "hero")) c.fail("doc.home.sections", "the first section must be the hero");
      if (sections.length > 0 && (!isRecord(last) || last.template !== "footer")) c.fail("doc.home.sections", "the last section must be the footer");
      if (sections.filter((s) => isRecord(s) && (s.template === "hero" || s.template === "footer")).length > 2) c.fail("doc.home.sections", "hero and footer appear once");
    }
  }
  if (input.pages !== undefined) {
    if (sc === "global") c.fail("doc.pages", "global has no pages");
    else if (!Array.isArray(input.pages) || input.pages.length > MAX_PAGES) c.fail("doc.pages", `a list of at most ${MAX_PAGES} pages`);
    else {
      const ids = new Set<string>();
      const slugs = new Set<string>();
      input.pages.forEach((p, i) => {
        checkPage(c, `doc.pages[${i}]`, p);
        if (!isRecord(p)) return;
        if (Array.isArray(p.sections)) checkRegionRules(c, `doc.pages[${i}]`, p.sections, sc);
        if (typeof p.id === "string") {
          if (ids.has(p.id)) c.fail(`doc.pages[${i}].id`, "duplicate id");
          ids.add(p.id);
        }
        // One slug per region AND kind: /h/x and /colecoes/x may coexist, two /h/x may not.
        const key = `${String(p.kind)}:${String(p.slug)}`;
        if (slugs.has(key)) c.fail(`doc.pages[${i}].slug`, "duplicate slug for this kind of page");
        slugs.add(key);
      });
    }
  }
  if (input.customizers !== undefined) {
    if (sc === "global") c.fail("doc.customizers", "global has no customizers");
    else if (!Array.isArray(input.customizers) || input.customizers.length > MAX_CUSTOMIZERS) c.fail("doc.customizers", `a list of at most ${MAX_CUSTOMIZERS} models`);
    else {
      const ids = new Set<string>();
      const slugs = new Set<string>();
      const own = REGIONS[sc as RegionSlug]?.storeKey;
      input.customizers.forEach((m, i) => {
        checkCustomizer(c, `doc.customizers[${i}]`, m);
        if (!isRecord(m)) return;
        if (isRecord(m.source) && m.source.kind !== "umapenca" && own && m.source.store !== own) c.fail(`doc.customizers[${i}].source.store`, "belongs to another region's INK store");
        if (typeof m.id === "string") {
          if (ids.has(m.id)) c.fail(`doc.customizers[${i}].id`, "duplicate id");
          ids.add(m.id);
        }
        if (typeof m.slug === "string") {
          if (slugs.has(m.slug)) c.fail(`doc.customizers[${i}].slug`, "duplicate slug");
          slugs.add(m.slug);
        }
      });
    }
  }
  // A carousel's first card refers to a model of THIS document.
  {
    const known = new Set(Array.isArray(input.customizers) ? input.customizers.flatMap((m) => (isRecord(m) && typeof m.id === "string" ? [m.id] : [])) : []);
    const sectionLists = [isRecord(input.home) && Array.isArray(input.home.sections) ? input.home.sections : [], ...(Array.isArray(input.pages) ? input.pages.map((p) => (isRecord(p) && Array.isArray(p.sections) ? p.sections : [])) : [])];
    for (const list of sectionLists) for (const s of list) if (isRecord(s) && isRecord(s.customizerCard) && !known.has(s.customizerCard.customizerId as string)) c.fail(`doc.customizerCard(${String(s.id)})`, "refers to a model that does not exist in this region");
  }
  return c.errors.length === 0 ? { ok: true, value: input as unknown as ScopeDoc } : { ok: false, errors: c.errors };
}

/** Every media reference of a document (sections of the home and of the pages, covers, cards, SEO image, page pattern, models): what a publish must resolve into the media table. */
export function mediaRefsOfDoc(doc: ScopeDoc | undefined): MediaRef[] {
  if (!doc) return [];
  const out: MediaRef[] = [];
  const ofSection = (s: Section) => {
    for (const r of [s.appearance?.image?.mobile, s.appearance?.image?.desktop, ...Object.values(s.stateCovers ?? {}), s.customizerCard?.image, ...(s.tiles ?? []).map((t) => t.image)]) if (r) out.push(r);
  };
  for (const s of doc.home?.sections ?? []) ofSection(s);
  for (const p of doc.pages ?? []) {
    if (p.seo.ogImage) out.push(p.seo.ogImage);
    if (p.backdrop?.pattern) out.push(p.backdrop.pattern.image);
    for (const s of p.sections) ofSection(s);
  }
  for (const m of doc.customizers ?? []) for (const r of [m.cardImage, m.pageMockup]) if (r) out.push(r);
  return out;
}

const validVariants = (v: unknown): boolean =>
  v === undefined || (Array.isArray(v) && v.length >= 1 && v.length <= 6 && v.every((x) => isRecord(x) && Number.isInteger(x.w) && (x.w as number) >= 100 && (x.w as number) <= 4000 && isAllowedMediaSrc(x.src)));

/** One entry of a bundle's media table, or null when it is not renderable (unknown host, bad path, bad size, bad variants). Shared by the strict validator and the tolerant reader. */
export function parseMediaInfo(m: unknown): MediaAssetInfo | null {
  if (!isRecord(m) || !isAllowedMediaSrc(m.src) || !Number.isInteger(m.width) || !Number.isInteger(m.height) || (m.width as number) <= 0 || (m.height as number) <= 0 || !validVariants(m.variants)) return null;
  const info: MediaAssetInfo = { src: m.src, width: m.width as number, height: m.height as number };
  if (m.variants !== undefined) info.variants = (m.variants as { w: number; src: string }[]).map((v) => ({ w: v.w, src: v.src }));
  return info;
}

export function validateBundle(input: unknown): ValidationResult<PublishedBundle> {
  const errors: string[] = [];
  if (!isRecord(input) || input.schemaVersion !== 1) return { ok: false, errors: ["bundle.schemaVersion: must be 1"] };
  if (typeof input.releaseId !== "string" || !ID.test(input.releaseId)) errors.push("bundle.releaseId: invalid");
  const docs = input.docs;
  const media = input.media;
  if (!isRecord(docs)) errors.push("bundle.docs: must be an object");
  else {
    for (const scope of SCOPES) {
      const r = validateScopeDoc(docs[scope]);
      if (!r.ok) errors.push(...r.errors.map((e) => `bundle.docs.${scope}.${e}`));
      else if (r.value.scope !== scope) errors.push(`bundle.docs.${scope}: scope mismatch`);
    }
  }
  if (!isRecord(media)) errors.push("bundle.media: must be an object");
  else {
    for (const [id, m] of Object.entries(media)) {
      if (parseMediaInfo(m) === null) errors.push(`bundle.media.${id}: invalid`);
    }
    // Every image referenced by an active section must resolve: a missing entry would render a broken picture.
    if (isRecord(docs)) {
      for (const scope of SCOPES) {
        const doc = docs[scope] as ScopeDoc | undefined;
        for (const ref of mediaRefsOfDoc(doc)) if (!(ref.assetId in media)) errors.push(`bundle.media: "${ref.assetId}" (${scope}) is not in the media table`);
      }
    }
  }
  return errors.length === 0 ? { ok: true, value: input as unknown as PublishedBundle } : { ok: false, errors };
}

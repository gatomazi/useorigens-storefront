/**
 * Contract of the storefront CMS configuration (docs/admin/cms-v1-plan.md §3.1, refined by
 * docs/admin/cms-v1-round2.md). Pure types + validators: no I/O, no `server-only`, no dependency, so the admin (draft
 * validation) and the storefront (published-snapshot validation) run the very same checks.
 *
 * The storefront reads only a `PublishedBundle` (a validated snapshot, resolved at publish time: media entries carry the
 * final URL and dimensions, so rendering never needs the database or the storage API).
 */
import { isAllowedMediaSrc } from "./media-hosts";
import type { CommerceStoreKey } from "../geo/regions";

export const SCOPES = ["global", "sul", "norte", "centro-oeste"] as const;
export type Scope = (typeof SCOPES)[number];

export const TEMPLATE_KEYS = ["hero", "city-styles", "product-carousel", "states", "campaign", "footer"] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

/** Closed list of analytics origins a carousel may report (keys of `SOURCES`); never a free string (would pollute Meta/GA4). */
export const CAROUSEL_SOURCE_KEYS = ["homeTerra", "homeRedesenhos", "homeFeitoParaVoce", "homeFala", "homeDdd", "homeCollection"] as const;
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

export type Destination =
  | { kind: "route"; path: string }
  | { kind: "ink-collection"; store: CommerceStoreKey; collectionId: number }
  | { kind: "external"; url: string };

export type Source =
  | { kind: "editorial-module"; key: EditorialModuleKey }
  | { kind: "ink-category"; store: CommerceStoreKey; collectionId: number; order: "category" | "manual"; limit: number }
  | { kind: "manual"; productIds: string[]; limit: number };

export type CarouselLayout = { variant: "standard" | "poster"; tone: "light" | "dark"; surface: "paper" | "plain" | "region-primary" };

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

export type ScopeDoc = {
  schemaVersion: 1;
  scope: Scope;
  tracking: TrackingConfig;
  home?: { sections: Section[] };
  /**
   * INK collections this scope's CMS has explicitly ENABLED as section sources. Only meaningful for internal (hidden-on-INK) collections:
   * public ones are usable by default. Part of the document, so a publish and a rollback carry it together with the sections that use it.
   */
  collections?: { enabled: CollectionRef[] };
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
  } else c.fail(`${path}.kind`, "must be route | ink-collection | external");
}

function checkSource(c: Collector, path: string, v: unknown): void {
  if (!isRecord(v)) return c.fail(path, "must be an object");
  if (v.kind === "editorial-module") {
    if (!(EDITORIAL_MODULE_KEYS as readonly unknown[]).includes(v.key)) c.fail(`${path}.key`, "unknown editorial module");
  } else if (v.kind === "ink-category" || v.kind === "manual") {
    if (typeof v.limit !== "number" || !Number.isInteger(v.limit) || v.limit < 3 || v.limit > 24) c.fail(`${path}.limit`, "must be an integer 3..24");
    if (v.kind === "ink-category") {
      if (typeof v.store !== "string" || !STORES.includes(v.store)) c.fail(`${path}.store`, "unknown store");
      if (typeof v.collectionId !== "number" || !Number.isInteger(v.collectionId) || v.collectionId <= 0) c.fail(`${path}.collectionId`, "must be a positive integer");
      if (v.order !== "category" && v.order !== "manual") c.fail(`${path}.order`, "must be category | manual");
    } else if (!Array.isArray(v.productIds) || v.productIds.length > 100 || v.productIds.some((p) => typeof p !== "string" || !/^\d{1,20}$/.test(p))) {
      c.fail(`${path}.productIds`, "must be ≤ 100 numeric INK ids");
    }
  } else c.fail(`${path}.kind`, "must be editorial-module | ink-category | manual");
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
    }
  }
  if (v.source !== undefined) checkSource(c, `${path}.source`, v.source);
  if (v.analyticsSource !== undefined && !(CAROUSEL_SOURCE_KEYS as readonly unknown[]).includes(v.analyticsSource)) c.fail(`${path}.analyticsSource`, "not an allowed analytics origin");
  if (v.fallback !== undefined && v.fallback !== "crops" && v.fallback !== "fill") c.fail(`${path}.fallback`, "must be crops | fill");
  if (v.template === "product-carousel") {
    if (!v.layout) c.fail(`${path}.layout`, "required for product-carousel");
    if (!v.source) c.fail(`${path}.source`, "required for product-carousel");
    if (!v.analyticsSource) c.fail(`${path}.analyticsSource`, "required for product-carousel");
    if (!v.title) c.fail(`${path}.title`, "required for product-carousel");
  }
  checkAppearance(c, `${path}.appearance`, v.appearance);
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

function checkCollections(c: Collector, path: string, v: unknown): void {
  if (!isRecord(v) || !Array.isArray(v.enabled)) return c.fail(path, "must be { enabled: [...] }");
  if (v.enabled.length > 300) c.fail(`${path}.enabled`, "at most 300 entries");
  const seen = new Set<string>();
  v.enabled.forEach((ref, i) => {
    if (!isRecord(ref) || typeof ref.store !== "string" || !STORES.includes(ref.store) || typeof ref.collectionId !== "number" || !Number.isInteger(ref.collectionId) || ref.collectionId <= 0) {
      return c.fail(`${path}.enabled[${i}]`, "must be { store, collectionId }");
    }
    const key = `${ref.store}:${ref.collectionId}`;
    if (seen.has(key)) c.fail(`${path}.enabled[${i}]`, "duplicate");
    seen.add(key);
  });
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
  if (input.collections !== undefined) {
    if (sc === "global") c.fail("doc.collections", "global has no collections in V1");
    else checkCollections(c, "doc.collections", input.collections);
  }
  if (input.home !== undefined) {
    if (sc === "global") c.fail("doc.home", "global has no home in V1");
    const sections = isRecord(input.home) ? input.home.sections : undefined;
    if (!Array.isArray(sections)) c.fail("doc.home.sections", "must be an array");
    else {
      sections.forEach((s, i) => checkSection(c, `doc.home.sections[${i}]`, s));
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
  return c.errors.length === 0 ? { ok: true, value: input as unknown as ScopeDoc } : { ok: false, errors: c.errors };
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
        for (const s of doc?.home?.sections ?? []) {
          for (const ref of [s.appearance?.image?.mobile, s.appearance?.image?.desktop]) {
            if (ref && !(ref.assetId in media)) errors.push(`bundle.media: "${ref.assetId}" (section ${s.id}) is not in the media table`);
          }
        }
      }
    }
  }
  return errors.length === 0 ? { ok: true, value: input as unknown as PublishedBundle } : { ok: false, errors };
}

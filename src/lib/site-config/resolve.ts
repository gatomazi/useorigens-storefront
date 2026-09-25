/**
 * Pure resolution rules for the storefront CMS configuration: tracking inheritance and the image / colour / gradient
 * fallback (docs/admin/cms-v1-plan.md §2.6 and §6.1). No I/O; everything here is unit-tested in isolation.
 */
import type { Appearance, Fill, MediaAssetInfo, Overlay, Point, PublishedBundle, Scope, ScopeDoc, Section, VendorSetting } from "./schema";

// ── Tracking ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Where an effective ID comes from (shown next to it in the admin). */
export type TrackingOrigin =
  | "own" // the region's own ID (override)
  | "global" // inherited from the active global ID
  | "legacy" // Sul only: the build-time NEXT_PUBLIC_* value, until an explicit configuration replaces it
  | "disabled" // switched off on purpose
  | "inherit-inactive" // "inherit" while the global tool is inactive: no ID
  | "unconfigured"; // nothing configured for this region (Norte / Centro-Oeste default): no ID

export type EffectiveVendor = { id: string | null; origin: TrackingOrigin };

export type EffectiveTracking = {
  metaPixelId: string | null;
  ga4MeasurementId: string | null;
  origin: { meta: TrackingOrigin; ga4: TrackingOrigin };
  /** `env` = no published config: only Sul has an effective ID (the legacy build-time one); every other region has none. */
  source: "published" | "env";
};

export type LegacyIds = { metaPixelId: string | null; ga4MeasurementId: string | null };

/**
 * One tool, one document. `disabled` → nothing; `override` → its own ID (validated by the schema; never combined with the global one);
 * `inherit` → the GLOBAL ID, but only while the global tool is active ("override" there); `legacy` → the build-time value (Sul only).
 * A (schema-invalid) global that itself inherits resolves to nothing, never loops.
 */
export function resolveVendor(setting: VendorSetting | undefined, global: VendorSetting | undefined, legacyId: string | null, scope: Scope): EffectiveVendor {
  if (!setting) return scope === "sul" ? { id: legacyId, origin: "legacy" } : { id: null, origin: "unconfigured" };
  switch (setting.mode) {
    case "override":
      return { id: setting.id, origin: "own" };
    case "disabled":
      return { id: null, origin: "disabled" };
    case "legacy":
      return scope === "sul" ? { id: legacyId, origin: "legacy" } : { id: null, origin: "unconfigured" }; // never leaks to another region
    case "inherit":
      return global?.mode === "override" ? { id: global.id, origin: "global" } : { id: null, origin: "inherit-inactive" };
  }
}

/**
 * The effective IDs of one region, per tool, independently. Without a published bundle only Sul has IDs (the legacy build-time ones,
 * exactly what the storefront had before the CMS); Norte and Centro-Oeste NEVER inherit them.
 */
export function resolveTracking(bundle: PublishedBundle | null, scope: Scope, legacy: LegacyIds): EffectiveTracking {
  if (!bundle) {
    const own = scope === "sul";
    return {
      metaPixelId: own ? legacy.metaPixelId : null,
      ga4MeasurementId: own ? legacy.ga4MeasurementId : null,
      origin: { meta: own ? "legacy" : "unconfigured", ga4: own ? "legacy" : "unconfigured" },
      source: "env",
    };
  }
  const doc = bundle.docs[scope];
  const global = bundle.docs.global.tracking;
  const meta = resolveVendor(doc?.tracking?.meta, global?.meta, legacy.metaPixelId, scope);
  const ga4 = resolveVendor(doc?.tracking?.ga4, global?.ga4, legacy.ga4MeasurementId, scope);
  return { metaPixelId: meta.id, ga4MeasurementId: ga4.id, origin: { meta: meta.origin, ga4: ga4.origin }, source: "published" };
}

// ── Appearance ────────────────────────────────────────────────────────────────────────────────────────────────

export type ResolvedImage = MediaAssetInfo & { alt: string; decorative: boolean };

export type ResolvedBackground = {
  fill: Fill;
  overlay: Overlay;
  /** Per breakpoint: an image only when it is published (present in the bundle's media table). `null` = show the fill. */
  images: { mobile: ResolvedImage | null; desktop: ResolvedImage | null };
  focal: { mobile: Point; desktop: Point };
};

function image(ref: { assetId: string; alt: string; decorative: boolean } | undefined, media: PublishedBundle["media"]): ResolvedImage | null {
  if (!ref) return null;
  const info = media[ref.assetId];
  // Unknown asset id (never published, or removed): behave as "no image" — never a broken <img>.
  return info ? { ...info, alt: ref.alt, decorative: ref.decorative } : null;
}

/**
 * Per breakpoint, independently: a published image, else (desktop only, and only when the editor opted in) the mobile
 * image, else nothing — and "nothing" means the section's own `fill`. A mobile crop is never reused on desktop implicitly.
 */
export function resolveBackground(appearance: Appearance, media: PublishedBundle["media"]): ResolvedBackground {
  const mobile = image(appearance.image?.mobile, media);
  let desktop = image(appearance.image?.desktop, media);
  if (!desktop && appearance.image?.reuseMobileOnDesktop) desktop = mobile;
  return { fill: appearance.fill, overlay: appearance.overlay, images: { mobile, desktop }, focal: appearance.focal };
}

export const hasImage = (bg: ResolvedBackground): boolean => bg.images.mobile !== null || bg.images.desktop !== null;

export const focalToCss = (p: Point): string => `${p.x}% ${p.y}%`;

// ── Sections ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Sections to render, in configured order. The footer belongs to the layout, so it never renders here. */
export function renderableSections(doc: ScopeDoc | undefined): Section[] {
  return (doc?.home?.sections ?? []).filter((s) => s.active && s.template !== "footer");
}

/** Only the first active section that actually shows an image is the LCP candidate (`priority`); not configurable. */
export function firstImageSectionId(sections: Section[], media: PublishedBundle["media"]): string | null {
  for (const s of sections) if (hasImage(resolveBackground(s.appearance, media))) return s.id;
  return null;
}

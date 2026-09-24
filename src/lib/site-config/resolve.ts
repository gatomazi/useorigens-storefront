/**
 * Pure resolution rules for the storefront CMS configuration: tracking inheritance and the image / colour / gradient
 * fallback (docs/admin/cms-v1-plan.md §2.6 and §6.1). No I/O; everything here is unit-tested in isolation.
 */
import type { Appearance, Fill, MediaAssetInfo, Overlay, Point, PublishedBundle, Scope, ScopeDoc, Section, VendorSetting } from "./schema";

// ── Tracking ──────────────────────────────────────────────────────────────────────────────────────────────────

export type EffectiveTracking = {
  metaPixelId: string | null;
  ga4MeasurementId: string | null;
  /** `env` = no published config, the current NEXT_PUBLIC_* values are used untouched (D5: no observable change). */
  source: "published" | "env";
};

function effectiveId(setting: VendorSetting, global: VendorSetting): string | null {
  if (setting.mode === "override") return setting.id;
  if (setting.mode === "disabled") return null;
  // inherit: the global setting decides. A (schema-invalid) global that also inherits resolves to nothing, never loops.
  return global.mode === "override" ? global.id : null;
}

/**
 * One effective ID per vendor, per document. Each vendor inherits or overrides independently (D5). Without a published
 * bundle the caller-supplied env values are returned as-is.
 */
export function resolveTracking(bundle: PublishedBundle | null, scope: Scope, env: { metaPixelId: string | null; ga4MeasurementId: string | null }): EffectiveTracking {
  if (!bundle) return { ...env, source: "env" };
  const doc = bundle.docs[scope];
  const global = bundle.docs.global.tracking;
  return {
    metaPixelId: effectiveId(doc.tracking.meta, global.meta),
    ga4MeasurementId: effectiveId(doc.tracking.ga4, global.ga4),
    source: "published",
  };
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

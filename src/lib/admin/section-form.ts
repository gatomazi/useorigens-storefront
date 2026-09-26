/**
 * Turns the section editor's form fields into a validated patch. Pure (takes anything with `get(name)`), so every field is unit-tested
 * without a browser. Nothing from the form is trusted: each value is parsed into the closed vocabulary of the contract and the result still
 * goes through `validateSection` in `applyOp`.
 */
import { EDITORIAL_MODULE_KEYS, OVERLAY_PRESETS, type Appearance, type Color, type CommerceStoreKey, type Destination, type Fill, type Overlay, type Section, type Source } from "./contract";
import { STATE_NAMES } from "../geo/regions";
import type { Editable } from "./draft-ops";

type Fields = { get(name: string): FormDataEntryValue | null };

const str = (f: Fields, name: string): string => {
  const v = f.get(name);
  return typeof v === "string" ? v.trim() : "";
};
const num = (f: Fields, name: string, fallback: number): number => {
  const v = Number.parseFloat(str(f, name));
  return Number.isFinite(v) ? v : fallback;
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** "use-sul:152188" → store + id, or null. */
export function parseCollectionRef(value: string): { store: CommerceStoreKey; collectionId: number } | null {
  const m = /^(use-sul|use-norte|use-centro):(\d{1,12})$/.exec(value);
  return m ? { store: m[1] as CommerceStoreKey, collectionId: Number(m[2]) } : null;
}

function parseFill(f: Fields): Fill {
  const kind = str(f, "fill_kind");
  if (kind === "solid") {
    const pick = str(f, "fill_color_choice");
    const color = (pick.startsWith("token:") ? pick : str(f, "fill_color")) as Color;
    return { kind: "solid", color };
  }
  if (kind === "gradient") return { kind: "gradient", from: str(f, "grad_from") as Color, to: str(f, "grad_to") as Color, angle: clamp(num(f, "grad_angle", 180), 0, 360) };
  return { kind: "none" };
}

function parseOverlay(f: Fields): Overlay {
  if (str(f, "overlay_kind") === "custom") return { color: str(f, "overlay_color") as `#${string}`, opacity: clamp(num(f, "overlay_opacity", 0.4), 0, 0.85) };
  const preset = str(f, "overlay_preset");
  return { preset: (OVERLAY_PRESETS as readonly string[]).includes(preset) ? (preset as (typeof OVERLAY_PRESETS)[number]) : "none" };
}

function parseAppearance(f: Fields, current: Appearance): Appearance {
  const decorative = f.get("img_decorative") !== null;
  const alt = decorative ? "" : str(f, "img_alt");
  const ref = (assetId: string) => (assetId ? { assetId, alt, decorative } : undefined);
  const mobile = ref(str(f, "img_mobile"));
  const desktop = ref(str(f, "img_desktop"));
  const image = mobile || desktop ? { ...(mobile ? { mobile } : {}), ...(desktop ? { desktop } : {}), ...(f.get("reuse_mobile") !== null ? { reuseMobileOnDesktop: true } : {}) } : undefined;
  return {
    fill: parseFill(f),
    image,
    focal: {
      mobile: { x: clamp(num(f, "focal_mx", current.focal.mobile.x), 0, 100), y: clamp(num(f, "focal_my", current.focal.mobile.y), 0, 100) },
      desktop: { x: clamp(num(f, "focal_dx", current.focal.desktop.x), 0, 100), y: clamp(num(f, "focal_dy", current.focal.desktop.y), 0, 100) },
    },
    overlay: parseOverlay(f),
  };
}

function parseCta(f: Fields): Section["cta"] | undefined {
  const kind = str(f, "cta_kind");
  const label = str(f, "cta_label");
  let dest: Destination | null = null;
  if (kind === "ink-collection") {
    const ref = parseCollectionRef(str(f, "cta_collection"));
    if (ref) dest = { kind: "ink-collection", ...ref };
  } else if (kind === "external") dest = { kind: "external", url: str(f, "cta_url") };
  else if (kind === "route") dest = { kind: "route", path: str(f, "cta_route") };
  return dest ? { label: label || "Ver todos", dest } : undefined;
}

function parseSource(f: Fields, current: Source | undefined): Source | undefined {
  const kind = str(f, "source_kind");
  if (kind === "editorial-module") {
    const key = str(f, "source_module");
    return (EDITORIAL_MODULE_KEYS as readonly string[]).includes(key) ? { kind: "editorial-module", key: key as (typeof EDITORIAL_MODULE_KEYS)[number] } : current;
  }
  if (kind === "ink-category") {
    const ref = parseCollectionRef(str(f, "source_collection"));
    if (!ref) return current;
    return { kind: "ink-category", ...ref, order: "category", limit: clamp(Math.round(num(f, "source_limit", 6)), 3, 24) };
  }
  return current;
}

export function parseSectionForm(f: Fields, section: Section): Partial<Editable> {
  const patch: Partial<Editable> = {};
  // A field that is not in the form is left alone; a field that is present and empty clears the value (a carousel's title is then rejected).
  if (f.get("title") !== null) patch.title = str(f, "title") || undefined;
  if (f.get("subtitle") !== null) patch.subtitle = str(f, "subtitle") || undefined;
  if (section.template === "product-carousel" || section.template === "campaign" || section.template === "hero" || section.template === "city-styles" || section.template === "states") {
    patch.appearance = parseAppearance(f, section.appearance);
  }
  if (section.template === "product-carousel") {
    patch.cta = parseCta(f);
    patch.source = parseSource(f, section.source);
    const variant = str(f, "layout_variant") === "poster" ? "poster" : "standard";
    const tone = str(f, "layout_tone") === "dark" ? "dark" : "light";
    const surfaceRaw = str(f, "layout_surface");
    const surface = surfaceRaw === "paper" || surfaceRaw === "region-primary" ? surfaceRaw : "plain";
    patch.layout = { variant, tone, surface };
  }
  if (section.template === "campaign") {
    patch.fallback = str(f, "fallback") === "fill" ? "fill" : "crops";
    // No button configured = the original "Encontrar minha cidade" search; a label without a destination is dropped, never a dead link.
    patch.cta = parseCta(f);
  }
  if (section.template === "states" && f.get("state_covers_present") !== null) {
    // One picture per state; an empty choice clears that state's cover (it then keeps the code's own cover, if any).
    const covers: Record<string, { assetId: string; alt: string; decorative: boolean }> = {};
    for (const uf of Object.keys(STATE_NAMES)) {
      const assetId = str(f, `state_cover_${uf}`);
      if (!assetId) continue;
      const alt = str(f, `state_alt_${uf}`);
      covers[uf] = { assetId, alt, decorative: alt === "" };
    }
    patch.stateCovers = Object.keys(covers).length > 0 ? covers : undefined;
  }
  if (section.template === "city-styles" && f.get("count") !== null) patch.count = clamp(Math.round(num(f, "count", 8)), 1, 8);
  return patch;
}

/**
 * The hero's featured-product fields: `featured_1..3` hold "store:productId" (or nothing). Returns the references in slot order (empty slots
 * closed up: the cards are a list, not fixed holes) and the malformed values, which are refused instead of silently dropped.
 */
export function parseFeaturedFields(f: Fields): { refs: { store: CommerceStoreKey; productId: string }[]; invalid: string[] } {
  const refs: { store: CommerceStoreKey; productId: string }[] = [];
  const invalid: string[] = [];
  for (const slot of [1, 2, 3]) {
    const raw = str(f, `featured_${slot}`);
    if (!raw) continue;
    const m = /^(use-sul|use-norte|use-centro):(\d{1,20})$/.exec(raw);
    if (m) refs.push({ store: m[1] as CommerceStoreKey, productId: m[2] });
    else invalid.push(`posição ${slot}`);
  }
  return { refs, invalid };
}

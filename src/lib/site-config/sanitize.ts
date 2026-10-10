/**
 * Tolerant reader of a PUBLISHED bundle (the storefront must never go blank because one optional section is bad). Strict validation
 * (`validateBundle`) is for the publisher; this is for the reader:
 *   - wrong `schemaVersion` or not an object  ⇒ no bundle at all (the caller uses the seed);
 *   - a scope whose document is unusable      ⇒ that scope falls back to the seed's document;
 *   - an invalid OPTIONAL section             ⇒ that section is dropped, with a diagnostic;
 *   - an image the media table does not know  ⇒ the image is dropped (the section keeps its fill), with a diagnostic;
 *   - an invalid page or customizer model ⇒ only that page / model is dropped (a card that pointed at a dropped model is removed too);
 *   - an invalid hero or footer               ⇒ the whole scope falls back to the seed (the home cannot exist without them).
 * Pure: no I/O, so it is unit-tested with hand-made objects.
 */
import { validateNavigation, validateTheme } from "./navigation-schema";
import { validatePromotions } from "./promotions-schema";
import { parseMediaInfo, SCOPES, validateCustomizer, validatePage, validateScopeDoc, validateSection, type Customizer, type MediaAssetInfo, type Page, type PublishedBundle, type Scope, type ScopeDoc, type Section } from "./schema";

export type SanitizeResult = { bundle: PublishedBundle | null; diagnostics: string[] };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function sanitizeMedia(raw: unknown, diagnostics: string[]): Record<string, MediaAssetInfo> {
  const out: Record<string, MediaAssetInfo> = {};
  if (!isRecord(raw)) {
    diagnostics.push("media table missing: images ignored");
    return out;
  }
  for (const [id, m] of Object.entries(raw)) {
    const info = parseMediaInfo(m);
    if (info) out[id] = info;
    else diagnostics.push(`media "${id}" is invalid and was ignored`);
  }
  return out;
}

/** A first-card whose model is gone (dropped as invalid, or never published) is removed; the carousel simply renders its products. */
function withoutOrphanCards(sections: Section[], customizers: Customizer[] | undefined, scope: Scope, diagnostics: string[]): Section[] {
  const known = new Set((customizers ?? []).map((m) => m.id));
  return sections.map((s) => {
    if (!s.customizerCard || known.has(s.customizerCard.customizerId)) return s;
    diagnostics.push(`${scope}: "${s.id}" first card refers to a model that is not published and was dropped`);
    const rest = { ...s };
    delete rest.customizerCard;
    return rest;
  });
}

function sanitizePagesAndModels(scope: Scope, raw: Record<string, unknown>, media: Record<string, MediaAssetInfo>, diagnostics: string[]): { pages?: Page[]; customizers?: Customizer[] } {
  const known = (ref: { assetId: string } | undefined) => !ref || ref.assetId in media;
  let pages: Page[] | undefined;
  if (Array.isArray(raw.pages)) {
    pages = [];
    const slugs = new Set<string>();
    const ids = new Set<string>();
    for (const [i, candidate] of raw.pages.entries()) {
      const r = validatePage(candidate, scope, `${scope}.pages[${i}]`);
      if (!r.ok) { diagnostics.push(`${scope}: page #${i + 1} dropped (${r.errors[0]})`); continue; }
      const key = `${r.value.kind}/${r.value.slug}`;
      if (slugs.has(key) || ids.has(r.value.id)) { diagnostics.push(`${scope}: page "${key}" dropped (duplicate slug or id)`); continue; }
      const missing = r.value.sections.some((s) => !known(s.appearance.image?.mobile) || !known(s.appearance.image?.desktop)) || !known(r.value.backdrop?.pattern?.image);
      if (missing) diagnostics.push(`${scope}: page "${key}" has images missing from the media table (they render without them)`);
      slugs.add(key);
      ids.add(r.value.id);
      pages.push(r.value);
    }
  }
  let customizers: Customizer[] | undefined;
  if (Array.isArray(raw.customizers)) {
    customizers = [];
    const slugs = new Set<string>();
    const ids = new Set<string>();
    for (const [i, candidate] of raw.customizers.entries()) {
      const r = validateCustomizer(candidate, scope, `${scope}.customizers[${i}]`);
      if (!r.ok) { diagnostics.push(`${scope}: model #${i + 1} dropped (${r.errors[0]})`); continue; }
      if (slugs.has(r.value.slug) || ids.has(r.value.id)) { diagnostics.push(`${scope}: model "${r.value.slug}" dropped (duplicate slug or id)`); continue; }
      if (r.value.pageMockup && !known(r.value.pageMockup)) {
        diagnostics.push(`${scope}: model "${r.value.slug}" dropped (mockup is not in the media table)`);
        continue;
      }
      slugs.add(r.value.slug);
      ids.add(r.value.id);
      customizers.push(r.value);
    }
  }
  return { pages, customizers };
}

function sanitizeDoc(scope: Scope, raw: unknown, fallback: ScopeDoc, media: Record<string, MediaAssetInfo>, diagnostics: string[]): ScopeDoc {
  if (!isRecord(raw) || raw.schemaVersion !== 1 || raw.scope !== scope) {
    diagnostics.push(`${scope}: document unusable, using the seed`);
    return fallback;
  }
  const rawSections = isRecord(raw.home) && Array.isArray(raw.home.sections) ? (raw.home.sections as unknown[]) : null;
  let sections: Section[] | undefined;
  if (rawSections) {
    sections = [];
    const anchors = new Set<string>();
    const ids = new Set<string>();
    for (const [i, candidate] of rawSections.entries()) {
      const r = validateSection(candidate, `${scope}.home.sections[${i}]`);
      if (!r.ok) {
        const template = isRecord(candidate) ? candidate.template : undefined;
        if (template === "hero" || template === "footer") {
          diagnostics.push(`${scope}: the ${String(template)} section is invalid (${r.errors[0]}), using the seed`);
          return fallback;
        }
        diagnostics.push(`${scope}: section #${i + 1} dropped (${r.errors[0]})`);
        continue;
      }
      const section = r.value;
      if (anchors.has(section.anchor) || ids.has(section.id)) {
        diagnostics.push(`${scope}: section "${section.id}" dropped (duplicate anchor or id)`);
        continue;
      }
      anchors.add(section.anchor);
      ids.add(section.id);
      // An image the table does not know is removed rather than rendered broken; the section keeps its fill.
      const image = section.appearance.image;
      if (image) {
        const known = { ...image };
        for (const bp of ["mobile", "desktop"] as const) {
          const ref = image[bp];
          if (ref && !(ref.assetId in media)) {
            delete known[bp];
            diagnostics.push(`${scope}: "${section.id}" ${bp} image "${ref.assetId}" is not in the media table and was dropped`);
          }
        }
        sections.push({ ...section, appearance: { ...section.appearance, image: known.mobile || known.desktop ? known : undefined } });
      } else sections.push(section);
      // A state cover the table does not know is dropped (that state falls back to no cover / the code's own), never rendered broken.
      const last = sections[sections.length - 1];
      if (last.stateCovers) {
        const kept = Object.fromEntries(Object.entries(last.stateCovers).filter(([uf, ref]) => {
          const known = ref.assetId in media;
          if (!known) diagnostics.push(`${scope}: "${section.id}" cover of ${uf} "${ref.assetId}" is not in the media table and was dropped`);
          return known;
        }));
        sections[sections.length - 1] = { ...last, stateCovers: Object.keys(kept).length > 0 ? kept : undefined };
      }
    }
    if (sections[0]?.template !== "hero" || sections[sections.length - 1]?.template !== "footer") {
      diagnostics.push(`${scope}: hero first / footer last not satisfied, using the seed`);
      return fallback;
    }
  }
  const { pages, customizers } = sanitizePagesAndModels(scope, raw, media, diagnostics);
  if (sections) sections = withoutOrphanCards(sections, customizers, scope, diagnostics);
  const candidate = { ...raw, home: sections ? { sections } : undefined, pages, customizers } as unknown as ScopeDoc;
  // Navigation and theme are optional and cosmetic: an invalid one is dropped (the region keeps its current look and the default menu), never the region.
  // Promotions too: an invalid list means no button (never a broken region, never a half-checked coupon).
  for (const key of ["navigation", "theme", "promotions"] as const) {
    if (candidate[key] === undefined) continue;
    const r = key === "navigation" ? validateNavigation(candidate[key], scope, `${scope}.navigation`) : key === "theme" ? validateTheme(candidate[key], scope, `${scope}.theme`) : validatePromotions(candidate[key], scope, `${scope}.promotions`);
    if (!r.ok) {
      diagnostics.push(`${scope}: ${key} is invalid and was ignored (${r.errors[0]})`);
      delete candidate[key];
    }
  }
  if (!pages) delete (candidate as { pages?: unknown }).pages;
  if (!customizers) delete (candidate as { customizers?: unknown }).customizers;
  if (candidate.collections !== undefined && !validateScopeDoc({ ...candidate, home: undefined, collections: candidate.collections }).ok) {
    // A malformed enablement list must not take the home down: without it, sections on internal collections are simply not rendered.
    diagnostics.push(`${scope}: collections list is invalid and was ignored`);
    delete (candidate as { collections?: unknown }).collections;
  }
  if (candidate.home === undefined) delete (candidate as { home?: unknown }).home;
  const checked = validateScopeDoc(candidate);
  if (!checked.ok) {
    diagnostics.push(`${scope}: ${checked.errors[0]}, using the seed`);
    return fallback;
  }
  return checked.value;
}

export function sanitizeBundle(raw: unknown, fallback: PublishedBundle): SanitizeResult {
  const diagnostics: string[] = [];
  if (!isRecord(raw)) return { bundle: null, diagnostics: ["published config is not an object"] };
  if (raw.schemaVersion !== 1) return { bundle: null, diagnostics: [`incompatible schemaVersion ${String(raw.schemaVersion)} (this build reads 1)`] };
  if (typeof raw.releaseId !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(raw.releaseId)) return { bundle: null, diagnostics: ["invalid releaseId"] };
  // The seed's own media stay resolvable: a scope that falls back to the seed document still needs its banners.
  const media = { ...fallback.media, ...sanitizeMedia(raw.media, diagnostics) };
  const rawDocs = isRecord(raw.docs) ? raw.docs : {};
  const docs = {} as Record<Scope, ScopeDoc>;
  for (const scope of SCOPES) docs[scope] = sanitizeDoc(scope, rawDocs[scope], fallback.docs[scope], media, diagnostics);
  return { bundle: { schemaVersion: 1, releaseId: raw.releaseId, docs, media }, diagnostics };
}

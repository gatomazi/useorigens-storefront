/**
 * Tolerant reader of a PUBLISHED bundle (the storefront must never go blank because one optional section is bad). Strict validation
 * (`validateBundle`) is for the publisher; this is for the reader:
 *   - wrong `schemaVersion` or not an object  ⇒ no bundle at all (the caller uses the seed);
 *   - a scope whose document is unusable      ⇒ that scope falls back to the seed's document;
 *   - an invalid OPTIONAL section             ⇒ that section is dropped, with a diagnostic;
 *   - an image the media table does not know  ⇒ the image is dropped (the section keeps its fill), with a diagnostic;
 *   - an invalid hero or footer               ⇒ the whole scope falls back to the seed (the home cannot exist without them).
 * Pure: no I/O, so it is unit-tested with hand-made objects.
 */
import { SCOPES, validateScopeDoc, validateSection, type MediaAssetInfo, type PublishedBundle, type Scope, type ScopeDoc, type Section } from "./schema";

export type SanitizeResult = { bundle: PublishedBundle | null; diagnostics: string[] };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function sanitizeMedia(raw: unknown, diagnostics: string[]): Record<string, MediaAssetInfo> {
  const out: Record<string, MediaAssetInfo> = {};
  if (!isRecord(raw)) {
    diagnostics.push("media table missing: images ignored");
    return out;
  }
  for (const [id, m] of Object.entries(raw)) {
    const ok = isRecord(m) && typeof m.src === "string" && /^(\/|https:\/\/)/.test(m.src) && !m.src.includes("..") && Number.isInteger(m.width) && Number.isInteger(m.height) && (m.width as number) > 0 && (m.height as number) > 0;
    if (ok) out[id] = { src: m.src as string, width: m.width as number, height: m.height as number };
    else diagnostics.push(`media "${id}" is invalid and was ignored`);
  }
  return out;
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
    }
    if (sections[0]?.template !== "hero" || sections[sections.length - 1]?.template !== "footer") {
      diagnostics.push(`${scope}: hero first / footer last not satisfied, using the seed`);
      return fallback;
    }
  }
  const candidate = { ...raw, home: sections ? { sections } : undefined } as unknown as ScopeDoc;
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

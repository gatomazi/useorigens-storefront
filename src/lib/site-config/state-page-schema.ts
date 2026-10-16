/**
 * Contract of the region's state-page switches (types + strict validator). Dependency-light on purpose, like `podio-schema.ts`: `schema.ts` imports it,
 * so it must not import anything that imports `schema.ts` back (no import cycle).
 */
import type { Scope, ScopeDoc, ValidationResult } from "./schema";

/**
 * The sections of the state page (`/<region>/<uf>`) that are NOT built from collections, so the region turns them on or off as a whole. The collection
 * rows follow the state-page hierarchy (`collections.stateCategories` / `stateRows`), and O Pódio has its own switch (`podio`).
 *   showcase  "Destaques de {estado}": one real product per place, by sales signal (editorial/state-showcase.ts)
 *   styles    "Escolha o estilo": the state's city designs by style (editorial/state-styles.ts)
 *   places    the places of the state by region and A–Z (StateCityBrowser)
 */
export const STATE_PAGE_SECTIONS = ["showcase", "styles", "places"] as const;
export type StatePageSection = (typeof STATE_PAGE_SECTIONS)[number];

export const STATE_PAGE_SECTION_LABELS: Record<StatePageSection, string> = {
  showcase: "Destaques",
  styles: "Escolha o estilo",
  places: "Regiões e cidades",
};

/** REGION only. `hidden` = the sections switched OFF, each at most once. Absent (or empty) = every section on; turning the last one back on removes the key. */
export type StatePageConfig = { hidden: StatePageSection[] };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isSection = (v: unknown): v is StatePageSection => typeof v === "string" && (STATE_PAGE_SECTIONS as readonly string[]).includes(v);

export function validateStatePage(input: unknown, scope: Scope, path = "statePage"): ValidationResult<StatePageConfig> {
  if (scope === "global") return { ok: false, errors: [`${path}: belongs to a region`] };
  if (!isRecord(input)) return { ok: false, errors: [`${path}: must be { hidden }`] };
  const errors = Object.keys(input).filter((key) => key !== "hidden").map((key) => `${path}.${key}: unknown field`);
  if (!Array.isArray(input.hidden)) errors.push(`${path}.hidden: must be an array`);
  else {
    input.hidden.forEach((s, i) => { if (!isSection(s)) errors.push(`${path}.hidden[${i}]: must be one of ${STATE_PAGE_SECTIONS.join(", ")}`); });
    if (new Set(input.hidden).size !== input.hidden.length) errors.push(`${path}.hidden: a section at most once`);
  }
  return errors.length === 0 ? { ok: true, value: input as StatePageConfig } : { ok: false, errors };
}

/** Whether a region's document shows one state-page section (no document, or no setting, = shown). */
export const statePageShows = (doc: Pick<ScopeDoc, "statePage"> | null | undefined, section: StatePageSection): boolean => !(doc?.statePage?.hidden ?? []).includes(section);

/** The document with one section switched on or off; the key goes away when nothing is off. */
export function withStatePageSection(doc: ScopeDoc, section: StatePageSection, shown: boolean): ScopeDoc {
  const hidden = (doc.statePage?.hidden ?? []).filter((s) => s !== section);
  if (!shown) hidden.push(section);
  const next: ScopeDoc = { ...doc, statePage: { hidden: STATE_PAGE_SECTIONS.filter((s) => hidden.includes(s)) } };
  if (hidden.length === 0) delete next.statePage;
  return next;
}

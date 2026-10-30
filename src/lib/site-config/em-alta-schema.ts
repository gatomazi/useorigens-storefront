/**
 * Contract of the region's "Em alta" switches (types + strict validator): sales signals from the region's real paid INK orders — the badge on the
 * product cards, the lines under the title of a product page and the "Alguém de MG comprou" notice. Dependency-light on purpose, like
 * `podio-schema.ts`: `schema.ts` imports it, so it must not import anything that imports `schema.ts` back (no import cycle).
 */
import type { Scope, ScopeDoc, ValidationResult } from "./schema";

/**
 * REGION only. Each part on its own; absent (or every part off) = nothing is shown and no INK order is read for it. Unlike the pódio, it starts OFF:
 * turning everything off removes the key.
 */
export type EmAltaConfig = {
  /** "Em alta" or "+50 vendidos" on the product cards (home, collections, city and state pages, search). */
  cards: boolean;
  /** "Em alta", "Vendido 12 vezes nos últimos 7 dias" / "Última compra há 2 h" / "+50 vendidos" under the title of a product page. */
  pdp: boolean;
  /** "Alguém de MG comprou": a notice in the bottom corner of every page, from purchases of the last 72 hours. */
  toast: boolean;
};

export const EM_ALTA_PARTS = ["cards", "pdp", "toast"] as const satisfies readonly (keyof EmAltaConfig)[];
export type EmAltaPart = (typeof EM_ALTA_PARTS)[number];
export const EM_ALTA_OFF: EmAltaConfig = { cards: false, pdp: false, toast: false };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function validateEmAlta(input: unknown, scope: Scope, path = "emAlta"): ValidationResult<EmAltaConfig> {
  if (scope === "global") return { ok: false, errors: [`${path}: belongs to a region`] };
  if (!isRecord(input)) return { ok: false, errors: [`${path}: must be { cards, pdp, toast }`] };
  const errors = Object.keys(input).filter((key) => !(EM_ALTA_PARTS as readonly string[]).includes(key)).map((key) => `${path}.${key}: unknown field`);
  for (const part of EM_ALTA_PARTS) if (typeof input[part] !== "boolean") errors.push(`${path}.${part}: must be boolean`);
  return errors.length === 0 ? { ok: true, value: input as EmAltaConfig } : { ok: false, errors };
}

/** The region's parts (no document, or no setting, = all off). */
export const emAltaOf = (doc: Pick<ScopeDoc, "emAlta"> | null | undefined): EmAltaConfig => ({ ...EM_ALTA_OFF, ...(doc?.emAlta ?? {}) });

/** Whether any part is on (= whether INK orders are read for the region at all). */
export const emAltaAnyOn = (config: EmAltaConfig): boolean => EM_ALTA_PARTS.some((part) => config[part]);

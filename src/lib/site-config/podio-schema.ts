/**
 * Contract of the region's "O Pódio" switch (types + strict validator). Dependency-light on purpose, like `cards-schema.ts`: `schema.ts` imports it,
 * so it must not import anything that imports `schema.ts` back (no import cycle).
 */
import type { Scope, ScopeDoc, ValidationResult } from "./schema";

/**
 * REGION only. `enabled: false` = the region has no pódio: no "Quem está no pódio?" on the home, no "O Pódio" on the state pages, and the daily
 * calculation skips the region (no INK order is read for it). Absent = on, as before the switch existed; turning it back on removes the key.
 */
export type PodioConfig = { enabled: boolean };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function validatePodio(input: unknown, scope: Scope, path = "podio"): ValidationResult<PodioConfig> {
  if (scope === "global") return { ok: false, errors: [`${path}: belongs to a region`] };
  if (!isRecord(input)) return { ok: false, errors: [`${path}: must be { enabled }`] };
  const errors = Object.keys(input).filter((key) => key !== "enabled").map((key) => `${path}.${key}: unknown field`);
  if (typeof input.enabled !== "boolean") errors.push(`${path}.enabled: must be boolean`);
  return errors.length === 0 ? { ok: true, value: input as PodioConfig } : { ok: false, errors };
}

/** Whether a region's document leaves its pódio on (no document, or no setting, = on). */
export const podioEnabledIn = (doc: Pick<ScopeDoc, "podio"> | null | undefined): boolean => doc?.podio?.enabled !== false;

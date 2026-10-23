/**
 * Contract of the store-wide setting of the global search (types + strict validator). Dependency-light on purpose, like `cards-schema.ts`:
 * `schema.ts` imports it, so it must not import anything that imports `schema.ts` back (no import cycle).
 */
import type { PublishedBundle, Scope, ValidationResult } from "./schema";

/**
 * GLOBAL only ("Use Origens", every region): `designs: false` takes the designs of the cities' collection ("Seu Lugar": the city × style results,
 * and a merchandise design with a piece in it) out of the search, in every region and in the "other regions" results too; the other designs, places
 * and editorial pages stay. Absent = every design, as before.
 */
export type SearchConfig = { designs: false };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function validateSearch(input: unknown, scope: Scope, path = "search"): ValidationResult<SearchConfig> {
  if (scope !== "global") return { ok: false, errors: [`${path}: belongs to the global scope (every region)`] };
  if (!isRecord(input)) return { ok: false, errors: [`${path}: must be { designs: false }`] };
  const errors = Object.keys(input).filter((k) => k !== "designs").map((k) => `${path}.${k}: unknown field`);
  if (input.designs !== false) errors.push(`${path}.designs: only false (absent = shown)`);
  return errors.length === 0 ? { ok: true, value: input as SearchConfig } : { ok: false, errors };
}

/** Whether the search shows the cities' collection designs, from a published bundle (absent setting = shown). */
export const searchShowsDesigns = (bundle: PublishedBundle | null | undefined): boolean => bundle?.docs.global?.search?.designs !== false;

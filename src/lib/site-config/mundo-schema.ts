/**
 * Contract of the store-wide "Meu Pequeno Mundo" switch of the panel (types + strict validator). Dependency-light on purpose, like
 * `cards-schema.ts`: `schema.ts` imports it, so it must not import anything that imports `schema.ts` back (no import cycle).
 */
import type { PublishedBundle, Scope, ValidationResult } from "./schema";

/** Same states as the MEU_PEQUENO_MUNDO env (src/lib/mundo/flag.ts): off = nothing; pagina = the page only; on = page + the store's entries. */
export const MUNDO_MODOS = ["off", "pagina", "on"] as const;
export type MundoModo = (typeof MUNDO_MODOS)[number];

/**
 * GLOBAL only (every region): how far the panel opens "Meu Pequeno Mundo". The env stays the ceiling — the panel can only show what the
 * server allows (env "on" = the panel decides; env "pagina" = at most the page; env off = nothing). Absent = follows the env, as before.
 */
export type MundoConfig = { modo: MundoModo };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function validateMundo(input: unknown, scope: Scope, path = "mundo"): ValidationResult<MundoConfig> {
  if (scope !== "global") return { ok: false, errors: [`${path}: belongs to the global scope (every region)`] };
  if (!isRecord(input)) return { ok: false, errors: [`${path}: must be { modo }`] };
  const errors = Object.keys(input).filter((k) => k !== "modo").map((k) => `${path}.${k}: unknown field`);
  if (!(MUNDO_MODOS as readonly unknown[]).includes(input.modo)) errors.push(`${path}.modo: ${MUNDO_MODOS.join(" | ")}`);
  return errors.length === 0 ? { ok: true, value: input as MundoConfig } : { ok: false, errors };
}

/** The panel's choice in a bundle (global `mundo`), or undefined: follow the env. */
export const mundoModoOf = (bundle: PublishedBundle | null | undefined): MundoModo | undefined => bundle?.docs.global?.mundo?.modo;

/** What the store shows: the most restrictive of the env (the ceiling) and the panel (absent = the env's own value). Pure. */
export function modoEfetivo(env: MundoModo, painel: MundoModo | undefined): MundoModo {
  if (!painel) return env;
  return MUNDO_MODOS[Math.min(MUNDO_MODOS.indexOf(env), MUNDO_MODOS.indexOf(painel))];
}

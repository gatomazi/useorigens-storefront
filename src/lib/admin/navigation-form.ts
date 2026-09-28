/**
 * Form → configuration for the Navegação and Aparência screens. Pure. Nothing here trusts the form: the result goes through the same strict validators
 * the publisher uses (`validateNavigation` / `validateTheme`), and anything that is not a known field or a `#rrggbb` colour is refused.
 */
import { HEX_COLOR } from "../site-config/color";
import { NAV_DESTINATIONS, THEME_COLOR_KEYS, validateNavigation, validateTheme, type NavBlockConfig, type NavigationConfig, type NavPrimaryLink, type ThemeColors, type ThemeConfig } from "../site-config/navigation";
import type { Scope } from "../site-config/schema";

export type FormReader = { get(name: string): FormDataEntryValue | null };
export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const text = (fd: FormReader, name: string): string => {
  const v = fd.get(name);
  return typeof v === "string" ? v.trim() : "";
};
const checked = (fd: FormReader, name: string): boolean => fd.get(name) === "on";

function order(fd: FormReader, name: string, label: string, errors: string[]): number {
  const raw = text(fd, name);
  const n = Number(raw);
  if (raw === "" || !Number.isInteger(n) || n < 0 || n > 999) {
    errors.push(`${label}: a posição é um número inteiro de 0 a 999.`);
    return 0;
  }
  return n;
}

function block(fd: FormReader, key: string, label: string, errors: string[]): NavBlockConfig {
  return { label: text(fd, `${key}_label`), visible: checked(fd, `${key}_visible`), order: order(fd, `${key}_order`, label, errors) };
}

export const NAV_BLOCK_KEYS = { primaryBlock: "Bloco Comprar", statesBlock: "Bloco de estados", regionsBlock: "Bloco de outras regiões" } as const;

/** The navigation the editor submitted (always the full set: the three blocks and the three known links). */
export function parseNavigationForm(fd: FormReader, scope: Scope): Parsed<NavigationConfig> {
  const errors: string[] = [];
  const config: NavigationConfig = {
    primaryBlock: block(fd, "primaryBlock", NAV_BLOCK_KEYS.primaryBlock, errors),
    statesBlock: block(fd, "statesBlock", NAV_BLOCK_KEYS.statesBlock, errors),
    regionsBlock: block(fd, "regionsBlock", NAV_BLOCK_KEYS.regionsBlock, errors),
    primaryLinks: NAV_DESTINATIONS.map((destination): NavPrimaryLink => ({
      id: destination,
      destination,
      label: text(fd, `link_${destination}_label`),
      visible: checked(fd, `link_${destination}_visible`),
      order: order(fd, `link_${destination}_order`, `Link ${destination}`, errors),
    })),
  };
  if (errors.length > 0) return { ok: false, errors };
  const checkedConfig = validateNavigation(config, scope);
  return checkedConfig.ok ? { ok: true, value: checkedConfig.value } : { ok: false, errors: checkedConfig.errors.map(readableNavigationError) };
}

/** `navigation.statesBlock.label: a label of 1 to 40 characters` → something an editor can act on. */
export function readableNavigationError(error: string): string {
  const where = error.includes("primaryBlock") ? "Bloco Comprar" : error.includes("statesBlock") ? "Bloco de estados" : error.includes("regionsBlock") ? "Bloco de outras regiões" : error.includes("primaryLinks") ? "Link principal" : "Navegação";
  if (error.includes(".label")) return `${where}: o rótulo precisa ter de 1 a 40 caracteres, sem quebra de linha.`;
  if (error.includes(".order")) return `${where}: a posição é um número inteiro de 0 a 999.`;
  return `${where}: ${error.replace(/^[^:]*:\s*/, "")}`;
}

/** `#RRGGBB` or `RRGGBB` (any case) → `#rrggbb`; empty → unset; anything else → null. */
export function normalizeHex(raw: string): string | "" | null {
  const v = raw.trim();
  if (v === "") return "";
  const withHash = v.startsWith("#") ? v : `#${v}`;
  return HEX_COLOR.test(withHash) ? withHash.toLowerCase() : null;
}

/**
 * `mode`: `none` (no theme: the region keeps its current look), `inherit` (region only) or `override`. A colour left empty is "not set": it keeps the
 * region's current one. The global scope has no `inherit` and no `none` state of its own: it is a palette or nothing.
 */
export function parseThemeForm(fd: FormReader, scope: Scope): Parsed<ThemeConfig | null> {
  const mode = text(fd, "mode");
  if (mode === "none") return { ok: true, value: null };
  if (mode !== "inherit" && mode !== "override") return { ok: false, errors: ["Escolha como esta região usa as cores."] };
  if (mode === "inherit" && scope === "global") return { ok: false, errors: ["A paleta da Use Origens não herda de ninguém."] };
  const colors: Partial<ThemeColors> = {};
  const errors: string[] = [];
  // Inheriting keeps no colours of its own: what the region shows is decided by the global palette.
  if (mode === "override") {
    for (const key of THEME_COLOR_KEYS) {
      const hex = normalizeHex(text(fd, `color_${key}`));
      if (hex === null) errors.push(`Cor inválida em "${key}": use o formato #rrggbb.`);
      else if (hex !== "") colors[key] = hex;
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  const result = validateTheme({ mode, colors }, scope);
  return result.ok ? { ok: true, value: result.value } : { ok: false, errors: result.errors };
}

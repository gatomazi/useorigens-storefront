/**
 * Contract of the regional navigation and theme configuration (types + strict validators). Pure and dependency-light on purpose:
 * `schema.ts` imports it, so it must not import anything that imports `schema.ts` back (no import cycle).
 */
import { HEX_COLOR } from "./color";
import type { Scope, ValidationResult } from "./schema";

// ── Types ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** The primary links the CMS knows how to place. Each maps to a section of the region's home; nothing is a free URL. */
export const NAV_DESTINATIONS = ["styles", "speech", "states"] as const;
export type NavDestination = (typeof NAV_DESTINATIONS)[number];

export type NavPrimaryLink = { id: string; label: string; destination: NavDestination; visible: boolean; order: number };
export type NavBlockConfig = { label: string; visible: boolean; order: number };

export type NavigationConfig = {
  /** The "Comprar" block: its title, visibility and position among the blocks. */
  primaryBlock?: NavBlockConfig;
  primaryLinks?: NavPrimaryLink[];
  /** "Estados do <região>": the block is automatic, only its title, visibility and position are editable. */
  statesBlock?: NavBlockConfig;
  /** "Explorar outras regiões": automatic as well. */
  regionsBlock?: NavBlockConfig;
};

export const THEME_COLOR_KEYS = ["brandPrimary", "headerBackground", "headerText", "mobileMenuBackground", "mobileMenuText", "accent", "pageBackground", "pageText"] as const;
export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number];
export type ThemeColors = Record<ThemeColorKey, string>;
export type ThemeMode = "inherit" | "override";
/** `colors` may be partial: a colour that is not set keeps the region's current one. The global scope is always `override` (it has nothing to inherit). */
export type ThemeConfig = { mode: ThemeMode; colors: Partial<ThemeColors> };

export const MAX_LABEL = 40;
export const MAX_ORDER = 999;

// ── Validation ────────────────────────────────────────────────────────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const ID = /^[a-z0-9-]{1,40}$/;
// Printable text only: a label is rendered into a link, never interpreted; control characters and line breaks are refused.
const CONTROL = /[\u0000-\u001f\u007f]/;

function checkLabel(errors: string[], path: string, v: unknown): void {
  if (typeof v !== "string" || v.trim().length === 0 || v.length > MAX_LABEL || CONTROL.test(v)) errors.push(`${path}: a label of 1 to ${MAX_LABEL} characters`);
}
function checkOrder(errors: string[], path: string, v: unknown): void {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > MAX_ORDER) errors.push(`${path}: an integer from 0 to ${MAX_ORDER}`);
}
function checkBlock(errors: string[], path: string, v: unknown): void {
  if (!isRecord(v)) return void errors.push(`${path}: must be { label, visible, order }`);
  checkLabel(errors, `${path}.label`, v.label);
  if (typeof v.visible !== "boolean") errors.push(`${path}.visible: must be boolean`);
  checkOrder(errors, `${path}.order`, v.order);
}

export function validateNavigation(input: unknown, scope: Scope, path = "navigation"): ValidationResult<NavigationConfig> {
  const errors: string[] = [];
  if (scope === "global") return { ok: false, errors: [`${path}: the navigation belongs to a region`] };
  if (!isRecord(input)) return { ok: false, errors: [`${path}: must be an object`] };
  for (const key of Object.keys(input)) if (!["primaryBlock", "primaryLinks", "statesBlock", "regionsBlock"].includes(key)) errors.push(`${path}.${key}: unknown field`);
  for (const key of ["primaryBlock", "statesBlock", "regionsBlock"] as const) if (input[key] !== undefined) checkBlock(errors, `${path}.${key}`, input[key]);
  if (input.primaryLinks !== undefined) {
    if (!Array.isArray(input.primaryLinks) || input.primaryLinks.length > NAV_DESTINATIONS.length) errors.push(`${path}.primaryLinks: a list of at most ${NAV_DESTINATIONS.length} known links`);
    else {
      const ids = new Set<string>();
      const destinations = new Set<string>();
      input.primaryLinks.forEach((l, i) => {
        const p = `${path}.primaryLinks[${i}]`;
        if (!isRecord(l)) return void errors.push(`${p}: must be an object`);
        for (const key of Object.keys(l)) if (!["id", "label", "destination", "visible", "order"].includes(key)) errors.push(`${p}.${key}: unknown field`);
        if (typeof l.id !== "string" || !ID.test(l.id)) errors.push(`${p}.id: invalid`);
        else if (ids.has(l.id)) errors.push(`${p}.id: duplicate`);
        else ids.add(l.id);
        checkLabel(errors, `${p}.label`, l.label);
        if (typeof l.destination !== "string" || !(NAV_DESTINATIONS as readonly string[]).includes(l.destination)) errors.push(`${p}.destination: one of ${NAV_DESTINATIONS.join(", ")}`);
        else if (destinations.has(l.destination)) errors.push(`${p}.destination: already used by another link`);
        else destinations.add(l.destination);
        if (typeof l.visible !== "boolean") errors.push(`${p}.visible: must be boolean`);
        checkOrder(errors, `${p}.order`, l.order);
      });
    }
  }
  return errors.length === 0 ? { ok: true, value: input as NavigationConfig } : { ok: false, errors };
}

export function validateTheme(input: unknown, scope: Scope, path = "theme"): ValidationResult<ThemeConfig> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: [`${path}: must be an object`] };
  for (const key of Object.keys(input)) if (key !== "mode" && key !== "colors") errors.push(`${path}.${key}: unknown field`);
  if (input.mode !== "inherit" && input.mode !== "override") errors.push(`${path}.mode: inherit or override`);
  else if (scope === "global" && input.mode !== "override") errors.push(`${path}.mode: the global palette has nothing to inherit`);
  if (!isRecord(input.colors)) errors.push(`${path}.colors: must be an object`);
  else {
    for (const [key, value] of Object.entries(input.colors)) {
      if (!(THEME_COLOR_KEYS as readonly string[]).includes(key)) errors.push(`${path}.colors.${key}: unknown colour`);
      else if (typeof value !== "string" || !HEX_COLOR.test(value)) errors.push(`${path}.colors.${key}: must be #rrggbb`);
    }
  }
  return errors.length === 0 ? { ok: true, value: input as ThemeConfig } : { ok: false, errors };
}


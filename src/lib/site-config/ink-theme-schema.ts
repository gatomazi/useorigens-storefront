/**
 * Contract of the region's "Tema da INK" (types + strict validator): how the INK pages that finish the purchase (product page, cart, checkout) look,
 * so the customer recognises the storefront when moving from our product page to the INK. Dependency-light on purpose, like `podio-schema.ts`:
 * `schema.ts` imports it, so it must not import anything that imports `schema.ts` back (no import cycle).
 *
 * Only PRESETS, never free values: no colour, CSS, HTML or text typed by hand reaches the INK. The tokens the Worker receives are built from these
 * presets and the region's own palette (`ink-theme.ts`). What the INK computes (prices, discounts, shipping, payment, validation) is never configurable.
 */
import type { Scope, ValidationResult } from "./schema";

export const INK_THEME_SURFACES = ["pdp", "cart", "checkout"] as const;
export type InkThemeSurface = (typeof INK_THEME_SURFACES)[number];
export const INK_THEME_ACTIONS = ["ink", "region"] as const;
export const INK_THEME_GROUNDS = ["vitrine", "branco"] as const;
export const INK_THEME_CORNERS = ["retos", "suaves"] as const;
export const INK_THEME_FONTS = ["vitrine", "ink"] as const;

/**
 * REGION only. `surfaces` = the owner's switch per surface (the Worker's deploy flags stay the ceiling). Absent = everything off and the presets of
 * the storefront product page (black action, square corners, its font) with the composition of round 2: a light page and the photo grey behind the garment.
 */
export type InkThemeConfig = {
  surfaces: Record<InkThemeSurface, boolean>;
  /** Main action ("Adicionar ao carrinho", "Finalizar compra"): black like the storefront button, or the region's primary colour. */
  action: (typeof INK_THEME_ACTIONS)[number];
  /** Page ground of the product page: white (round 2 default: the photo grey stays behind the garment only) or the storefront grey everywhere. */
  ground: (typeof INK_THEME_GROUNDS)[number];
  /** Buttons, chips, fields and cards: square like the storefront, or slightly rounded (8 px). */
  corners: (typeof INK_THEME_CORNERS)[number];
  /** Hanken Grotesk (the storefront's) or the INK's own Poppins (no font request at all). */
  font: (typeof INK_THEME_FONTS)[number];
};

export const DEFAULT_INK_THEME: InkThemeConfig = Object.freeze({
  surfaces: Object.freeze({ pdp: false, cart: false, checkout: false }),
  action: "ink",
  ground: "branco",
  corners: "retos",
  font: "vitrine",
}) as InkThemeConfig;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

export function validateInkTheme(input: unknown, scope: Scope, path = "inkTheme"): ValidationResult<InkThemeConfig> {
  if (scope === "global") return { ok: false, errors: [`${path}: belongs to a region`] };
  if (!isRecord(input)) return { ok: false, errors: [`${path}: must be { surfaces, action, ground, corners, font }`] };
  const errors = Object.keys(input).filter((k) => !["surfaces", "action", "ground", "corners", "font"].includes(k)).map((k) => `${path}.${k}: unknown field`);
  const s = input.surfaces;
  if (!isRecord(s)) errors.push(`${path}.surfaces: must be { pdp, cart, checkout }`);
  else {
    for (const k of Object.keys(s)) if (!(INK_THEME_SURFACES as readonly string[]).includes(k)) errors.push(`${path}.surfaces.${k}: unknown surface`);
    for (const k of INK_THEME_SURFACES) if (typeof s[k] !== "boolean") errors.push(`${path}.surfaces.${k}: must be boolean`);
  }
  if (!oneOf(INK_THEME_ACTIONS, input.action)) errors.push(`${path}.action: must be one of ${INK_THEME_ACTIONS.join(", ")}`);
  if (!oneOf(INK_THEME_GROUNDS, input.ground)) errors.push(`${path}.ground: must be one of ${INK_THEME_GROUNDS.join(", ")}`);
  if (!oneOf(INK_THEME_CORNERS, input.corners)) errors.push(`${path}.corners: must be one of ${INK_THEME_CORNERS.join(", ")}`);
  if (!oneOf(INK_THEME_FONTS, input.font)) errors.push(`${path}.font: must be one of ${INK_THEME_FONTS.join(", ")}`);
  return errors.length === 0 ? { ok: true, value: input as InkThemeConfig } : { ok: false, errors };
}

/** The region's setting as the editor and the payload see it (no document or no setting = the defaults, every surface off). */
export const inkThemeOf = (doc: { inkTheme?: InkThemeConfig } | null | undefined): InkThemeConfig => doc?.inkTheme ?? DEFAULT_INK_THEME;

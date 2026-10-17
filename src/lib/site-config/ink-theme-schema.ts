/**
 * Contract of the region's "Tema da INK" (types + strict validator): how the INK pages that finish the purchase (product page, cart, checkout) look,
 * so the customer recognises the storefront when moving from our product page to the INK. Dependency-light on purpose, like `podio-schema.ts`:
 * `schema.ts` imports it, so it must not import anything that imports `schema.ts` back (no import cycle).
 *
 * Only PRESETS, never free values: no colour, CSS, HTML or text typed by hand reaches the INK. The tokens the Worker receives are built from these
 * presets and the region's own palette (`ink-theme.ts`). What the INK computes (prices, discounts, shipping, payment, validation) is never configurable.
 */
import { REGIONS, type RegionSlug } from "../geo/regions";
import type { Scope, ValidationResult } from "./schema";

export const INK_THEME_SURFACES = ["pdp", "cart", "checkout"] as const;
export type InkThemeSurface = (typeof INK_THEME_SURFACES)[number];
export const INK_THEME_ACTIONS = ["ink", "region"] as const;
export const INK_THEME_GROUNDS = ["vitrine", "branco"] as const;
export const INK_THEME_CORNERS = ["retos", "suaves"] as const;
export const INK_THEME_FONTS = ["vitrine", "ink"] as const;
/**
 * Colours of the cart and the checkout: "acento" = green with an ochre accent (the art direction's proposal B, chosen on 17/10/2026: charcoal button,
 * straw free-shipping strip with the icon on the region's sand-gold, choices in a livelier green, warm off-white surfaces); "neutra" = tints derived from
 * the presets above, as before. A palette only the Worker knows how to draw (per region; Sul has "acento"), so the owner picks a name, never a colour.
 */
export const INK_THEME_PALETTES = ["acento", "neutra"] as const;
export type InkThemePalette = (typeof INK_THEME_PALETTES)[number];

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
  /** Optional: the cart's free-shipping incentive. Absent = no incentive (and no rule recorded). */
  incentive?: InkCartIncentive;
  /** Colours of the cart and the checkout (`INK_THEME_PALETTES`). Absent = "acento", the chosen direction (`paletteOf`). */
  palette?: InkThemePalette;
};

/**
 * The cart's free-shipping incentive ("Falta 1 peça para o frete grátis"). It REPRESENTS a commercial rule the INK already applies; it never creates one:
 * the INK keeps computing shipping and totals. Only by number of pieces (the INK shows a value-based rule with its own bar). Shown in the cart only
 * when `enabled` AND `confirmed` (the owner states the rule is set up and active in the INK, for every product) AND the Worker has `cart-incentive`.
 */
export type InkCartIncentive = {
  enabled: boolean;
  confirmed: boolean;
  kind: "free-shipping";
  unit: "items";
  /** Minimum number of pieces, as configured in the INK (2 to 20). */
  threshold: number;
  /** Destinations of the rule: states of THIS region, in the region's order. */
  ufs: string[];
};
export const INK_INCENTIVE_LIMITS = { min: 2, max: 20 } as const;
/** What the owner has to confirm in the INK before turning the incentive on (shown in the panel). */
export const INK_INCENTIVE_CHECKLIST = [
  "a quantidade mínima de peças que a INK exige para o frete grátis",
  "que vale para todos os produtos da loja (nenhum fica de fora)",
  "os estados de destino em que vale",
  "quais formas de entrega ficam grátis (todas ou só uma)",
  "se um cupom aplicado mantém ou tira o frete grátis",
  "a data de fim, se houver (desligue aqui quando acabar)",
] as const;

export const DEFAULT_INK_THEME: InkThemeConfig = Object.freeze({
  surfaces: Object.freeze({ pdp: false, cart: false, checkout: false }),
  action: "ink",
  ground: "branco",
  corners: "retos",
  font: "vitrine",
  palette: "acento",
}) as InkThemeConfig;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

export function validateInkTheme(input: unknown, scope: Scope, path = "inkTheme"): ValidationResult<InkThemeConfig> {
  if (scope === "global") return { ok: false, errors: [`${path}: belongs to a region`] };
  if (!isRecord(input)) return { ok: false, errors: [`${path}: must be { surfaces, action, ground, corners, font }`] };
  const errors = Object.keys(input).filter((k) => !["surfaces", "action", "ground", "corners", "font", "incentive", "palette"].includes(k)).map((k) => `${path}.${k}: unknown field`);
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
  if (input.palette !== undefined && !oneOf(INK_THEME_PALETTES, input.palette)) errors.push(`${path}.palette: must be one of ${INK_THEME_PALETTES.join(", ")}`);
  if (input.incentive !== undefined) errors.push(...incentiveErrors(input.incentive, scope, `${path}.incentive`));
  return errors.length === 0 ? { ok: true, value: input as InkThemeConfig } : { ok: false, errors };
}

/** The region's setting as the editor and the payload see it (no document or no setting = the defaults, every surface off). */
export const inkThemeOf = (doc: { inkTheme?: InkThemeConfig } | null | undefined): InkThemeConfig => doc?.inkTheme ?? DEFAULT_INK_THEME;
/** The cart and checkout palette of a setting ("acento" when the setting predates the choice). */
export const paletteOf = (config: Pick<InkThemeConfig, "palette">): InkThemePalette => config.palette ?? "acento";

const INCENTIVE_KEYS = ["enabled", "confirmed", "kind", "unit", "threshold", "ufs"];
// Mensagens em português: o dono chega a elas pelo formulário (ex.: ligar sem confirmar). O caminho fica no fim, para quem depura.
function incentiveErrors(v: unknown, scope: Scope, path: string): string[] {
  if (!isRecord(v)) return [`Incentivo de frete: formato inválido (${path})`];
  const errors = Object.keys(v).filter((k) => !INCENTIVE_KEYS.includes(k)).map((k) => `Incentivo de frete: campo desconhecido (${path}.${k})`);
  if (typeof v.enabled !== "boolean" || typeof v.confirmed !== "boolean") errors.push(`Incentivo de frete: formato inválido (${path})`);
  if (v.enabled === true && v.confirmed !== true) errors.push(`Incentivo de frete: para ligar, confirme que a regra está cadastrada e ativa na INK (${path}.confirmed)`);
  if (v.kind !== "free-shipping" || v.unit !== "items") errors.push(`Incentivo de frete: só frete grátis por quantidade de peças (${path})`);
  if (typeof v.threshold !== "number" || !Number.isInteger(v.threshold) || v.threshold < INK_INCENTIVE_LIMITS.min || v.threshold > INK_INCENTIVE_LIMITS.max) {
    errors.push(`Incentivo de frete: informe o mínimo de peças, de ${INK_INCENTIVE_LIMITS.min} a ${INK_INCENTIVE_LIMITS.max} (${path}.threshold)`);
  }
  const allowed = scope === "global" ? [] : REGIONS[scope as RegionSlug].ufs;
  if (!Array.isArray(v.ufs) || v.ufs.length === 0) errors.push(`Incentivo de frete: marque ao menos um estado de destino (${path}.ufs)`);
  else if (new Set(v.ufs).size !== v.ufs.length || v.ufs.some((uf) => typeof uf !== "string" || !allowed.includes(uf))) {
    errors.push(`Incentivo de frete: os estados precisam ser desta região, sem repetir (${path}.ufs)`);
  }
  return errors;
}

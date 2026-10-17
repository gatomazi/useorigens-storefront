/**
 * "Tema da INK": the public payload (`v: 1`) the Worker of the INK reads server-side (`/api/ink-theme/<região>`) and turns into CSS for the product
 * page, the cart and the checkout of the INK. Pure (no I/O, no `server-only`): the public API, the panel preview, the draft export and the tests run
 * the very same rules. The Worker keeps its own strict copy of the check (`use-origens-workers/src/theme.js`): the contract between the two is `v: 1`.
 *
 * Tokens are only `#rrggbb` (plus a radius of 0 or 8 and a font preset). Their source is the storefront itself: `globals.css` (ground, paper, ink,
 * ink-soft, ink-mute) and `REGION_THEME` (the primary colour the storefront chips use when selected). Identity is the REGION of the INK store the
 * Worker serves: one Worker = one store = one region, so a cart that mixes products of several places keeps one stable look.
 */
import type { RegionSlug } from "../geo/regions";
import { REGION_THEME } from "../theme/region-theme";
import { contrastRatio } from "./color";
import { REGIONS } from "../geo/regions";
import { DEFAULT_INK_THEME, type InkThemeConfig } from "./ink-theme-schema";

export * from "./ink-theme-schema";

export type InkThemeTokens = {
  action: string; onAction: string; selected: string; onSelected: string;
  ground: string; surface: string; paper: string; photo: string; ink: string; inkSoft: string; inkMute: string; line: string;
  radius: 0 | 8; font: "origens" | "ink";
};
/** `incentive` only when the owner turned it on AND confirmed the rule is active in the INK (otherwise the key is absent). */
export type PublicInkIncentive = { enabled: true; kind: "free-shipping"; unit: "items"; threshold: number; ufs: string[] };
export type PublicInkTheme = { v: 1; region: RegionSlug; surfaces: InkThemeConfig["surfaces"]; tokens: InkThemeTokens; incentive?: PublicInkIncentive };

// The storefront's neutral tokens (src/app/globals.css). `line` is `rgb(0 0 0 / 0.22)` composed over the ground, as a solid colour.
export const STOREFRONT_NEUTRALS = Object.freeze({ ground: "#e5e5e5", paper: "#f2f2f0", ink: "#000000", inkSoft: "#33332f", inkMute: "#56564f", line: "#b3b3b0", white: "#ffffff" });
const AA = 4.5;

/** Tokens of a region for a setting. A region colour that would not carry white text at AA falls back to black (and `warnings` says so). */
export function inkThemeTokens(region: RegionSlug, config: InkThemeConfig): { tokens: InkThemeTokens; warnings: string[] } {
  const n = STOREFRONT_NEUTRALS;
  const primary = REGION_THEME[region].primary;
  const warnings: string[] = [];
  const regionOk = contrastRatio(primary, n.white) >= AA;
  if (!regionOk) warnings.push(`A cor da região (${primary}) não tem contraste suficiente com texto branco: o botão e o item escolhido ficam pretos.`);
  const action = config.action === "region" && regionOk ? primary : n.ink;
  const tokens: InkThemeTokens = {
    action,
    onAction: n.white,
    selected: regionOk ? primary : n.ink,
    onSelected: n.white,
    ground: config.ground === "branco" ? n.white : n.ground,
    surface: n.white,
    paper: n.paper,
    // The grey of every INK product photo (and of the storefront ground): behind the gallery and the thumbnails, whatever the page ground is.
    photo: n.ground,
    ink: n.ink,
    inkSoft: n.inkSoft,
    inkMute: n.inkMute,
    line: n.line,
    radius: config.corners === "suaves" ? 8 : 0,
    font: config.font === "ink" ? "ink" : "origens",
  };
  return { tokens, warnings };
}

export function inkThemePayload(region: RegionSlug, config: InkThemeConfig | undefined): PublicInkTheme {
  const c = config ?? DEFAULT_INK_THEME;
  const payload: PublicInkTheme = { v: 1, region, surfaces: { pdp: c.surfaces.pdp, cart: c.surfaces.cart, checkout: c.surfaces.checkout }, tokens: inkThemeTokens(region, c).tokens };
  const i = c.incentive;
  if (i && i.enabled && i.confirmed) {
    payload.incentive = { enabled: true, kind: "free-shipping", unit: "items", threshold: i.threshold, ufs: REGIONS[region].ufs.filter((uf) => i.ufs.includes(uf)) };
  }
  return payload;
}

/** "liga" / "desliga" lines for the publish diff and the editor. */
export const INK_SURFACE_LABEL: Record<keyof InkThemeConfig["surfaces"], string> = {
  pdp: "Página de produto",
  cart: "Carrinho e confirmação de adição",
  checkout: "Checkout (contato, entrega e pagamento)",
};
export const INK_PRESET_LABEL = {
  action: { ink: "Preto (como o botão do site)", region: "Cor da região" },
  ground: { branco: "Claro (o cinza fica só atrás da camiseta)", vitrine: "Cinza do site na página inteira" },
  corners: { retos: "Retos (como o site)", suaves: "Levemente arredondados" },
  font: { vitrine: "Hanken Grotesk (a do site)", ink: "Poppins (a da INK)" },
} as const;

/** One line for the publish diff and the editor: the incentive as the cart would show it, or that it is off. */
export function inkIncentiveText(i: InkThemeConfig["incentive"]): string {
  if (!i) return "sem regra";
  const where = i.ufs.join(", ");
  const rule = `frete grátis a partir de ${i.threshold} peças (${where})`;
  return i.enabled && i.confirmed ? `ligado: ${rule}` : `desligado (${rule}${i.confirmed ? "" : ", regra não confirmada na INK"})`;
}

/**
 * Editor-side readability checks for a section's text against what is behind it. Pure (no I/O). These are ESTIMATES: with a photo the
 * real backdrop under each word is unknown, so an image is judged by its overlay strength, not by pixels.
 *   - text is dark (tone "light") or white (tone "dark");
 *   - with no image, the fill decides: a light fill needs dark text, a dark fill needs white text; "none" is the page ground (#e5e5e5);
 *   - with an image, white text needs a dark-ish overlay (opacity ≥ 0.35 of a dark colour, or a dark preset) and dark text needs a light one.
 * A `blocking` result stops a publish (unreadable text is a bug); a `warning` is shown but allowed.
 */
import { contrastRatio, relativeLuminance as luminance } from "../site-config/color";
import type { Appearance, Color, Fill, Overlay, PageBackdrop, Section } from "../site-config/schema";

const TOKEN_HEX: Record<string, string> = { "token:ground": "#e5e5e5", "token:region-primary": "#4d543d", "token:near-black": "#0a0c0a" };

const hexOf = (c: Color): string => TOKEN_HEX[c] ?? c;

export { contrastRatio };

const PRESET_DARKNESS: Record<string, "dark" | "light" | "none"> = { none: "none", "regional-wash": "light", "regional-wash-primary": "dark", "regional-wash-dark": "dark" };

function fillColors(fill: Fill): string[] {
  if (fill.kind === "solid") return [hexOf(fill.color)];
  if (fill.kind === "gradient") return [hexOf(fill.from), hexOf(fill.to)];
  return [TOKEN_HEX["token:ground"]];
}

export type ReadabilityIssue = { level: "blocking" | "warning"; message: string };

/** How much of the section's colour the glass shows over the page's ground (`SectionBackdrop`: the fill at 30% opacity over a blur). */
export const GLASS_FILL_OPACITY = 0.3;

/** `a` at `alpha` over `b` (both #rrggbb). */
function over(a: string, b: string, alpha: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2].map((i) => Math.round(ch(a, i) * alpha + ch(b, i) * (1 - alpha)).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * `own`: the exact colours the owner gave the section's text (the hero's "Cores do lado do texto"), measured instead of the tone's white or black.
 * `glassOver`: the section's colour is glass ("Cor de fundo como vidro") over a page ground of this colour, so the text sits on the mix of the two, not
 * on the colour itself (the Black Week's gold glass on the #111 ground reads under white text; the solid gold would not).
 */
export function readability(appearance: Appearance, tone: "light" | "dark", hasImage: boolean, own?: Color[], glassOver?: string): ReadabilityIssue[] {
  const texts = own && own.length > 0 ? own.map(hexOf) : [tone === "dark" ? "#ffffff" : "#000000"];
  const issues: ReadabilityIssue[] = [];
  if (!hasImage) {
    const behind = glassOver && appearance.fill.kind !== "none" ? fillColors(appearance.fill).map((c) => over(c, hexOf(glassOver as Color), GLASS_FILL_OPACITY)) : fillColors(appearance.fill);
    const worst = Math.min(...behind.flatMap((c) => texts.map((text) => contrastRatio(text, c))));
    if (worst < 3) issues.push({ level: "blocking", message: `O texto ${own?.length ? "nas cores escolhidas" : tone === "dark" ? "claro" : "escuro"} quase não se lê sobre este fundo (contraste ${worst.toFixed(1)}:1; o mínimo aceito é 3:1).` });
    else if (worst < 4.5) issues.push({ level: "warning", message: `Contraste ${worst.toFixed(1)}:1: legível para títulos, fraco para textos pequenos (o ideal é 4,5:1).` });
    return issues;
  }
  const overlay: Overlay = appearance.overlay;
  const kind = "preset" in overlay ? PRESET_DARKNESS[overlay.preset] : luminance(overlay.color) < 0.2 ? "dark" : "light";
  const strength = "preset" in overlay ? (overlay.preset === "none" ? 0 : 0.7) : overlay.opacity;
  if (tone === "dark" && !(kind === "dark" && strength >= 0.35)) issues.push({ level: "warning", message: "Texto claro sobre foto: aumente a sobreposição escura (a partir de 0,35) para garantir a leitura." });
  if (tone === "light" && !(kind === "light" && strength >= 0.35)) issues.push({ level: "warning", message: "Texto escuro sobre foto: use uma sobreposição clara (a partir de 0,35) ou a foto pode atrapalhar a leitura." });
  return issues;
}

/**
 * A page's own ground ("Fundo da página"): its colour is judged like a section fill under the text it calls for (light text on a dark ground). The
 * pattern's pixels are unknown, so a strong one only warns.
 */
export function groundReadability(backdrop: PageBackdrop): ReadabilityIssue[] {
  const issues = readability({ fill: { kind: "solid", color: backdrop.color }, focal: { mobile: { x: 50, y: 50 }, desktop: { x: 50, y: 50 } }, overlay: { preset: "none" } }, backdrop.tone, false);
  if (backdrop.pattern && backdrop.pattern.opacity > 0.5) issues.push({ level: "warning", message: "Pattern forte: títulos e preços ficam por cima dele. Se atrapalhar a leitura, diminua a intensidade." });
  return issues;
}

/**
 * The three-card hero's text in the owner's own colours ("Cores do lado do texto"): the headline and the supporting text, the theme's dark ink where one is
 * left alone. None for the "feature" opening (its text sits on a ground of its own; the section's colour paints the product half) or without colours.
 */
export function heroTextColors(section: Pick<Section, "template" | "variant" | "heroColors">): Color[] | undefined {
  if (section.template !== "hero" || section.variant === "feature" || !section.heroColors) return undefined;
  const { title, text } = section.heroColors;
  if (!title && !text) return undefined;
  return [title ?? "#000000", text ?? "#000000"];
}

/** The text tone that reads best on a colour: light text on a dark ground, dark text on a light one. */
export const toneFor = (hex: string): "light" | "dark" => (contrastRatio("#ffffff", hex) >= contrastRatio("#000000", hex) ? "dark" : "light");

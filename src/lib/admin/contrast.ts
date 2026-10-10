/**
 * Editor-side readability checks for a section's text against what is behind it. Pure (no I/O). These are ESTIMATES: with a photo the
 * real backdrop under each word is unknown, so an image is judged by its overlay strength, not by pixels.
 *   - text is dark (tone "light") or white (tone "dark");
 *   - with no image, the fill decides: a light fill needs dark text, a dark fill needs white text; "none" is the page ground (#e5e5e5);
 *   - with an image, white text needs a dark-ish overlay (opacity ≥ 0.35 of a dark colour, or a dark preset) and dark text needs a light one.
 * A `blocking` result stops a publish (unreadable text is a bug); a `warning` is shown but allowed.
 */
import { contrastRatio, relativeLuminance as luminance } from "../site-config/color";
import type { Appearance, Color, Fill, Overlay, PageBackdrop } from "../site-config/schema";

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

export function readability(appearance: Appearance, tone: "light" | "dark", hasImage: boolean): ReadabilityIssue[] {
  const text = tone === "dark" ? "#ffffff" : "#000000";
  const issues: ReadabilityIssue[] = [];
  if (!hasImage) {
    const worst = Math.min(...fillColors(appearance.fill).map((c) => contrastRatio(text, c)));
    if (worst < 3) issues.push({ level: "blocking", message: `O texto ${tone === "dark" ? "claro" : "escuro"} quase não se lê sobre este fundo (contraste ${worst.toFixed(1)}:1; o mínimo aceito é 3:1).` });
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

/** The text tone that reads best on a colour: light text on a dark ground, dark text on a light one. */
export const toneFor = (hex: string): "light" | "dark" => (contrastRatio("#ffffff", hex) >= contrastRatio("#000000", hex) ? "dark" : "light");

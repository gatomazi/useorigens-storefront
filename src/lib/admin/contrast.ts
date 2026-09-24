/**
 * Editor-side readability checks for a section's text against what is behind it. Pure (no I/O). These are ESTIMATES: with a photo the
 * real backdrop under each word is unknown, so an image is judged by its overlay strength, not by pixels.
 *   - text is dark (tone "light") or white (tone "dark");
 *   - with no image, the fill decides: a light fill needs dark text, a dark fill needs white text; "none" is the page ground (#e5e5e5);
 *   - with an image, white text needs a dark-ish overlay (opacity ≥ 0.35 of a dark colour, or a dark preset) and dark text needs a light one.
 * A `blocking` result stops a publish (unreadable text is a bug); a `warning` is shown but allowed.
 */
import type { Appearance, Color, Fill, Overlay } from "../site-config/schema";

const TOKEN_HEX: Record<string, string> = { "token:ground": "#e5e5e5", "token:region-primary": "#4d543d", "token:near-black": "#0a0c0a" };

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const hexOf = (c: Color): string => TOKEN_HEX[c] ?? c;

/** WCAG contrast ratio between two colours (1..21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

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

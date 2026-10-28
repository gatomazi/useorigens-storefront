/** WCAG colour maths shared by the admin (editor warnings) and the resolvers. Pure (no I/O). Only `#rrggbb` is understood. */
import type { Color, Fill } from "./schema";

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function relativeLuminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours (1..21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `#4d543d` → `77 84 61`, the form CSS composes with an alpha (`rgb(var(--x) / 0.8)`). */
export function rgbTriplet(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** The text a colour carries when the owner did not choose: white ("light") on a dark colour (the region's, near-black), ink ("dark") on a light one. */
export function colorTone(color: Color | undefined): "light" | "dark" {
  if (!color || color === "token:region-primary" || color === "token:near-black") return "light";
  if (color === "token:ground") return "dark";
  return relativeLuminance(color) > 0.35 ? "dark" : "light";
}

/** The text tone of a fill (its first colour), as `colorTone`. */
export function fillTone(fill: Fill): "light" | "dark" {
  return fill.kind === "solid" ? colorTone(fill.color) : fill.kind === "gradient" ? colorTone(fill.from) : "light";
}

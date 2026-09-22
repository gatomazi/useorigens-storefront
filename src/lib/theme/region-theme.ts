import type { CSSProperties } from "react";
import type { RegionSlug } from "../geo/regions";

/**
 * Regional colour tokens. The ONLY place a regional hex value lives; components use the CSS variables below
 * (`bg-region-primary`, `border-region-accent`, ...), never a hex.
 *
 * The rule: COLOUR IDENTIFIES THE REGION, STRUCTURE IDENTIFIES THE BRAND. Each region operates with one primary, one
 * accent and one neutral base. Secondary and earth tones are for editorial areas only, never all at once. Typography,
 * grid, header, search, product cards, PDP, motion and footer are shared and stay neutral.
 *
 * Contrast (WCAG AA) of every combination used is recorded in docs/design/regional-color-system-sul.md.
 */
export type RegionTheme = {
  /** Chips and filters (active), hover, secondary CTAs, active indicators, editorial blocks. */
  primary: string;
  /** Same colour as `primary`, as "r g b", so CSS can compose it with an alpha (rgb(var(...) / 0.8)). */
  primaryRgb: string;
  /** Second colour, used sparingly (territorial cards, contrast with primary). Not every region needs one. */
  secondary?: string;
  /** Labels, thin lines, dividers, badges, small icons. Never text on a light ground (it does not pass AA there). */
  accent: string;
  /** Base of editorial sections and cards. */
  surface: string;
  /** Text colour on `surface`. */
  text: string;
  /** Tint drawn over the hero landscape, as "r g b" (light and warm, so the banner sits close to the page). */
  heroWash: string;
  /** Extra tones for editorial areas only. */
  earth?: readonly string[];
};

export const REGION_THEME: Readonly<Record<RegionSlug, RegionTheme>> = {
  sul: {
    primary: "#4d543d", // olive
    primaryRgb: "77 84 61",
    accent: "#d6ba8d", // sand gold
    surface: "#ffffff",
    text: "#000000",
    heroWash: "236 228 212",
  },
  "centro-oeste": {
    primary: "#8c3b1f", // terracotta
    primaryRgb: "140 59 31",
    secondary: "#3e5f3c", // earthy green
    accent: "#e39a2d", // gold yellow
    surface: "#e6d6c3", // light beige
    text: "#000000",
    heroWash: "230 214 195",
    earth: ["#5a2e1b"], // reddish brown
  },
  norte: {
    primary: "#234b50", // petrol blue
    primaryRgb: "35 75 80",
    secondary: "#3b7a57", // green
    accent: "#d4b873", // golden mustard
    surface: "#ffffff",
    text: "#000000",
    heroWash: "238 232 216",
    earth: ["#b2713d", "#964b00", "#a8c686"], // wood, brown, light green
  },
};

/**
 * Inline CSS variables for the region wrapper. `--region-fill` and `--region-ink` are the older names, kept as aliases
 * (accent and primary) so existing classes (`border-region`, `focus:border-region-ink`) keep working.
 */
export function regionThemeStyle(region: RegionSlug): CSSProperties {
  const t = REGION_THEME[region];
  return {
    ["--region-primary" as string]: t.primary,
    ["--region-primary-rgb" as string]: t.primaryRgb,
    ["--region-secondary" as string]: t.secondary ?? t.primary,
    ["--region-accent" as string]: t.accent,
    ["--region-surface" as string]: t.surface,
    ["--region-wash" as string]: t.heroWash,
    ["--region-fill" as string]: t.accent,
    ["--region-ink" as string]: t.primary,
  };
}

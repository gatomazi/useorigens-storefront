import { contrastRatio, rgbTriplet } from "./color";
import { contrastMessage, themeContrast, themeCssVars, type ResolvedTheme, type ThemeColors, type ThemeConfig } from "./navigation";
import { THEME_COLOR_KEYS, type ThemeColorKey } from "./navigation-schema";

/** Defaults of the actual regionless storefront, independent of every regional/default-global palette. */
export const NEUTRAL_THEME_DEFAULTS: ThemeColors = {
  brandPrimary: "#000000", headerBackground: "#000000", headerText: "#ffffff", mobileMenuBackground: "#000000", mobileMenuText: "#ffffff",
  accent: "#56564f", pageBackground: "#e5e5e5", pageText: "#000000",
};

export function resolveNeutralTheme(theme?: ThemeConfig): ResolvedTheme {
  const configured = theme?.mode === "override" ? { ...theme.colors } : {};
  const primary = configured.brandPrimary ?? NEUTRAL_THEME_DEFAULTS.brandPrimary;
  const effective = { ...NEUTRAL_THEME_DEFAULTS, headerBackground: primary, mobileMenuBackground: primary, ...configured };
  const origin = Object.fromEntries(THEME_COLOR_KEYS.map((k) => [k, k in configured ? "own" : "default"])) as Record<ThemeColorKey, "own" | "default">;
  return { mode: theme?.mode === "override" ? "override" : "default", configured, effective, origin };
}

export function neutralThemeProblems(theme?: ThemeConfig): { blocking: string[]; warnings: string[] } {
  if (!theme) return { blocking: [], warnings: [] };
  const pairs = themeContrast(resolveNeutralTheme(theme).effective);
  return { blocking: pairs.filter((p) => p.level === "blocking").map(contrastMessage), warnings: pairs.filter((p) => p.level === "warning").map(contrastMessage) };
}

export function neutralThemeCssVars(theme?: ThemeConfig): Record<string, string> {
  const { configured, effective } = resolveNeutralTheme(theme);
  const vars = themeCssVars(configured, effective);
  if (configured.brandPrimary || configured.headerBackground || configured.headerText) {
    vars["--nav-header-bg"] ??= effective.headerBackground;
    vars["--nav-header-text"] ??= effective.headerText;
  }
  if (configured.brandPrimary || configured.mobileMenuBackground || configured.mobileMenuText) {
    vars["--nav-menu-bg"] ??= effective.mobileMenuBackground;
    vars["--nav-menu-text"] ??= effective.mobileMenuText;
  }
  if (configured.brandPrimary) vars["--neutral-on-primary"] = contrastRatio("#ffffff", effective.brandPrimary) >= contrastRatio("#000000", effective.brandPrimary) ? "#ffffff" : "#000000";
  if (configured.pageText || configured.pageBackground) {
    const rgb = rgbTriplet(effective.pageText);
    vars["--ink-soft"] = effective.pageText;
    vars["--ink-mute"] = effective.pageText;
    vars["--line"] = `rgb(${rgb} / 0.22)`;
    // --ink also paints controls. Keep their label legible when the page text itself is light.
    vars["--neutral-on-ink"] = contrastRatio("#ffffff", effective.pageText) >= contrastRatio("#000000", effective.pageText) ? "#ffffff" : "#000000";
  }
  return vars;
}

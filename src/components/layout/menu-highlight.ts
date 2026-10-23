import type { CSSProperties } from "react";
import type { MenuHighlightColors } from "@/lib/site-config/schema";

/**
 * The colours of a highlighted collection as CSS variables for `.menu-highlight` (globals.css), and the data attributes that say which ones are set
 * (`data-hl-bg` gives it the button's padding). Nothing for a link that is not highlighted.
 */
export function highlightProps(highlight: MenuHighlightColors | undefined): { style?: CSSProperties; "data-hl-bg"?: ""; "data-hl-line"?: "" } {
  if (!highlight) return {};
  const vars: Record<string, string> = {};
  if (highlight.background) vars["--hl-bg"] = highlight.background;
  if (highlight.text) vars["--hl-text"] = highlight.text;
  if (highlight.underline) vars["--hl-line"] = highlight.underline;
  return { style: vars as CSSProperties, ...(highlight.background ? { "data-hl-bg": "" as const } : {}), ...(highlight.underline ? { "data-hl-line": "" as const } : {}) };
}

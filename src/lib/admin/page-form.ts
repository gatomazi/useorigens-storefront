/**
 * Turns the "Fundo da página" form of a page into a `PageBackdrop` (or `null`: the page goes back to the region's ground). Pure, like section-form.ts:
 * every value is parsed into the contract's closed vocabulary and the result still goes through `validatePage` in `applyOp`.
 */
import { PATTERN_OPACITY, PATTERN_SIZE, type PageBackdrop } from "./contract";

type Fields = { get(name: string): FormDataEntryValue | null };

const str = (f: Fields, name: string): string => {
  const v = f.get(name);
  return typeof v === "string" ? v.trim() : "";
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const HEX = /^#[0-9a-fA-F]{6}$/;

/** The form's starting values: what is saved, or a Black Friday-ready suggestion (black ground, light text) when the page has no ground of its own. */
export const PAGE_BACKDROP_SUGGESTION = { color: "#0a0a0a", tone: "dark", size: 160, opacity: 0.25 } as const;

export function parsePageBackdrop(f: Fields): { backdrop: PageBackdrop | null; problems: string[] } {
  if (f.get("backdrop_on") === null) return { backdrop: null, problems: [] };
  const color = str(f, "backdrop_color").toLowerCase();
  if (!HEX.test(color)) return { backdrop: null, problems: ["Escolha a cor do fundo (formato #rrggbb)."] };
  const tone = str(f, "backdrop_tone") === "light" ? "light" : "dark";
  const assetId = str(f, "backdrop_pattern");
  const size = Number.parseInt(str(f, "backdrop_size"), 10);
  const opacity = Number.parseFloat(str(f, "backdrop_opacity"));
  const pattern = assetId
    ? {
        image: { assetId, alt: "", decorative: true },
        size: clamp(Number.isFinite(size) ? size : PAGE_BACKDROP_SUGGESTION.size, PATTERN_SIZE.min, PATTERN_SIZE.max),
        opacity: Math.round(clamp(Number.isFinite(opacity) ? opacity : PAGE_BACKDROP_SUGGESTION.opacity, PATTERN_OPACITY.min, PATTERN_OPACITY.max) * 100) / 100,
      }
    : undefined;
  return { backdrop: { color: color as `#${string}`, tone, ...(pattern ? { pattern } : {}) }, problems: [] };
}

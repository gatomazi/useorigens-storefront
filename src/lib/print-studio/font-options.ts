import type { PrintFont } from "./model";

type FontOption = { id: string; name: string; weight?: number };
export type FontFamilyOption = { id: string; name: string; variants: FontOption[] };

/** The files remain independent assets; the controls expose one family and its actual cuts. */
const MONT_VARIANTS = [
  { id: "font-mont-extralight", name: "Extraleve", weight: 200 },
  { id: "font-mont-pdf-regular", name: "Regular", weight: 400 },
  { id: "font-mont-pdf-italic", name: "Regular itálico", weight: 400 },
  { id: "font-mont-bold-rebuilt", name: "Negrito", weight: 700 },
  { id: "font-mont-heavy", name: "Pesado", weight: 900 },
  { id: "font-mont-pdf-bold", name: "Negrito (parcial)", weight: 700 },
] as const;

export function fontFamilyId(fontId: string): string {
  return MONT_VARIANTS.some((variant) => variant.id === fontId) ? "mont" : fontId;
}

export function fontOptionWeight(font: FontOption): number | undefined {
  return font.weight ?? MONT_VARIANTS.find((variant) => variant.id === font.id)?.weight;
}

export function groupFontOptions(fonts: readonly FontOption[]): FontFamilyOption[] {
  const families = new Map<string, FontFamilyOption>();
  const seen = new Set<string>();
  for (const font of fonts) {
    if (seen.has(font.id)) continue;
    seen.add(font.id);
    const id = fontFamilyId(font.id);
    const cut = MONT_VARIANTS.find((variant) => variant.id === font.id);
    const family = families.get(id) ?? { id, name: id === "mont" ? "Mont" : font.name, variants: [] };
    family.variants.push(cut ? { id: font.id, name: cut.name, weight: fontOptionWeight(font) } : font);
    families.set(id, family);
  }
  const mont = families.get("mont");
  if (mont) mont.variants.sort((a, b) => MONT_VARIANTS.findIndex((v) => v.id === a.id) - MONT_VARIANTS.findIndex((v) => v.id === b.id));
  return [...families.values()];
}

/** Keep the nearest available weight when changing families, preferring Regular over Italic. */
export function preferredFontVariant(family: FontFamilyOption, weight = 400): FontOption {
  return [...family.variants].sort((a, b) => Math.abs((a.weight ?? 400) - weight) - Math.abs((b.weight ?? 400) - weight) || Math.abs((a.weight ?? 400) - 400) - Math.abs((b.weight ?? 400) - 400))[0];
}

/** Include all available cuts when choosing a family, preserving files already frozen in the project. */
export function includeFontFamily(existing: PrintFont[], available: PrintFont[], fontId: string): PrintFont[] {
  const family = fontFamilyId(fontId);
  const known = new Set(existing.map((font) => font.id));
  const expanded = [...existing, ...available.filter((font) => fontFamilyId(font.id) === family && !known.has(font.id))];
  const fonts = expanded.length > 20 && known.has(fontId) ? existing : expanded;
  return fonts.map((font) => {
    const weight = font.id === fontId ? fontOptionWeight(font) : undefined;
    return font.weight === undefined && weight !== undefined ? { ...font, weight } : font;
  });
}

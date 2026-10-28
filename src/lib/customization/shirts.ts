/**
 * Shirt colours of the preview: a blank photo each in `public/personalizacao/camisetas/{id}.webp` (800 × 820, INK mockup framing). The colour
 * is only for seeing the art; it picks the art version: light shirts get the dark-ink art (the "camiseta clara" base), every other one the light-ink art.
 * The SAME table decides which art each colour gets on a product created at INK (`ink` is INK's colour name), so the preview and the shirt never
 * disagree: white, grey and yellow take the dark-ink art (the owner's rule for yellow, 22/10/2026). `kids`: INK's Camiseta Infantil has the colour.
 */
export type ShirtColor = { id: string; label: string; swatch: string; light: boolean; ink: string; kids: boolean };

export const SHIRT_COLORS: ShirtColor[] = [
  { id: "preta", label: "Preta", swatch: "#171b1c", light: false, ink: "Preta", kids: true },
  { id: "branca", label: "Branca", swatch: "#f8f8f8", light: true, ink: "Branca", kids: true },
  { id: "cinza", label: "Cinza", swatch: "#a6abb2", light: true, ink: "Cinza", kids: true },
  { id: "marinho", label: "Marinho", swatch: "#212632", light: false, ink: "Marinho", kids: true },
  { id: "verde", label: "Verde", swatch: "#28382c", light: false, ink: "Verde", kids: false },
  { id: "bordeaux", label: "Bordô", swatch: "#5e1d23", light: false, ink: "Bordeaux", kids: true },
  { id: "vermelha", label: "Vermelha", swatch: "#a5271a", light: false, ink: "Vermelho", kids: false },
  { id: "amarela", label: "Amarela", swatch: "#d8a800", light: true, ink: "Amarelo", kids: true },
  { id: "rosa", label: "Rosa", swatch: "#a47877", light: false, ink: "Rosa", kids: false },
];

export const shirtColor = (id: string | undefined): ShirtColor => SHIRT_COLORS.find((c) => c.id === id) ?? SHIRT_COLORS[0];
export const shirtPhoto = (id: string) => `/personalizacao/camisetas/${shirtColor(id).id}.webp`;

/** The colours a garment comes in: the Camiseta Infantil has only six of the nine. */
export const shirtColorsFor = (kids: boolean): ShirtColor[] => (kids ? SHIRT_COLORS.filter((c) => c.kids) : SHIRT_COLORS);

/** Whether INK's colour (`color.name` of a print area) takes the dark-ink art; null when the colour is not in the table (never guess: stop). */
export function inkColorTakesDarkInk(inkColor: string): boolean | null {
  const color = SHIRT_COLORS.find((c) => c.ink === inkColor);
  return color ? color.light : null;
}

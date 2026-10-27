/**
 * Shirt colours of the preview: a blank photo each in `public/personalizacao/camisetas/{id}.webp` (800 × 820, INK mockup framing). The colour
 * is only for seeing the art; it picks the art version: light shirts get the dark-ink art (the "camiseta clara" base), every other one the light-ink art.
 */
export type ShirtColor = { id: string; label: string; swatch: string; light: boolean };

export const SHIRT_COLORS: ShirtColor[] = [
  { id: "preta", label: "Preta", swatch: "#171b1c", light: false },
  { id: "branca", label: "Branca", swatch: "#f8f8f8", light: true },
  { id: "cinza", label: "Cinza", swatch: "#a6abb2", light: true },
  { id: "marinho", label: "Marinho", swatch: "#212632", light: false },
  { id: "verde", label: "Verde", swatch: "#28382c", light: false },
  { id: "bordeaux", label: "Bordô", swatch: "#5e1d23", light: false },
  { id: "vermelha", label: "Vermelha", swatch: "#a5271a", light: false },
  { id: "amarela", label: "Amarela", swatch: "#d8a800", light: false },
  { id: "rosa", label: "Rosa", swatch: "#a47877", light: false },
];

export const shirtColor = (id: string | undefined): ShirtColor => SHIRT_COLORS.find((c) => c.id === id) ?? SHIRT_COLORS[0];
export const shirtPhoto = (id: string) => `/personalizacao/camisetas/${shirtColor(id).id}.webp`;

import type { MerchantColor } from "./source";

/**
 * Which of the product's own colors the COVER shows. INK's API says which colors exist (with `hex_color`) but not which one the cover
 * (`main_image_url`) was made from, and Google rejects an item whose `color` disagrees with its `image_link`. The cover is a mockup on a
 * flat light-grey background: drop the background (median of the border), let every remaining pixel vote for the nearest candidate color
 * in CIELAB, and accept only a clear winner. Lightness weighs half: a mockup renders black as dark grey and white as light grey, while hue
 * and chroma survive the lighting (dark green stays green, navy stays blue).
 *
 * Since 30/10/2026 the city designs' covers are a person wearing the shirt (a chest crop, chin and neck at the top centre, a scene
 * around). There the border is the scene, so the backdrop rule above never trusts them: such a cover is recognised by the skin at the top
 * centre and judged on the torso below the print instead, where the garment fills the frame.
 */
export type CoverColorVerdict = { color: string; share: number; runnerUp: number; confident: boolean };

/** Part of every cached verdict's key (src/lib/merchant/generate.ts): bump it when the rule changes and every cover is judged again. */
export const COVER_CLASSIFIER_VERSION = 3;

/** INK's colors without a `hex_color` in a product (older variants). Same values INK sends elsewhere. */
const KNOWN_HEX: Readonly<Record<string, string>> = {
  preta: "000000",
  branca: "ffffff",
  "off white": "f4f1ea",
  cinza: "808080",
  marinho: "222e4b",
  verde: "003218",
  vermelho: "d52100",
  amarelo: "ca8a00",
  rosa: "a47a77",
  areia: "ded1bd",
  bordeaux: "5b1a2a",
  "azul bebê": "d8e8f1",
  "rosa bebê": "f4dfd5",
};

const MIN_SHARE = 0.45;
const MIN_LEAD = 1.5;
/** A cover worn by a person has no backdrop to drop: the vote must be clearer. */
const WORN_MIN_SHARE = 0.6;
const WORN_MIN_LEAD = 2;
/** RGB distance from the background median below which a pixel is background. */
const BACKGROUND_DISTANCE = 10;

type Lab = [number, number, number];

function toLab(r: number, g: number, b: number): Lab {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const x = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
  const y = f(R * 0.2126 + G * 0.7152 + B * 0.0722);
  const z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

const hexToRgb = (hex: string): [number, number, number] => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

export function candidateHex(color: Pick<MerchantColor, "name" | "hex">): string | null {
  return color.hex ?? KNOWN_HEX[color.name.trim().toLowerCase()] ?? null;
}

/** `rgb` is packed RGB (3 bytes per pixel, row-major), `width`×`height`. */
export function classifyCoverPixels(rgb: Uint8Array, width: number, height: number, colors: readonly Pick<MerchantColor, "name" | "hex">[]): CoverColorVerdict | null {
  const candidates = colors.flatMap((c) => {
    const hex = candidateHex(c);
    return hex ? [{ name: c.name, hex, lab: toLab(...hexToRgb(hex)) }] : [];
  });
  if (candidates.length === 0) return null;
  // Two colors with the same hex (INK sends Off White as ffffff, like Branca) cannot be told apart: a win for either is not confident.
  const sameHex = (name: string) => candidates.filter((c) => c.hex === candidates.find((x) => x.name === name)!.hex).length > 1;
  if (candidates.length === 1) return { color: candidates[0].name, share: 1, runnerUp: 0, confident: true };

  const border: number[][] = [[], [], []];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x > 1 && y > 1 && x < width - 2 && y < height - 2) continue;
      const i = (y * width + x) * 3;
      for (let c = 0; c < 3; c++) border[c].push(rgb[i + c]);
    }
  }
  const bg = border.map((values) => values.sort((a, b) => a - b)[values.length >> 1]);
  // INK's mockups sit on a flat light-grey/white backdrop. A coloured border means a photo or an art background (a flag, the garment
  // itself filling the frame): then "background" may be the garment, and the verdict is never confident.
  const neutralBackdrop = Math.max(...bg) - Math.min(...bg) <= 16 && Math.min(...bg) >= 170;

  if (wornOnPerson(rgb, width, height)) {
    // The torso below the print: the garment, with the arms and the scene left out at the sides.
    const tally = vote(rgb, width, Math.round(width * 0.3), Math.round(width * 0.7), Math.round(height * 0.6), Math.round(height * 0.97), null, candidates);
    if (!tally) return null;
    const { color, share, runnerUp } = tally;
    return { color, share, runnerUp, confident: share >= WORN_MIN_SHARE && share >= runnerUp * WORN_MIN_LEAD && !sameHex(color) };
  }
  const tally = vote(rgb, width, 0, width, 0, height, bg, candidates);
  if (!tally) return null;
  const { color, share, runnerUp } = tally;
  return { color, share, runnerUp, confident: neutralBackdrop && share >= MIN_SHARE && share >= runnerUp * MIN_LEAD && !sameHex(color) };
}

const isSkin = (r: number, g: number, b: number) => r > 45 && r > g && g > b * 0.85 && r - b > 15 && r - g < 100;

/** Our covers worn by a person: the top centre of the frame (chin and neck) is mostly skin. */
function wornOnPerson(rgb: Uint8Array, width: number, height: number): boolean {
  let skin = 0;
  let total = 0;
  for (let y = Math.round(height * 0.04); y < Math.round(height * 0.18); y++) {
    for (let x = Math.round(width * 0.42); x < Math.round(width * 0.58); x++) {
      const i = (y * width + x) * 3;
      total++;
      if (isSkin(rgb[i], rgb[i + 1], rgb[i + 2])) skin++;
    }
  }
  return total > 0 && skin / total >= 0.3;
}

/**
 * Pixels of the box [x0, x1) × [y0, y1) grouped in coarse RGB bins. The garment is a large flat area, so it fills a few big bins; a print, a
 * shadow or a baby's skin (Body covers) spreads over many small ones. Only the biggest bins, up to half of the counted pixels, vote. With
 * `bg`, pixels near it are left out (the mockup backdrop).
 */
function vote(rgb: Uint8Array, width: number, x0: number, x1: number, y0: number, y1: number, bg: number[] | null,
  candidates: { name: string; lab: Lab }[]): { color: string; share: number; runnerUp: number } | null {
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  let foreground = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 3;
      const [r, g, b] = [rgb[i], rgb[i + 1], rgb[i + 2]];
      if (bg && Math.hypot(r - bg[0], g - bg[1], b - bg[2]) <= BACKGROUND_DISTANCE) continue;
      foreground++;
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const bin = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      bin.n++;
      bin.r += r;
      bin.g += g;
      bin.b += b;
      bins.set(key, bin);
    }
  }
  if (foreground < (x1 - x0) * (y1 - y0) * 0.05) return null;

  const votes = new Map<string, number>();
  let counted = 0;
  for (const bin of [...bins.values()].sort((a, b) => b.n - a.n)) {
    if (counted >= foreground / 2) break;
    counted += bin.n;
    const [L, A, B] = toLab(bin.r / bin.n, bin.g / bin.n, bin.b / bin.n);
    let best = candidates[0].name;
    let bestDistance = Infinity;
    for (const c of candidates) {
      const d = Math.hypot((L - c.lab[0]) * 0.5, A - c.lab[1], B - c.lab[2]);
      if (d < bestDistance) [best, bestDistance] = [c.name, d];
    }
    votes.set(best, (votes.get(best) ?? 0) + bin.n);
  }
  const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1]);
  return { color: ranked[0][0], share: ranked[0][1] / counted, runnerUp: ranked[1] ? ranked[1][1] / counted : 0 };
}

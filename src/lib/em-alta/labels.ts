/**
 * "Em alta" — the public payload (`v: 1`) and the words a page shows for it. Pure and client-safe: the storefront's components and the tests run these
 * very rules. The Worker of the INK keeps its own copy of the wording (`use-origens-workers/src/loader/em-alta.js`); the contract between the two is
 * the payload below — the thresholds are decided on the server, so a client never has to know them.
 */

export type EmAltaShow = { cards: boolean; pdp: boolean; toast: boolean };

/** What one product has to show. Every field is present only when it passes its threshold; a product with nothing is absent from the payload. */
export type EmAltaProduct = {
  /** INK's slug (how the Worker recognises a product card's link). */
  slug: string;
  /** 5+ units in the last 7 days and at least twice the 7 days before. */
  hot?: true;
  /** Units in the last 7 days, from 3. */
  week?: number;
  /** The newest sale (ISO), when it is within the last 72 hours. */
  last?: string;
  /** Units ever sold, rounded DOWN to 10 / 50 / 100 / 500 / 1000 (never more than the real number), from 10. */
  sold?: number;
};

/** One recent purchase (last 72 hours): the delivery state and the product, never who bought it nor their city. */
export type EmAltaRecent = { key: string; id: string; slug: string; uf: string; at: string; name: string; image: string | null; url: string | null };

export type PublicEmAlta = {
  v: 1;
  region: string;
  show: EmAltaShow;
  /** When the payload was made (ISO). */
  at: string;
  /** Keyed by INK product id. Empty when neither the cards nor the product page are on. */
  products: Record<string, EmAltaProduct>;
  /** Newest first, at most RECENT_MAX. Empty when the notice is off. */
  recent: EmAltaRecent[];
};

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
export const RECENT_WINDOW_MS = 72 * HOUR_MS;
export const RECENT_MAX = 20;
export const SOLD_STEPS = [1000, 500, 100, 50, 10] as const;

/** "+10 vendidos" … "+1 mil vendidos". */
export const soldText = (sold: number): string => (sold >= 1000 ? `+${sold / 1000} mil vendidos` : `+${sold} vendidos`);

/** How long ago, as the notice and the product page say it: "agora há pouco", "há 12 min", "há 2 h", "há 1 dia". Never in the future. */
export function agoText(at: string | number, now: number): string {
  const ms = Math.max(0, now - (typeof at === "number" ? at : Date.parse(at)));
  if (ms < 60_000) return "agora há pouco";
  if (ms < HOUR_MS) return `há ${Math.floor(ms / 60_000)} min`;
  if (ms < DAY_MS) return `há ${Math.floor(ms / HOUR_MS)} h`;
  const days = Math.floor(ms / DAY_MS);
  return `há ${days} ${days === 1 ? "dia" : "dias"}`;
}

export type EmAltaLine = { kind: "hot" | "week" | "last" | "sold"; text: string };

/** The card's one badge: "Em alta", else the units ever sold. None = nothing to show. */
export function cardLine(product: EmAltaProduct | undefined): EmAltaLine | null {
  if (!product) return null;
  if (product.hot) return { kind: "hot", text: "Em alta" };
  if (product.sold) return { kind: "sold", text: soldText(product.sold) };
  return null;
}

/**
 * The product page's lines, under the title: "Em alta" (same rule as the card), then "Vendido N vezes nos últimos 7 dias" (from 3), else "Última compra
 * há 2 h" (last 72 hours, checked again against `now`: a cached payload never says an old sale is recent), else the card's "+50 vendidos".
 */
export function pdpLines(product: EmAltaProduct | undefined, now: number): EmAltaLine[] {
  if (!product) return [];
  const lines: EmAltaLine[] = [];
  if (product.hot) lines.push({ kind: "hot", text: "Em alta" });
  const lastAt = product.last ? Date.parse(product.last) : NaN;
  if (product.week) lines.push({ kind: "week", text: `Vendido ${product.week} vezes nos últimos 7 dias` });
  else if (Number.isFinite(lastAt) && now - lastAt < RECENT_WINDOW_MS) lines.push({ kind: "last", text: `Última compra ${agoText(lastAt, now)}` });
  else if (product.sold) lines.push({ kind: "sold", text: soldText(product.sold) });
  return lines;
}

/** "Alguém de MG comprou". */
export const recentTitle = (recent: Pick<EmAltaRecent, "uf">): string => `Alguém de ${recent.uf} comprou`;

/** Defensive read of a payload (the client never trusts a shape it did not check). Null = not a v1 payload. */
export function readEmAlta(value: unknown): PublicEmAlta | null {
  const v = value as PublicEmAlta;
  if (typeof v !== "object" || v === null || v.v !== 1 || typeof v.show !== "object" || v.show === null) return null;
  if (typeof v.products !== "object" || v.products === null || !Array.isArray(v.recent)) return null;
  return v;
}

import { INK_IMAGE_HOST, INK_IMAGE_PATH_PREFIX, MAX_ITEMS } from "./constants";
import type { CartMirrorItem, CartMirrorSnapshot } from "./types";

type Rec = Record<string, unknown>;

const isRecord = (value: unknown): value is Rec => typeof value === "object" && value !== null && !Array.isArray(value);
// Control characters never belong in a label; React escapes the rest, so no HTML sanitising is needed.
const CONTROL = /[\u0000-\u001f\u007f]/;

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max && !CONTROL.test(trimmed) ? trimmed : null;
}

function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === undefined || value === null) return null;
  return text(value, max) ?? undefined; // undefined = present but invalid
}

// "R$ 109,90", "R$ 1.099,00" — a price label as INK prints it. Never parsed into a number here.
const PRICE_TEXT = /^R\$[\s ]?\d{1,3}(?:\.\d{3})*,\d{2}$/;
function priceText(value: unknown): string | null {
  const t = text(value, 24);
  return t && PRICE_TEXT.test(t) ? t : null;
}

function nonNegativeInt(value: unknown, max: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max ? value : null;
}

/** Only https on INK's image CDN under /images/product_art/. A bad image degrades to "no photo", never to a rejected cart. */
export function safeImage(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 512) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== INK_IMAGE_HOST || url.port !== "" || url.username || url.password) return null;
    if (!url.pathname.startsWith(INK_IMAGE_PATH_PREFIX) || url.search || url.hash) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function parseItem(raw: unknown): CartMirrorItem | null {
  if (!isRecord(raw)) return null;
  const productId = text(raw.productId, 32);
  const name = text(raw.name, 160);
  const linePriceText = priceText(raw.linePriceText);
  const quantity = nonNegativeInt(raw.quantity, 999);
  const color = optionalText(raw.color, 60);
  const size = optionalText(raw.size, 30);
  const listRaw = raw.listPriceText;
  const listPriceText = listRaw === undefined || listRaw === null ? null : priceText(listRaw);
  if (!productId || !name || !linePriceText || quantity === null || quantity < 1) return null;
  if (color === undefined || size === undefined) return null;
  if (listRaw !== undefined && listRaw !== null && listPriceText === null) return null;
  return { productId, name, color, size, quantity, linePriceText, listPriceText, image: safeImage(raw.image) };
}

/**
 * Strict validation of the Worker's snapshot v1. Returns a fresh object containing only whitelisted, typed fields (unknown
 * fields are dropped, never forwarded), or `null` when anything required is missing or malformed.
 */
export function parseSnapshot(raw: unknown): CartMirrorSnapshot | null {
  if (!isRecord(raw) || raw.v !== 1) return null;
  const count = nonNegativeInt(raw.count, MAX_ITEMS * 999);
  const ageSeconds = nonNegativeInt(raw.ageSeconds, 86_400);
  const expiresInSeconds = nonNegativeInt(raw.expiresInSeconds, 86_400);
  if (count === null || ageSeconds === null || expiresInSeconds === null) return null;
  if (!Array.isArray(raw.items) || raw.items.length > MAX_ITEMS) return null;

  const items: CartMirrorItem[] = [];
  for (const entry of raw.items) {
    const item = parseItem(entry);
    if (!item) return null;
    items.push(item);
  }
  if (items.length === 0 && count !== 0) return null; // "empty" must be explicit, never inferred from a broken list
  if (items.length > 0 && count === 0) return null;

  let totalText: string | null = null;
  if (raw.totalText !== undefined && raw.totalText !== null) {
    totalText = priceText(raw.totalText);
    if (totalText === null) return null;
  }
  return { v: 1, count, items, totalText, ageSeconds, expiresInSeconds };
}

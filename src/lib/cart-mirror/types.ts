/** What /api/cart-mirror returns: the validated, whitelisted subset of the Worker's snapshot v1. Nothing is computed here. */
export type CartMirrorItem = {
  productId: string;
  name: string;
  color: string | null;
  size: string | null;
  quantity: number;
  /** Effective line price exactly as INK displays it (already multiplied and discounted). */
  linePriceText: string;
  /** Struck-through list price, only when INK shows one. */
  listPriceText: string | null;
  image: string | null;
};

export type CartMirrorSnapshot = {
  v: 1;
  count: number;
  items: CartMirrorItem[];
  /** Total exactly as INK displays it, when the Worker could read it. */
  totalText: string | null;
  ageSeconds: number;
  expiresInSeconds: number;
};

/**
 * The states of a product made by the direct purchase and what the waiting page sees of it. Plain module (no Node imports): the browser needs it too.
 * The rest of the model (the job row, the INK body) is in ink-products.ts.
 */
export const PRODUCT_STATUSES = ["queued", "creating", "photos", "ready", "failed", "check"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
/** No more work on these: ready (link known), failed (nothing created; can be queued again) or check (INK may have created it: a person looks). */
export const isTerminal = (s: ProductStatus): boolean => s === "ready" || s === "failed" || s === "check";

import { INK_IMAGE_HOST } from "../cart-mirror/constants";
import type { CommerceStoreKey } from "../geo/regions";

/**
 * What the waiting screen shows of a job: never the internal error. Once ready, the INK product id and the store that sells it too (the same
 * product goes into "Minhas Estampas", which keys a saved estampa by them).
 */
export type PublicProductJob = { id: string; label: string; status: ProductStatus; url: string | null; image: string | null; inkProductId: string | null; store: CommerceStoreKey | null };

/** Where a personalized shirt's photo is shown with `next/image` ("Minhas Estampas"), only INK's CDN is allowed; anything else is the plain shirt. */
export const PERSONALIZED_PLACEHOLDER = "/personalizacao/camisetas/preta.webp";
export function inkPhotoOrPlaceholder(raw: string | null | undefined): string {
  try {
    const url = new URL(raw ?? "");
    return url.protocol === "https:" && url.hostname === INK_IMAGE_HOST && !url.port && !url.username ? url.toString() : PERSONALIZED_PLACEHOLDER;
  } catch {
    return PERSONALIZED_PLACEHOLDER;
  }
}

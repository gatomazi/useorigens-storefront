/**
 * The states of a product made by the direct purchase and what the waiting page sees of it. Plain module (no Node imports): the browser needs it too.
 * The rest of the model (the job row, the INK body) is in ink-products.ts.
 */
export const PRODUCT_STATUSES = ["queued", "creating", "photos", "ready", "failed", "check"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
/** No more work on these: ready (link known), failed (nothing created; can be queued again) or check (INK may have created it: a person looks). */
export const isTerminal = (s: ProductStatus): boolean => s === "ready" || s === "failed" || s === "check";

/** What the waiting screen shows of a job: never the internal error or the store's ids. */
export type PublicProductJob = { id: string; label: string; status: ProductStatus; url: string | null; image: string | null };

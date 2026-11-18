import type { InkReview } from "./parse";

/**
 * INK shows no review id, so a review is told apart by who, when, the start of what was written and its first photo. Pure and free of the parser's
 * code (no `Buffer`), so the browser can use it too: the full list in the modal asks page after page and drops a review that shifted onto the next page.
 */
export const reviewKey = (r: Pick<InkReview, "author" | "date" | "text" | "photos">): string => `${`${r.author}|${r.date}|${r.text.slice(0, 80)}`.toLowerCase()}|${r.photos[0]?.thumb ?? ""}`;

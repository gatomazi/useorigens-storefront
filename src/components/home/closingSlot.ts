/**
 * Where a block that is NOT a section of the home's document goes (the reviews: they come from INK's public page, not from the panel): just before the
 * closing campaign, which is the last section of the seed and of the original home ("… → DDD → Avaliações → Campanha"); at the very end when the last
 * section is something else (a home edited in the panel), never in the middle of the sections someone ordered.
 */
export function closingSlot(sections: readonly { template: string }[]): number {
  const last = sections.length - 1;
  return last >= 0 && sections[last].template === "campaign" ? last : sections.length;
}

export const insertAt = <T>(items: readonly T[], index: number, item: T): T[] => [...items.slice(0, index), item, ...items.slice(index)];

/** Whether the document has a "reviews" section at all, on or off: then the panel decides where (and whether) the reviews show, and the fallback stays out. */
export const reviewsAreInTheDocument = (sections: readonly { template: string }[] | undefined): boolean => (sections ?? []).some((s) => s.template === "reviews");

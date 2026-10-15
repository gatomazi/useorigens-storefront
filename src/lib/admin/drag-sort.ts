/**
 * The arithmetic of drag-to-reorder (`components/admin/useDragSort.ts`), kept pure so it can be tested without a browser.
 */

/** `ids` with the item at `from` moved to `to` (a new array; the same one when nothing moves). */
export function moveItem<T>(ids: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return [...ids];
  const next = [...ids];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Where the dragged row belongs now. `mids[i]` is the vertical middle of row i where the layout puts it (transforms ignored), in the
 * current order; the dragged row is at `current` and is drawn from `top` to `bottom`. It passes a row below once its bottom edge crosses
 * that row's middle, and a row above once its top edge does; it never leaves `min`..`max` (rows outside stay fixed, such as a hero).
 */
export function dropIndex(mids: readonly number[], current: number, top: number, bottom: number, min: number, max: number): number {
  let to = current;
  while (to < max && to + 1 < mids.length && bottom > mids[to + 1]) to++;
  if (to !== current) return to;
  while (to > min && top < mids[to - 1]) to--;
  return to;
}

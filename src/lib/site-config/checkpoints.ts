/**
 * "Checkpoints semanais" (an image grid in the `checkpoints` composition): one offer a week, each block opening on its day. Pure rules, shared by
 * the storefront and the tests. Days are YYYY-MM-DD in Brasília time, compared as strings (the format sorts like the calendar).
 */
import type { GridTile } from "./schema";

export type CheckpointState = "open" | "current" | "locked";

/** Today in Brasília time, YYYY-MM-DD (the store's campaigns turn at Brasília midnight, wherever the server runs). */
export function todayInBrasilia(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * Each block's state on `today`: "locked" before its day, open from it on. The open block with the latest day is "current" (the week running now);
 * a block without a day is open from the start and is current only when no dated block has opened yet.
 */
export function checkpointStates(tiles: readonly Pick<GridTile, "opensAt">[], today: string): CheckpointState[] {
  const open = tiles.map((t) => !t.opensAt || t.opensAt <= today);
  let current = -1;
  tiles.forEach((t, i) => {
    if (!open[i]) return;
    if (current < 0 || (t.opensAt ?? "") >= (tiles[current].opensAt ?? "")) current = i;
  });
  return tiles.map((_, i) => (i === current ? "current" : open[i] ? "open" : "locked"));
}

/** "2026-11-16" → "16/11". */
export const dayMonth = (day: string): string => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

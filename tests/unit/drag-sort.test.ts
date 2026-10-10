import { describe, expect, test } from "vitest";
import { dropIndex, moveItem } from "@/lib/admin/drag-sort";

// Five rows 40px tall, stacked from y=0: their middles are 20, 60, 100, 140, 180.
const MIDS = [20, 60, 100, 140, 180];

describe("drag to reorder", () => {
  test("given a list, when an item moves, then the others keep their order and the input is not mutated", () => {
    const ids = ["a", "b", "c", "d"];
    expect(moveItem(ids, 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveItem(ids, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(ids, 1, 1)).toEqual(ids);
    expect(moveItem(ids, 1, 9)).toEqual(ids);
    expect(ids).toEqual(["a", "b", "c", "d"]);
  });

  test("given a row dragged down, when its bottom edge crosses the middle of the next rows, then it passes exactly those", () => {
    // Row 1 (40..80) drawn 15px lower: its bottom (95) has not reached row 2's middle (100).
    expect(dropIndex(MIDS, 1, 55, 95, 0, 4)).toBe(1);
    expect(dropIndex(MIDS, 1, 61, 101, 0, 4)).toBe(2);
    // A fast move passes several rows in one step.
    expect(dropIndex(MIDS, 1, 145, 185, 0, 4)).toBe(4);
  });

  test("given a row dragged up, when its top edge crosses the middle of the rows above, then it passes them", () => {
    expect(dropIndex(MIDS, 3, 101, 141, 0, 4)).toBe(3);
    expect(dropIndex(MIDS, 3, 99, 139, 0, 4)).toBe(2);
    expect(dropIndex(MIDS, 3, -10, 30, 0, 4)).toBe(0);
  });

  test("given fixed rows at both ends, when a row is dragged past them, then it stops before them", () => {
    expect(dropIndex(MIDS, 2, -50, -10, 1, 3)).toBe(1);
    expect(dropIndex(MIDS, 2, 300, 340, 1, 3)).toBe(3);
  });
});

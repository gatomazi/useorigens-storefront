import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { EMPTY_GARMENT_CHECKPOINT, readGarmentCheckpoint, writeGarmentCheckpoint, type GarmentSyncCheckpoint } from "@/lib/catalog/garment-checkpoint";

describe("garment sync checkpoint (atomic, resumable)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "garment-checkpoint-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const checkpoint = (): GarmentSyncCheckpoint => ({
    version: 1,
    stores: {
      "use-sul": {
        storeKey: "use-sul",
        status: "in_progress",
        mode: "full",
        lastPageCompleted: 12,
        totalPages: 1066,
        sinceCreatedAt: null,
        maxCreatedAtSeen: "2026-09-27T00:00:00Z",
        requestsUsedAllTime: 12,
        updatedAt: "2026-09-27T20:00:00Z",
      },
    },
  });

  test("given no file yet, when read, then it returns the empty checkpoint rather than throwing", async () => {
    const result = await readGarmentCheckpoint(path.join(dir, "missing.json"));
    expect(result).toEqual(EMPTY_GARMENT_CHECKPOINT);
  });

  test("given a written checkpoint, when read back, then every field round-trips exactly", async () => {
    const file = path.join(dir, "checkpoint.json");
    await writeGarmentCheckpoint(checkpoint(), file);
    const result = await readGarmentCheckpoint(file);
    expect(result).toEqual(checkpoint());
  });

  test("given a write, when it completes, then the file is readable in full (no partial/half-written state observable)", async () => {
    const file = path.join(dir, "checkpoint.json");
    await writeGarmentCheckpoint(checkpoint(), file);
    const raw = await readFile(file, "utf8");
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  test("given a corrupt file, when read, then it falls back to empty rather than crashing the caller", async () => {
    const file = path.join(dir, "corrupt.json");
    await writeFile(file, "{not json");
    const result = await readGarmentCheckpoint(file);
    expect(result).toEqual(EMPTY_GARMENT_CHECKPOINT);
  });

  test("given a file with the wrong shape, when read, then it falls back to empty", async () => {
    const file = path.join(dir, "wrong-shape.json");
    await writeFile(file, JSON.stringify({ version: 2, stores: {} }));
    const result = await readGarmentCheckpoint(file);
    expect(result).toEqual(EMPTY_GARMENT_CHECKPOINT);
  });

  test("given a path whose parent is a file, not a directory, when written, then it throws a clear error naming the path", async () => {
    const blocker = path.join(dir, "blocker");
    await writeFile(blocker, "x");
    const badFile = path.join(blocker, "checkpoint.json");
    await expect(writeGarmentCheckpoint(checkpoint(), badFile)).rejects.toThrow(/could not write garment sync checkpoint/);
  });
});

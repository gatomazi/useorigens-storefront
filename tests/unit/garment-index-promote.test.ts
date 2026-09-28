import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { GarmentIndexPromotionError, promoteGarmentIndex, validateGarmentIndexText } from "@/lib/catalog/garment-index-promote";

const tuple = (i: number) => [72, String(1000 + i), `slug-${i}`, `images/${i}.jpg`, 139.9];
const indexWith = (stores: Record<string, unknown>) => JSON.stringify({ version: 1, stores });
const sulStore = (clusters: number, perCluster = 3) => ({
  syncedAt: "2026-09-28T00:00:00.000Z",
  clusters: Object.fromEntries(Array.from({ length: clusters }, (_, c) => [String(c + 1), Array.from({ length: perCluster }, (_, p) => tuple(c * 10 + p))])),
});
const GOOD = indexWith({ "use-sul": sulStore(400) }); // 1,200 pieces
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

describe("validateGarmentIndexText", () => {
  test("given a well-formed Sul-only index, when validated for Sul, then it is accepted with real counts and a checksum", () => {
    const verdict = validateGarmentIndexText(GOOD, { expectStores: ["use-sul"] });
    expect(verdict).toMatchObject({ ok: true, stores: { "use-sul": { clusters: 400, pieces: 1200 } }, sha256: sha(GOOD) });
  });

  test("given invalid JSON, a wrong version or no stores object, when validated, then each is rejected", () => {
    expect(validateGarmentIndexText("{ nope", { expectStores: ["use-sul"] })).toEqual({ ok: false, errors: ["not valid JSON"] });
    expect(validateGarmentIndexText(JSON.stringify({ version: 2, stores: {} }), { expectStores: ["use-sul"] })).toEqual({ ok: false, errors: ["version must be 1"] });
    expect(validateGarmentIndexText(JSON.stringify({ version: 1 }), { expectStores: ["use-sul"] })).toEqual({ ok: false, errors: ["stores must be an object"] });
  });

  test("given a missing expected store, an unexpected store or an unknown store, when validated, then all are reported", () => {
    const missing = validateGarmentIndexText(indexWith({ "use-norte": sulStore(400) }), { expectStores: ["use-sul"] });
    expect(missing).toMatchObject({ ok: false, errors: expect.arrayContaining(['unexpected store "use-norte" (expected: use-sul)', 'expected store "use-sul" is missing or empty']) });
    expect(validateGarmentIndexText(indexWith({ "use-sul": sulStore(400), "use-norte": sulStore(10) }), { expectStores: ["use-sul"], allowExtraStores: true })).toMatchObject({ ok: true });
    expect(validateGarmentIndexText(indexWith({ "use-sul": sulStore(400), "use-mars": sulStore(1) }), { expectStores: ["use-sul"] })).toMatchObject({ ok: false, errors: ['unknown store "use-mars"'] });
  });

  test("given malformed pieces, when validated, then they are counted and the file is rejected", () => {
    const store = sulStore(400) as { clusters: Record<string, unknown[]> };
    store.clusters["1"] = [[72, "1", "slug", "img", "not-a-price"], "junk"];
    expect(validateGarmentIndexText(indexWith({ "use-sul": store }), { expectStores: ["use-sul"] })).toMatchObject({ ok: false, errors: ['store "use-sul" has 2 malformed pieces'] });
  });

  test("given a suspiciously small index, when validated, then the plausibility floor rejects it", () => {
    expect(validateGarmentIndexText(indexWith({ "use-sul": sulStore(2) }), { expectStores: ["use-sul"] })).toMatchObject({ ok: false, errors: [expect.stringContaining("plausibility floor")] });
  });
});

describe("promoteGarmentIndex", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "garment-promote-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  const live = () => path.join(dir, "garment-index.json");
  const incoming = () => path.join(dir, "garment-index.incoming.json");

  test("given no previous index, when a valid candidate is promoted, then it becomes the live file and the candidate is gone", async () => {
    await writeFile(incoming(), GOOD);
    const result = await promoteGarmentIndex(incoming(), { expectStores: ["use-sul"], target: live() });
    expect(result.previous).toBeNull();
    expect(await readFile(live(), "utf8")).toBe(GOOD);
    expect(await readdir(dir)).toEqual(["garment-index.json"]);
  });

  test("given a live index, when a new candidate is promoted, then the old one is kept as .prev and the new one is live", async () => {
    const OLD = indexWith({ "use-sul": sulStore(500) });
    await writeFile(live(), OLD);
    await writeFile(incoming(), GOOD);
    const result = await promoteGarmentIndex(incoming(), { expectStores: ["use-sul"], target: live() });
    expect(result.previous).toBe(`${live()}.prev`);
    expect(await readFile(`${live()}.prev`, "utf8")).toBe(OLD);
    expect(await readFile(live(), "utf8")).toBe(GOOD);
  });

  test("given an invalid candidate, when promotion is attempted, then it throws and the live index is byte-identical", async () => {
    await writeFile(live(), GOOD);
    await writeFile(incoming(), "{ corrupted");
    const before = sha(await readFile(live(), "utf8"));
    await expect(promoteGarmentIndex(incoming(), { expectStores: ["use-sul"], target: live() })).rejects.toBeInstanceOf(GarmentIndexPromotionError);
    expect(sha(await readFile(live(), "utf8"))).toBe(before);
    expect(await readdir(dir)).not.toContain("garment-index.json.prev");
  });

  test("given a candidate in another directory, when promotion is attempted, then it is refused because the rename would not be atomic", async () => {
    const other = path.join(dir, "elsewhere");
    await mkdir(other);
    await writeFile(path.join(other, "candidate.json"), GOOD);
    await expect(promoteGarmentIndex(path.join(other, "candidate.json"), { expectStores: ["use-sul"], target: live() })).rejects.toThrow(/same directory/);
  });

  test("given a candidate that does not exist, when promotion is attempted, then it throws without creating anything", async () => {
    await expect(promoteGarmentIndex(incoming(), { expectStores: ["use-sul"], target: live() })).rejects.toThrow(/cannot read/);
    expect(await readdir(dir)).toEqual([]);
  });
});

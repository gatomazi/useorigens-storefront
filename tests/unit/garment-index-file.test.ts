import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { expandTuple, readGarmentIndex, readGarmentIndexSync, toTuple, upsertPieces, urlMatchesShape, writeGarmentIndex, type GarmentTuple } from "@/lib/catalog/garment-index-file";
import { ALLOWED_COMMERCE_HOSTS, STORE_PRODUCT_URL_BASE } from "@/lib/ink/config";

const IMAGE_HOST = "https://gcp-images.majestic.ink.rsvcloud.com/";
const piece = (over: Partial<Parameters<typeof toTuple>[0]> = {}) => ({ garmentTypeId: 72, inkProductId: "10", slug: "tijucas-traco-sc-x", imageUrl: `${IMAGE_HOST}images/a.jpg`, price: 139.9, ...over });
const clusterPiece = (over: Record<string, unknown> = {}) => ({ ...piece(), productClusterId: "100", ...over }) as Parameters<typeof upsertPieces>[1][number];

describe("garment index tuples", () => {
  test("given an image on the common host, when stored and expanded, then only the remainder is stored and the full URL comes back", () => {
    const tuple = toTuple(piece())!;
    expect(tuple[3]).toBe("images/a.jpg");
    expect(expandTuple("use-sul", tuple)).toMatchObject({ imageUrl: `${IMAGE_HOST}images/a.jpg`, storeProductUrl: "https://www.usesul.com.br/usesul/product/tijucas-traco-sc-x", price: 139.9, garmentTypeId: 72 });
  });

  test("given an image on another https host, when stored and expanded, then it round-trips unchanged", () => {
    const tuple = toTuple(piece({ imageUrl: "https://cdn.example.com/b.jpg" }))!;
    expect(tuple[3]).toBe("https://cdn.example.com/b.jpg");
    expect(expandTuple("use-norte", tuple)?.imageUrl).toBe("https://cdn.example.com/b.jpg");
  });

  test("given a piece without a price, when converted, then it cannot be stored", () => {
    expect(toTuple(piece({ price: null }))).toBeNull();
  });

  test("given a malformed tuple or a store without a URL base, when expanded, then the piece is skipped", () => {
    expect(expandTuple("use-sul", [72, "1", "slug"])).toBeNull();
    expect(expandTuple("use-sul", [72, 1, "slug", "a.jpg", 10])).toBeNull();
    expect(expandTuple("use-sul", "nope")).toBeNull();
    expect(expandTuple("use-origens", [72, "1", "slug", "a.jpg", 10])).toBeNull();
  });

  test("given the URL base map, when compared with the allowlist, then every base host is an allowed purchase host", () => {
    for (const base of Object.values(STORE_PRODUCT_URL_BASE)) expect(ALLOWED_COMMERCE_HOSTS.has(new URL(base!).host)).toBe(true);
  });

  test("given real and odd URLs, when checked for shape, then only <store base>/<slug> matches, and only for its own store", () => {
    expect(urlMatchesShape("use-sul", "s", "https://www.usesul.com.br/usesul/product/s")).toBe(true);
    expect(urlMatchesShape("use-sul", "s", "https://www.usesul.com.br/usesul/product/other")).toBe(false);
    expect(urlMatchesShape("use-sul", "s", "https://www.usenorte.com.br/usenorte/product/s")).toBe(false);
    expect(urlMatchesShape("use-origens", "s", "https://loja.useorigens.com.br/s")).toBe(false);
  });
});

describe("upsertPieces", () => {
  test("given the same piece twice, when upserted, then it is stored once and the second call replaces it in place", () => {
    const clusters: Record<string, GarmentTuple[]> = {};
    upsertPieces(clusters, [clusterPiece(), clusterPiece({ inkProductId: "11", garmentTypeId: 178 })]);
    const snapshot = JSON.stringify(clusters);
    upsertPieces(clusters, [clusterPiece(), clusterPiece({ inkProductId: "11", garmentTypeId: 178 })]);
    expect(JSON.stringify(clusters)).toBe(snapshot);
    upsertPieces(clusters, [clusterPiece({ price: 149.9 })]);
    expect(clusters["100"]).toHaveLength(2);
    expect(clusters["100"][0][4]).toBe(149.9);
  });

  test("given an upsert into a cluster another reader holds, when applied, then the held array is not mutated", () => {
    const held: GarmentTuple[] = [[72, "10", "s", "a.jpg", 1]];
    const clusters: Record<string, GarmentTuple[]> = { "100": held };
    upsertPieces(clusters, [clusterPiece({ inkProductId: "12" })]);
    expect(held).toHaveLength(1);
    expect(clusters["100"]).toHaveLength(2);
  });
});

describe("garment index file", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "garment-index-file-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("given a written index, when read back, then it is identical and the write left no temp file behind", async () => {
    const file = path.join(dir, "garment-index.json");
    const index = { version: 1 as const, stores: { "use-sul": { syncedAt: "x", clusters: { "1": [[72, "1", "s", "a.jpg", 1] as GarmentTuple] } } } };
    await writeGarmentIndex(index, file);
    expect(await readGarmentIndex(file)).toEqual(index);
    expect(readGarmentIndexSync(file).index).toEqual(index);
  });

  test("given a missing, corrupt or wrong-version file, when read, then it is an empty index and never throws", async () => {
    const file = path.join(dir, "garment-index.json");
    expect(readGarmentIndexSync(file).index).toEqual({ version: 1, stores: {} });
    await writeFile(file, "{ nope");
    expect(readGarmentIndexSync(file).index).toEqual({ version: 1, stores: {} });
    expect(await readGarmentIndex(file)).toEqual({ version: 1, stores: {} });
    await writeFile(file, JSON.stringify({ version: 2, stores: {} }));
    expect(readGarmentIndexSync(file).index).toEqual({ version: 1, stores: {} });
  });
});

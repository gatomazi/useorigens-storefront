import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { catalogSnapshotDir } from "../config/env";
import type { CommerceStoreKey } from "../geo/regions";
import { STORE_PRODUCT_URL_BASE } from "../ink/config";
import type { GarmentBinding } from "./types";

/**
 * The garment-piece index lives in its OWN file next to the base snapshot (MD: "índice compacto próprio,
 * referenciado pelo snapshot base") so ~100k hidden-but-sellable pieces never inflate the file every page
 * render depends on. A missing, corrupt or wrong-version file is an EMPTY index, never an error: the
 * storefront must stay ready without the optional piece tabs.
 *
 * Pieces are stored per store and per `product_cluster_id` — the only link the index trusts. Each piece is a
 * tuple `[garmentTypeId, inkProductId, slug, image, price]`; the store URL is rebuilt from the slug and the
 * common image host prefix is stripped.
 */
/** `listPrice` (6th, optional): INK's regular price, only while a promotion is on (`price` is then the promotional one). Files written before it have 5. */
export type GarmentTuple = [garmentTypeId: number, inkProductId: string, slug: string, image: string, price: number, listPrice?: number];

export type GarmentIndexStore = {
  syncedAt: string;
  clusters: Record<string, GarmentTuple[]>;
};

export type GarmentIndex = {
  version: 1;
  stores: Partial<Record<CommerceStoreKey, GarmentIndexStore>>;
};

export function emptyGarmentIndex(): GarmentIndex {
  return { version: 1, stores: {} };
}

const IMAGE_PREFIX = "https://gcp-images.majestic.ink.rsvcloud.com/";

export function garmentIndexPath(): string {
  return path.join(catalogSnapshotDir(), "garment-index.json");
}

function isGarmentIndex(value: unknown): value is GarmentIndex {
  return typeof value === "object" && value !== null && (value as GarmentIndex).version === 1 && typeof (value as GarmentIndex).stores === "object" && (value as GarmentIndex).stores !== null;
}

export function garmentIndexMtimeMs(filePath: string = garmentIndexPath()): number {
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

export function readGarmentIndexSync(filePath: string = garmentIndexPath()): { index: GarmentIndex; mtimeMs: number } {
  try {
    const mtimeMs = statSync(filePath).mtimeMs;
    const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
    return { index: isGarmentIndex(parsed) ? parsed : emptyGarmentIndex(), mtimeMs };
  } catch {
    return { index: emptyGarmentIndex(), mtimeMs: 0 };
  }
}

/** Always a fresh object on failure — callers (the sync) mutate what they read. */
export async function readGarmentIndex(filePath: string = garmentIndexPath()): Promise<GarmentIndex> {
  try {
    const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
    return isGarmentIndex(parsed) ? parsed : emptyGarmentIndex();
  } catch {
    return emptyGarmentIndex();
  }
}

export class GarmentIndexWriteError extends Error {
  constructor(
    message: string,
    readonly cause: unknown,
  ) {
    super(message);
    this.name = "GarmentIndexWriteError";
  }
}

/** Atomic write (temp file + rename), same pattern as `snapshot-file.ts#writeSnapshot`. */
export async function writeGarmentIndex(index: GarmentIndex, filePath: string = garmentIndexPath()): Promise<void> {
  const dir = path.dirname(filePath);
  try {
    await mkdir(dir, { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(index));
    await rename(tmp, filePath);
  } catch (err) {
    throw new GarmentIndexWriteError(`could not write garment index to ${filePath}`, err);
  }
}

/** True only when the real INK URL is exactly `<store base>/<slug>` — the shape `expandTuple` rebuilds. */
export function urlMatchesShape(storeKey: CommerceStoreKey, slug: string, storeProductUrl: string): boolean {
  const base = STORE_PRODUCT_URL_BASE[storeKey];
  return base !== undefined && storeProductUrl === `${base}/${slug}`;
}

/** Null when the piece cannot be stored compactly (no price). The caller has already checked the URL shape. */
export function toTuple(piece: Pick<GarmentBinding, "garmentTypeId" | "inkProductId" | "slug" | "imageUrl" | "price" | "listPrice">): GarmentTuple | null {
  if (piece.price === null) return null;
  const image = piece.imageUrl.startsWith(IMAGE_PREFIX) ? piece.imageUrl.slice(IMAGE_PREFIX.length) : piece.imageUrl;
  return piece.listPrice !== undefined ? [piece.garmentTypeId, piece.inkProductId, piece.slug, image, piece.price, piece.listPrice] : [piece.garmentTypeId, piece.inkProductId, piece.slug, image, piece.price];
}

export type ExpandedPiece = {
  garmentTypeId: number;
  inkProductId: string;
  slug: string;
  storeProductUrl: string;
  imageUrl: string;
  price: number;
  /** Only while a promotion is on. */
  listPrice?: number;
};

/** Null (piece skipped) for anything malformed or for a store without a known URL base — fail closed. */
export function expandTuple(storeKey: CommerceStoreKey, tuple: unknown): ExpandedPiece | null {
  const base = STORE_PRODUCT_URL_BASE[storeKey];
  if (!base || !Array.isArray(tuple) || tuple.length < 5) return null;
  const [garmentTypeId, inkProductId, slug, image, price, listPrice] = tuple as unknown[];
  if (typeof garmentTypeId !== "number" || typeof inkProductId !== "string" || typeof slug !== "string" || typeof image !== "string" || typeof price !== "number") return null;
  if (!slug || !image) return null;
  return {
    garmentTypeId,
    inkProductId,
    slug,
    storeProductUrl: `${base}/${slug}`,
    imageUrl: image.startsWith("https://") ? image : `${IMAGE_PREFIX}${image}`,
    price,
    // A regular price only counts above the price charged (anything else is no promotion).
    ...(typeof listPrice === "number" && listPrice > price ? { listPrice } : {}),
  };
}

/**
 * Upserts pieces into one store's clusters (mutates `clusters`): a piece already present (same INK id) is
 * replaced in place, a new one is appended — so running the same input twice yields the same index.
 */
export function upsertPieces(clusters: Record<string, GarmentTuple[]>, pieces: readonly Pick<GarmentBinding, "productClusterId" | "garmentTypeId" | "inkProductId" | "slug" | "imageUrl" | "price" | "listPrice">[]): number {
  let written = 0;
  const touched = new Set<string>();
  for (const piece of pieces) {
    const tuple = toTuple(piece);
    if (!tuple) continue;
    if (!touched.has(piece.productClusterId)) {
      // copy-on-write: never mutate an array another reader may still hold
      clusters[piece.productClusterId] = [...(clusters[piece.productClusterId] ?? [])];
      touched.add(piece.productClusterId);
    }
    const list = clusters[piece.productClusterId];
    const at = list.findIndex((existing) => existing[1] === piece.inkProductId);
    if (at >= 0) list[at] = tuple;
    else list.push(tuple);
    written++;
  }
  return written;
}

export function countPieces(store: GarmentIndexStore | undefined): number {
  let n = 0;
  for (const tuples of Object.values(store?.clusters ?? {})) n += tuples.length;
  return n;
}

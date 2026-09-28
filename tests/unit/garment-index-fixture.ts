import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { GarmentIndex, GarmentTuple } from "@/lib/catalog/garment-index-file";
import type { CommerceStoreKey } from "@/lib/geo/regions";

export const IMAGE_HOST = "https://gcp-images.majestic.ink.rsvcloud.com/";

/** `{ store: { clusterId: tuples } }` -> the on-disk index shape. */
export function indexOf(stores: Partial<Record<CommerceStoreKey, Record<string, GarmentTuple[]>>>): GarmentIndex {
  const out: GarmentIndex = { version: 1, stores: {} };
  for (const [key, clusters] of Object.entries(stores) as [CommerceStoreKey, Record<string, GarmentTuple[]>][]) {
    out.stores[key] = { syncedAt: "2026-09-27T00:00:00.000Z", clusters };
  }
  return out;
}

export async function writeIndexFile(dir: string, index: GarmentIndex): Promise<void> {
  await writeFile(path.join(dir, "garment-index.json"), JSON.stringify(index));
}

export const tuple = (garmentTypeId: number, inkProductId: string, slug: string, price: number, image = `${slug}.jpg`): GarmentTuple => [garmentTypeId, inkProductId, slug, image, price];

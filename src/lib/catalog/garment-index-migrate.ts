import "server-only";
import type { CommerceStoreKey } from "../geo/regions";
import { emptyGarmentIndex, upsertPieces, urlMatchesShape, type GarmentIndex, type GarmentTuple } from "./garment-index-file";
import { CLASSIC_GARMENT_TYPE_ID, garmentTypeById } from "./garments";
import { isSellableUrl } from "./garments-link";
import type { CatalogSnapshot, GarmentBinding, StoreIndex } from "./types";

/** A snapshot written before the compact index existed: pieces were embedded per store. */
export type LegacySnapshot = {
  version: 1;
  stores: Partial<Record<CommerceStoreKey, StoreIndex & { garmentBindings?: GarmentBinding[] }>>;
};

export type MigrationStoreReport = {
  read: number;
  written: number;
  excluded: { noCluster: number; unknownType: number; noPrice: number; unsellableUrl: number; urlShape: number };
  /** Same INK product id seen twice for a cluster: the later copy replaces the earlier one. */
  duplicates: number;
};

export type MigrationResult = {
  index: GarmentIndex;
  /** The snapshot without any embedded `garmentBindings`. */
  snapshot: CatalogSnapshot;
  report: Partial<Record<CommerceStoreKey, MigrationStoreReport>>;
};

/**
 * Moves embedded `garmentBindings` into the compact index, applying the same admission rules the sync uses
 * (known non-classic type, price, allowed host, `<store base>/<slug>` URL shape). Pure: no I/O. Anything that
 * fails a rule is excluded and counted, never repaired. `existing` is upserted onto, so running it twice is
 * harmless.
 */
export function migrateGarmentBindings(legacy: LegacySnapshot, existing: GarmentIndex = emptyGarmentIndex()): MigrationResult {
  const index: GarmentIndex = { version: 1, stores: { ...existing.stores } };
  const snapshot: CatalogSnapshot = { version: 1, stores: {} };
  const report: MigrationResult["report"] = {};

  for (const [key, store] of Object.entries(legacy.stores) as [CommerceStoreKey, LegacySnapshot["stores"][CommerceStoreKey]][]) {
    if (!store) continue;
    const { garmentBindings, ...rest } = store;
    snapshot.stores[key] = rest;
    if (!garmentBindings) continue;

    const stats: MigrationStoreReport = { read: garmentBindings.length, written: 0, excluded: { noCluster: 0, unknownType: 0, noPrice: 0, unsellableUrl: 0, urlShape: 0 }, duplicates: 0 };
    const admitted: GarmentBinding[] = [];
    let newest = "";
    for (const piece of garmentBindings) {
      if (!piece.productClusterId) stats.excluded.noCluster++;
      else if (piece.garmentTypeId === CLASSIC_GARMENT_TYPE_ID || !garmentTypeById(piece.garmentTypeId)) stats.excluded.unknownType++;
      else if (piece.price === null) stats.excluded.noPrice++;
      else if (!isSellableUrl(piece.storeProductUrl)) stats.excluded.unsellableUrl++;
      else if (!urlMatchesShape(key, piece.slug, piece.storeProductUrl)) stats.excluded.urlShape++;
      else {
        admitted.push(piece);
        if (piece.syncedAt > newest) newest = piece.syncedAt;
      }
    }

    const clusters: Record<string, GarmentTuple[]> = { ...(index.stores[key]?.clusters ?? {}) };
    const seen = new Set<string>();
    for (const piece of admitted) {
      const id = `${piece.productClusterId}:${piece.inkProductId}`;
      if (seen.has(id)) stats.duplicates++;
      seen.add(id);
    }
    stats.written = upsertPieces(clusters, admitted) - stats.duplicates;
    index.stores[key] = { syncedAt: newest || store.syncedAt, clusters };
    report[key] = stats;
  }
  return { index, snapshot, report };
}

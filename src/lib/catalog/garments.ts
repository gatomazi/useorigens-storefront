import { ALLOWED_COMMERCE_HOSTS } from "../ink/config";
import type { GarmentSourceProduct } from "../ink/normalize";
import type { CityDesignBinding, GarmentBinding } from "./types";

/**
 * INK's own `product_type.id` is global and stable across the three stores (confirmed live against Sul,
 * Norte and Centro-Oeste — the same ids and names came back everywhere: docs/storefront/city-garment-tabs-round.md).
 * `1` ("Camiseta") is the classic piece already represented by a family's `primary` binding — it is kept here
 * only so the central map has one authoritative place per id, never used to produce a second, redundant
 * `GarmentBinding` for the classic piece.
 *
 * This list holds ONLY garment types confirmed to exist in the real catalog during this round's audit. Do
 * not add a type here on a guess (the MD's own examples, e.g. "baby look", were never observed and are
 * deliberately absent) — an unrecognized `product_type.id` seen by the linker is excluded, never labeled.
 */
export const GARMENT_TYPES: ReadonlyArray<{ id: number; slug: string; label: string; sortOrder: number }> = [
  { id: 1, slug: "classica", label: "Camiseta clássica", sortOrder: 0 },
  { id: 72, slug: "peruano", label: "Algodão Peruano", sortOrder: 1 },
  { id: 178, slug: "oversized", label: "Oversized", sortOrder: 2 },
  { id: 8, slug: "regata", label: "Regata", sortOrder: 3 },
  { id: 23, slug: "cropped", label: "Cropped", sortOrder: 4 },
  { id: 28, slug: "cropped-moletom", label: "Cropped Moletom", sortOrder: 5 },
  { id: 119, slug: "moletom-capuz", label: "Moletom (capuz)", sortOrder: 6 },
  { id: 120, slug: "moletom-careca", label: "Moletom (careca)", sortOrder: 7 },
  { id: 2, slug: "infantil", label: "Infantil", sortOrder: 8 },
  { id: 165, slug: "body-infantil", label: "Body Infantil", sortOrder: 9 },
];

export const CLASSIC_GARMENT_TYPE_ID = 1;

const byId = new Map(GARMENT_TYPES.map((g) => [g.id, g]));
const bySlug = new Map(GARMENT_TYPES.map((g) => [g.slug, g]));

export function garmentTypeById(id: number) {
  return byId.get(id);
}

export function garmentTypeBySlug(slug: string) {
  return bySlug.get(slug);
}

/** Same https + allowed-host rule as `commerce.ts`'s `purchaseUrl` — duplicated here (not imported) only
 * because it runs against a raw `GarmentSourceProduct`, not a `CityDesignBinding`/`MerchProduct`. */
function isSellableUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" && ALLOWED_COMMERCE_HOSTS.has(url.host);
  } catch {
    return false;
  }
}

/**
 * Links garment-type siblings to their already-trusted classic bindings, purely by `product_cluster_id`
 * (INK's own foreign key) — never by city/family name text, never by id proximity (confirmed live: sibling
 * batches are NOT always created with contiguous ids, e.g. Água Boa/MT). Fail closed at every step:
 *
 * - A canonical binding with no `productClusterId` contributes no garment tabs (nothing to match against).
 * - A raw candidate with no `clusterId`, an unrecognized `garmentTypeId`, the classic type id itself, or a
 *   cluster id that doesn't match any known canonical binding IN THE SAME STORE is silently dropped, not
 *   guessed into a nearby city.
 * - A candidate whose image/price/url can't be verified as sellable is dropped rather than shown as a broken
 *   card or dead link (MD §1: "não exibir cards falsos, preços errados ou links 404").
 *
 * Pure and synchronous — no I/O — so it is fully unit-testable against hand-built fixtures.
 */
export function buildGarmentBindings(
  rawCandidates: readonly GarmentSourceProduct[],
  canonicalBindings: readonly CityDesignBinding[],
  syncedAt: string,
): GarmentBinding[] {
  const canonicalByCluster = new Map<string, CityDesignBinding>();
  for (const binding of canonicalBindings) {
    if (!binding.productClusterId) continue;
    const key = `${binding.commerceStoreKey}:${binding.productClusterId}`;
    // Two canonical bindings should never legitimately share one cluster id; if data ever disagrees, keep
    // the first deterministically-ranked one already in the list rather than silently overwriting it.
    if (!canonicalByCluster.has(key)) canonicalByCluster.set(key, binding);
  }

  const out: GarmentBinding[] = [];
  for (const raw of rawCandidates) {
    if (!raw.clusterId || raw.garmentTypeId === null) continue;
    if (raw.garmentTypeId === CLASSIC_GARMENT_TYPE_ID) continue; // the classic piece is the canonical binding itself
    if (!garmentTypeById(raw.garmentTypeId)) continue; // unrecognized product_type: exclude, never guess a label

    const canonical = canonicalByCluster.get(`${raw.storeKey}:${raw.clusterId}`);
    if (!canonical) continue;
    if (raw.price === null || !isSellableUrl(raw.storeProductUrl)) continue;

    out.push({
      cityId: canonical.cityId,
      designFamily: canonical.designFamily,
      garmentTypeId: raw.garmentTypeId,
      commerceStoreKey: raw.storeKey,
      inkProductId: raw.id,
      slug: raw.slug,
      storeProductUrl: raw.storeProductUrl,
      imageUrl: raw.imageUrl,
      price: raw.price,
      productClusterId: raw.clusterId,
      syncedAt,
    });
  }
  return out;
}

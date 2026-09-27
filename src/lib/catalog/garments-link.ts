import "server-only";
import { ALLOWED_COMMERCE_HOSTS } from "../ink/config";
import type { GarmentSourceProduct } from "../ink/normalize";
import { CLASSIC_GARMENT_TYPE_ID, garmentTypeById } from "./garments";
import type { CityDesignBinding, GarmentBinding } from "./types";

/** Only the fields the linker needs — accepts both a ranked `CityDesignBinding` and the pre-rank `UnrankedBinding`. */
type CanonicalBindingLike = Pick<CityDesignBinding, "cityId" | "designFamily" | "commerceStoreKey" | "productClusterId">;

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
 * Pure and synchronous — no I/O — so it is fully unit-testable against hand-built fixtures. Deliberately kept
 * in its own `server-only` file, separate from `garments.ts`'s client-safe constants — see that file's header.
 */
export function buildGarmentBindings(
  rawCandidates: readonly GarmentSourceProduct[],
  canonicalBindings: readonly CanonicalBindingLike[],
  syncedAt: string,
): GarmentBinding[] {
  const canonicalByCluster = new Map<string, CanonicalBindingLike>();
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

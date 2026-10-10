import "server-only";
import { ALLOWED_COMMERCE_HOSTS } from "../ink/config";
import type { GarmentSourceProduct } from "../ink/normalize";
import { CLASSIC_GARMENT_TYPE_ID, garmentTypeById } from "./garments";
import { urlMatchesShape } from "./garment-index-file";
import type { CityDesignBinding, GarmentBinding } from "./types";

/** Only the fields the linker needs — accepts both a ranked `CityDesignBinding` and the pre-rank `UnrankedBinding`. */
type CanonicalBindingLike = Pick<CityDesignBinding, "cityId" | "designFamily" | "commerceStoreKey" | "productClusterId">;

/** Same https + allowed-host rule as `commerce.ts`'s `purchaseUrl` — duplicated here (not imported) only
 * because it runs against a raw `GarmentSourceProduct`, not a `CityDesignBinding`/`MerchProduct`. */
export function isSellableUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" && ALLOWED_COMMERCE_HOSTS.has(url.host);
  } catch {
    return false;
  }
}

/** Why candidate products did or did not become a garment binding, for the rollout coverage report. */
export type GarmentLinkStats = {
  candidates: number;
  linked: number;
  /** Legitimately skipped: the classic piece is already the canonical binding. */
  classicType: number;
  noClusterId: number;
  unknownType: number;
  /** Cluster matches no canonical binding of the same store (drafts of cities the store does not sell, etc.). */
  noCanonicalForCluster: number;
  noPrice: number;
  unsellableUrl: number;
  /** Allowed host, but the URL is not `<store base>/<slug>`: the compact index cannot store it faithfully. */
  urlShape: number;
};

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
export function linkGarmentBindings(
  rawCandidates: readonly GarmentSourceProduct[],
  canonicalBindings: readonly CanonicalBindingLike[],
  syncedAt: string,
): { bindings: GarmentBinding[]; stats: GarmentLinkStats } {
  const stats: GarmentLinkStats = { candidates: rawCandidates.length, linked: 0, classicType: 0, noClusterId: 0, unknownType: 0, noCanonicalForCluster: 0, noPrice: 0, unsellableUrl: 0, urlShape: 0 };
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
    if (!raw.clusterId || raw.garmentTypeId === null) {
      stats.noClusterId++;
      continue;
    }
    if (raw.garmentTypeId === CLASSIC_GARMENT_TYPE_ID) {
      stats.classicType++; // the classic piece is the canonical binding itself
      continue;
    }
    if (!garmentTypeById(raw.garmentTypeId)) {
      stats.unknownType++; // unrecognized product_type: exclude, never guess a label
      continue;
    }

    const canonical = canonicalByCluster.get(`${raw.storeKey}:${raw.clusterId}`);
    if (!canonical) {
      stats.noCanonicalForCluster++;
      continue;
    }
    if (raw.price === null) {
      stats.noPrice++;
      continue;
    }
    if (!isSellableUrl(raw.storeProductUrl)) {
      stats.unsellableUrl++;
      continue;
    }
    if (!urlMatchesShape(raw.storeKey, raw.slug, raw.storeProductUrl)) {
      stats.urlShape++;
      continue;
    }

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
      ...(raw.listPrice !== undefined ? { listPrice: raw.listPrice } : {}),
      productClusterId: raw.clusterId,
      syncedAt,
    });
    stats.linked++;
  }
  return { bindings: out, stats };
}

export function buildGarmentBindings(
  rawCandidates: readonly GarmentSourceProduct[],
  canonicalBindings: readonly CanonicalBindingLike[],
  syncedAt: string,
): GarmentBinding[] {
  return linkGarmentBindings(rawCandidates, canonicalBindings, syncedAt).bindings;
}

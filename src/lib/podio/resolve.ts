import { localityKeyOf, withLocality } from "../catalog/locality-binding";
import { parseProductName, resolveCity } from "../catalog/parse";
import type { UnrankedBinding } from "../catalog/types";
import { cityById } from "../geo/cities";
import { localityById } from "../geo/localities";
import { REGIONS, type RegionSlug } from "../geo/regions";
import type { PodioOrderItem, ResolvedItem } from "./types";

/**
 * Sold product → UF, locality and design family, using ONLY the mappings the catalog already has. The geography always comes from the
 * design (the product), never from the buyer's address.
 *
 *  1. The product is a city design in the current catalog snapshot of the same store (by INK product id): its binding decides — same
 *     locality key the storefront ranks under (`localityKeyOf`: a DF administrative region is its own locality; a place inside a
 *     municipality, like a beach, counts for the municipality). Size/colour variants share the product, so they land together.
 *  2. Otherwise (a product hidden from the store since, or a hidden garment sibling — INK keeps selling those by direct link) the SAME
 *     deterministic name parser and city resolver the catalog indexer uses (`catalog/parse.ts`) classify the product the order carries.
 *     Nothing approximate: an ambiguous or unknown city is never guessed.
 *
 *  A product whose family is known and whose name states its UF, but whose city cannot be resolved, counts for that UF's families only.
 *  A product without an unambiguous UF does not count anywhere. Nothing is ever split across places.
 */
export function resolveSoldProduct(
  product: PodioOrderItem["product"],
  region: RegionSlug,
  bindingsById: ReadonlyMap<string, UnrankedBinding>,
): ResolvedItem {
  const regionUfs = REGIONS[region].ufs;
  const binding = bindingsById.get(product.id);
  if (binding) {
    const located = withLocality(binding);
    const localityKey = localityKeyOf(located);
    const uf = localityById(localityKey)?.uf ?? cityById(located.cityId)?.uf;
    if (!uf) return { ok: false, reason: "no-unambiguous-uf" };
    if (!regionUfs.includes(uf)) return { ok: false, reason: "outside-region" };
    return { ok: true, uf, localityKey, family: located.designFamily, via: "catalog" };
  }

  const parsed = parseProductName(product.name);
  if (parsed.kind === "other") return { ok: false, reason: "not-a-city-design" };
  if (parsed.kind === "unclassified") return { ok: false, reason: "unclassified-family" };

  const storeKey = REGIONS[region].storeKey;
  const resolution = resolveCity(parsed, { tags: product.tags, storeKey });
  if (resolution.ok) {
    const uf = resolution.city.uf;
    if (!regionUfs.includes(uf)) return { ok: false, reason: "outside-region" };
    return { ok: true, uf, localityKey: resolution.localityId ?? resolution.city.id, family: parsed.family, via: "name" };
  }
  if (resolution.reason === "uf-mismatch") return { ok: false, reason: "outside-region" };
  // City unknown or ambiguous: the family still counts for the UF the name states — never for a UF guessed from the store.
  if (parsed.uf && regionUfs.includes(parsed.uf)) return { ok: true, uf: parsed.uf, localityKey: null, family: parsed.family, via: "name" };
  return { ok: false, reason: "no-unambiguous-uf" };
}

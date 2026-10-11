import { purchaseUrl } from "../catalog/commerce";
import { DESIGN_FAMILIES, familyById, type DesignFamilyId } from "../catalog/families";
import { isSubLocality, localityKeyOf, withLocality } from "../catalog/locality-binding";
import { compareIds, rankBindings } from "../catalog/ranking";
import type { CollectionRecord } from "../catalog/collections";
import type { MerchProduct, UnrankedBinding } from "../catalog/types";
import { cityById } from "../geo/cities";
import { localityById } from "../geo/localities";
import { REGIONS, STATE_NAMES, type CommerceStoreKey, type RegionSlug } from "../geo/regions";
import { normalizeText, slugify } from "../geo/text";
import { STORE_PRODUCT_URL_BASE } from "../ink/config";
import { baseTitleOf, displayTitle, geoOfName, mesoOfName, themesOf, tokensOf } from "./signals";

/**
 * The canonical recommendation unit is a DESIGN (an "estampa"), never a garment piece (MD §5–§7). One document per design, with ONE
 * representative product shown on the card. Pieces of the same design (same INK `product_cluster_id`, or the same visible name twice)
 * collapse into one document; `product_cluster_id` is used ONLY for that collapse, never as an affinity signal.
 */

export type CollectionSignal = { id: number; slug: string; name: string; size: number; featured: boolean };

export type RecommendationDocument = {
  key: string;
  kind: "city" | "editorial";
  store: CommerceStoreKey;
  region: RegionSlug;
  representative: { id: string; title: string; image: string; price: number; slug: string; href: string };
  /** Every INK product id of this design: the representative, its same-name twins and, when known, its hidden garment pieces. */
  memberIds: string[];
  clusterIds: string[];
  /** City products: the place the design is about (an RA counts as its own place); a sub-locality product points at its municipality. */
  locality: { key: string; name: string; uf: string; type: "municipality" | "administrative_region" } | null;
  family: DesignFamilyId | null;
  /** City products: the plain primary of its (locality, family). Variants and sub-locality products are never recommended. */
  primary: boolean;
  uf: string | null;
  meso: string | null;
  /** Editorial INK collections this design belongs to (structural, weak and per-state collections excluded). */
  collections: CollectionSignal[];
  /** The most specific editorial collection (smallest), the strongest affinity signal. */
  mainCollection: CollectionSignal | null;
  line: string | null;
  stateIdentity: boolean;
  baseTitle: string;
  /**
   * Two designs with the same key are "the same idea" and never appear together nor on each other's page (MD §11–§12): same base title
   * ("Bretzel e Chopp | Treino" / "| Treino P&B"), or the same state line of the same state ("MS | Minimal" / "Mato Grosso do Sul | Minimal").
   */
  equivalence: string;
  tokens: string[];
  themes: string[];
  sales: number;
  /** May this design be RECOMMENDED? (Every product may RECEIVE recommendations.) */
  eligible: boolean;
  /** Short facts for observability ("uf:SC(locality)", "collection:fala-daqui"...). Never shown to visitors. */
  editorialSignals: string[];
};

/**
 * Collections that never mean "these designs belong together": newness, kits, partner one-offs and personal orders. Members of
 * `personalizados`/`parceiros` are also never recommended (a shirt made for "Laura" is not a suggestion for anyone else).
 */
const WEAK_COLLECTIONS = new Set(["novidades", "kits", "cidades-mais-pedidas", "personalizados", "parceiros", "mascotes-club"]);
const NEVER_RECOMMEND_COLLECTIONS = new Set(["personalizados", "parceiros"]);

/** A collection whose slug names a state of the store ("pr", "parana", "mato-grosso-do-sul") is geography, not editorial. */
function stateOfCollection(slug: string, ufs: readonly string[]): string | null {
  for (const uf of ufs) if (slug === uf.toLowerCase() || slug === slugify(STATE_NAMES[uf] ?? "")) return uf;
  return null;
}

export type StoreInput = {
  store: CommerceStoreKey;
  bindings: readonly UnrankedBinding[];
  merch: readonly MerchProduct[];
  collections: readonly CollectionRecord[];
  /** INK collection ids referenced by the PUBLISHED CMS (navbar groups, hotpage/category sections). Drafts never reach here. */
  featuredCollectionIds?: ReadonlySet<number>;
  /** Optional garment-piece index of this store: cluster id → piece ids (hidden Oversized/Peruano/Infantil...). */
  garmentClusters?: Readonly<Record<string, readonly string[]>>;
};

export type Discard = { productId: string; reason: "invalid-image" | "invalid-price" | "invalid-url" | "unknown-place" };

export type BuiltDocuments = {
  documents: RecommendationDocument[];
  /** INK product id → document key, for every product that may be a PDP (visible products and known hidden pieces). */
  byProduct: Map<string, string>;
  discarded: Discard[];
};

const isHttpsImage = (url: string): boolean => {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !u.username && !u.password && !u.port;
  } catch {
    return false;
  }
};
const validPrice = (price: number | null): price is number => typeof price === "number" && Number.isFinite(price) && price > 0 && price < 10_000;

/** href is rebuilt from the store base + slug and must equal INK's own URL (same rule as the garment index): anything else fails closed. */
function verifiedHref(store: CommerceStoreKey, product: { slug: string; storeProductUrl: string }): string | null {
  const base = STORE_PRODUCT_URL_BASE[store];
  if (!base || !purchaseUrl(product)) return null;
  const href = `${base}/${product.slug}`;
  return href === product.storeProductUrl && /^[a-z0-9][a-z0-9_-]{0,127}$/.test(product.slug) ? href : null;
}

type Candidate = { id: string; slug: string; storeProductUrl: string; imageUrl: string; price: number | null; sales: number; garmentTypeId?: number | null };

/**
 * MD §7: the classic T-shirt first (INK `product_type` 1), then the other main shirts (Algodão Peruano, Oversized), then any other piece.
 * A product whose type is unknown (snapshot written before the field existed) ranks right after the classic one.
 */
const GARMENT_PREFERENCE: Readonly<Record<number, number>> = { 1: 0, 72: 2, 178: 3 };
const garmentRank = (id: number | null | undefined): number => (typeof id === "number" ? (GARMENT_PREFERENCE[id] ?? 4) : 1);

/** Representative: valid image + price + verified link, then the preferred piece, then the best seller, then the oldest INK id. Null = fail closed. */
function pickRepresentative(store: CommerceStoreKey, members: readonly Candidate[], discarded: Discard[]): (Candidate & { href: string; price: number }) | null {
  const valid: (Candidate & { href: string; price: number })[] = [];
  for (const m of members) {
    const href = verifiedHref(store, m);
    if (!isHttpsImage(m.imageUrl)) discarded.push({ productId: m.id, reason: "invalid-image" });
    else if (!validPrice(m.price)) discarded.push({ productId: m.id, reason: "invalid-price" });
    else if (!href) discarded.push({ productId: m.id, reason: "invalid-url" });
    else valid.push({ ...m, href, price: m.price });
  }
  valid.sort((a, b) => garmentRank(a.garmentTypeId) - garmentRank(b.garmentTypeId) || b.sales - a.sales || compareIds(a.id, b.id));
  return valid[0] ?? null;
}

class UnionFind {
  private parent = new Map<string, string>();
  find(x: string): string {
    let root = x;
    while (this.parent.has(root) && this.parent.get(root) !== root) root = this.parent.get(root)!;
    this.parent.set(x, root);
    return root;
  }
  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    // deterministic root: the smaller INK id
    if (compareIds(ra, rb) <= 0) this.parent.set(rb, ra);
    else this.parent.set(ra, rb);
  }
}

export function buildDocuments(input: StoreInput): BuiltDocuments {
  const { store } = input;
  const regionEntry = Object.values(REGIONS).find((r) => r.storeKey === store);
  if (!regionEntry) return { documents: [], byProduct: new Map(), discarded: [] };
  const region = regionEntry.slug;
  const ufs = regionEntry.ufs;
  const featured = input.featuredCollectionIds ?? new Set<number>();
  const discarded: Discard[] = [];

  // Collections: editorial (merch-led) ones are affinity; per-state ones are geography; the rest is structure.
  const editorialOf = new Map<string, CollectionSignal[]>();
  const stateOf = new Map<string, string>();
  const neverRecommend = new Set<string>();
  for (const c of [...input.collections].sort((a, b) => a.position - b.position || a.id - b.id)) {
    // The full list of a PUBLIC collection only, as before internal ones kept theirs: an internal segmentation never widens a signal.
    const members = (c.isAvailable ? c.allMemberIds : undefined) ?? c.memberIds;
    const stateUf = stateOfCollection(c.slug, ufs);
    for (const id of members) {
      if (NEVER_RECOMMEND_COLLECTIONS.has(c.slug)) neverRecommend.add(id);
      if (stateUf) {
        if (!stateOf.has(id)) stateOf.set(id, stateUf);
        else if (stateOf.get(id) !== stateUf) stateOf.set(id, "?");
      }
    }
    if (stateUf || WEAK_COLLECTIONS.has(c.slug) || c.merchCount < 2 || c.merchCount < c.cityDesignCount) continue;
    const signal: CollectionSignal = { id: c.id, slug: c.slug, name: c.name, size: c.matchedCount, featured: featured.has(c.id) };
    for (const id of members) editorialOf.set(id, [...(editorialOf.get(id) ?? []), signal]);
  }

  const documents: RecommendationDocument[] = [];
  const byProduct = new Map<string, string>();

  // ── City designs: one document per binding (a binding IS one design of one place) ────────────────────────────────
  const ranked = rankBindings(input.bindings.filter((b) => b.commerceStoreKey === store), [store]);
  const pieceOf = new Map<string, string[]>(); // cluster → hidden pieces
  for (const [cluster, ids] of Object.entries(input.garmentClusters ?? {})) pieceOf.set(cluster, [...ids]);
  for (const b of ranked) {
    const binding = withLocality(b);
    const sub = isSubLocality(binding);
    // A sub-locality product ("Praia Paraíso", Torres) is about a place inside its municipality: for recommendations its place is the municipality.
    const placeKey = sub ? binding.cityId : localityKeyOf(binding);
    const place = localityById(placeKey) ?? cityById(placeKey);
    const family = familyById(binding.designFamily);
    if (!place || !family) {
      discarded.push({ productId: binding.inkProductId, reason: "unknown-place" });
      continue;
    }
    const rep = pickRepresentative(store, [{ id: binding.inkProductId, slug: binding.slug, storeProductUrl: binding.storeProductUrl, imageUrl: binding.imageUrl, price: binding.price, sales: binding.totalSalesCount ?? 0 }], discarded);
    const placeLabel = sub && binding.localityLabel ? binding.localityLabel : place.name;
    const variant = binding.designVariant !== "base" && !sub ? ` ${binding.variantLabel ?? ""}`.trimEnd() : "";
    const title = `${placeLabel} · ${family.name}${variant}`;
    const key = `p:${binding.inkProductId}`;
    const pieces = binding.productClusterId ? (pieceOf.get(binding.productClusterId) ?? []) : [];
    const memberIds = [...new Set([binding.inkProductId, ...pieces])];
    const city = cityById(binding.cityId);
    const tokens = tokensOf(placeLabel);
    documents.push({
      key,
      kind: "city",
      store,
      region,
      representative: rep ? { id: rep.id, title, image: rep.imageUrl, price: rep.price, slug: rep.slug, href: rep.href } : { id: binding.inkProductId, title, image: "", price: 0, slug: binding.slug, href: "" },
      memberIds,
      clusterIds: binding.productClusterId ? [binding.productClusterId] : [],
      locality: { key: placeKey, name: place.name, uf: place.uf, type: place.type },
      family: family.id,
      primary: binding.isPrimary && !sub,
      uf: place.uf,
      meso: city?.mesoSlug || null,
      collections: [],
      mainCollection: null,
      line: family.id,
      stateIdentity: false,
      baseTitle: normalizeText(`${placeLabel} ${family.id} ${binding.designVariant}`),
      equivalence: `city:${placeKey}:${family.id}`,
      tokens,
      themes: [],
      sales: binding.totalSalesCount ?? 0,
      eligible: Boolean(rep) && binding.isPrimary && !sub,
      editorialSignals: [`locality:${place.name}/${place.uf}`, `family:${family.id}`, ...(binding.designVariant !== "base" ? [`variant:${binding.designVariant}`] : []), ...(sub ? ["sub-locality"] : [])],
    });
    for (const id of memberIds) byProduct.set(id, key);
  }

  // ── Editorial designs: merge pieces of one design (same cluster, or the same visible name twice) ────────────────────
  const merch = input.merch.filter((m) => m.commerceStoreKey === store);
  const uf = new UnionFind();
  const firstByCluster = new Map<string, string>();
  const firstByName = new Map<string, string>();
  for (const m of merch) {
    uf.find(m.inkProductId);
    if (m.productClusterId) {
      const seen = firstByCluster.get(m.productClusterId);
      if (seen) uf.union(seen, m.inkProductId);
      else firstByCluster.set(m.productClusterId, m.inkProductId);
    }
    const nameKey = normalizeText(m.name);
    const seenName = firstByName.get(nameKey);
    if (seenName) uf.union(seenName, m.inkProductId);
    else firstByName.set(nameKey, m.inkProductId);
  }
  const groups = new Map<string, MerchProduct[]>();
  for (const m of merch) {
    const root = uf.find(m.inkProductId);
    groups.set(root, [...(groups.get(root) ?? []), m]);
  }

  for (const [root, members] of [...groups.entries()].sort((a, b) => compareIds(a[0], b[0]))) {
    const rep = pickRepresentative(
      store,
      members.map((m) => ({ id: m.inkProductId, slug: m.slug, storeProductUrl: m.storeProductUrl, imageUrl: m.imageUrl, price: m.price, sales: m.totalSalesCount, garmentTypeId: m.garmentTypeId })),
      discarded,
    );
    const repProduct = members.find((m) => m.inkProductId === rep?.id) ?? members[0];
    const name = repProduct.name;
    const geo = geoOfName(name, ufs);
    const memberIds = members.map((m) => m.inkProductId).sort(compareIds);
    const clusterIds = [...new Set(members.flatMap((m) => (m.productClusterId ? [m.productClusterId] : [])))].sort();
    for (const cluster of clusterIds) for (const piece of pieceOf.get(cluster) ?? []) if (!memberIds.includes(piece)) memberIds.push(piece);

    // Collections of ANY member count for the design.
    const collections = [...new Map(members.flatMap((m) => editorialOf.get(m.inkProductId) ?? []).map((c) => [c.id, c])).values()].sort((a, b) => a.size - b.size || a.id - b.id);
    const collectionUfs = new Set(members.map((m) => stateOf.get(m.inkProductId)).filter((x): x is string => Boolean(x)));
    let docUf = geo.uf;
    let ufSource: string | null = geo.ufSource;
    if (!docUf && collectionUfs.size === 1 && !collectionUfs.has("?")) {
      docUf = [...collectionUfs][0];
      ufSource = "collection";
    }
    const meso = geo.locality?.mesoSlug || mesoOfName(name, docUf);
    const tokens = tokensOf(name);
    const sales = members.reduce((n, m) => n + (m.totalSalesCount ?? 0), 0);
    const neverRec = members.some((m) => neverRecommend.has(m.inkProductId));
    const key = `d:${root}`;
    documents.push({
      key,
      kind: "editorial",
      store,
      region,
      representative: rep ? { id: rep.id, title: displayTitle(name), image: rep.imageUrl, price: rep.price, slug: rep.slug, href: rep.href } : { id: root, title: displayTitle(name), image: "", price: 0, slug: repProduct.slug, href: "" },
      memberIds,
      clusterIds,
      locality: geo.locality ? { key: geo.locality.id, name: geo.locality.name, uf: geo.locality.uf, type: geo.locality.type } : null,
      family: null,
      primary: true,
      uf: docUf,
      meso: meso || null,
      collections,
      mainCollection: collections[0] ?? null,
      line: geo.line,
      stateIdentity: geo.stateIdentity,
      baseTitle: baseTitleOf(name),
      equivalence: geo.stateIdentity && docUf && geo.line ? `state:${docUf}:${geo.line}` : `title:${baseTitleOf(name)}`,
      tokens,
      themes: themesOf(tokens),
      sales,
      // Recommended only when it really is catalog editorial: valid card, at least one editorial collection, never a personal order.
      eligible: Boolean(rep) && collections.length > 0 && !neverRec,
      editorialSignals: [
        ...(docUf ? [`uf:${docUf}(${ufSource})`] : []),
        ...(geo.locality ? [`locality:${geo.locality.name}`] : []),
        ...(meso ? [`meso:${meso}`] : []),
        ...collections.map((c) => `collection:${c.slug}${c.featured ? "*" : ""}`),
        ...(geo.line ? [`line:${geo.line}`] : []),
        ...(geo.stateIdentity ? ["state-identity"] : []),
        ...themesOf(tokens).map((t) => `theme:${t}`),
        ...(neverRec ? ["personal-order"] : []),
      ],
    });
    for (const id of memberIds) byProduct.set(id, key);
  }

  return { documents, byProduct, discarded };
}

/** Order in which the same place's other families fill the two "same place" positions (MD §10: Feito em, then Coordenadas). */
export const SAME_PLACE_FAMILY_ORDER: readonly DesignFamilyId[] = ["feito-em", "coordenadas", ...DESIGN_FAMILIES.map((f) => f.id).filter((id) => id !== "feito-em" && id !== "coordenadas")];

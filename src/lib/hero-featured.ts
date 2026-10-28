import "server-only";
import { purchaseUrl } from "./catalog/commerce";
import { DESIGN_FAMILIES, familyById } from "./catalog/families";
import { getCatalog, type Catalog } from "./catalog/repository";
import { storeForRegion } from "./catalog/commerce-mode";
import { canonicalRef } from "./catalog/references";
import { isSubLocality, localityOfBinding } from "./catalog/locality-binding";
import { resolveCityProduct } from "./catalog/resolver";
import { merchRegions, type MerchProduct, type UnrankedBinding } from "./catalog/types";
import { formatListPrice, formatPrice } from "./format";
import type { LocalityType } from "./geo/cities";
import { localityKindLabel } from "./geo/localities";
import type { CommerceStoreKey, RegionSlug } from "./geo/regions";
import { normalizeText } from "./geo/text";
import { HERO_FAMILIES } from "./editorial/sul";
import type { HeroFamilyCard } from "./home";
import { HERO_CARDS, MAX_FEATURED, type FeaturedProductRef, type MediaRef } from "./site-config/schema";

/**
 * The products the hero shows as cards, configured per region in the CMS as stable references (store + INK product id). Everything shown
 * (photo, price, destination) is read from the catalog SNAPSHOT already on disk at render time: nothing is copied into the document and INK is
 * never called. A reference is eligible only when the product is present in THIS region's own store snapshot, is a canonical style of a
 * locality of this region that has pages here (a municipality OR a Federal District administrative region), has a photo and a verified purchase link; anything else is omitted from the storefront (only that
 * card) and flagged in the panel, and its reference is kept in the draft so the owner can replace it.
 *
 * A PIECE that is not a city's (merch: the Christmas shirts, the bodies) is eligible too when the store sells it in this region, with a photo and a
 * verified purchase link. It has no page of ours, so its card goes straight to INK (like its card in a collection) and has no place line.
 */
export type FeaturedSlot = { ref: FeaturedProductRef; ok: boolean; reason: string | null; card: HeroFamilyCard | null; buyUrl: string | null; imageUrl: string | null };

function cardOf(region: RegionSlug, b: UnrankedBinding, catalog: Catalog): { card: HeroFamilyCard | null; reason: string | null } {
  if (b.commerceStoreKey !== storeForRegion(region)) return { card: null, reason: "produto de outra loja da INK" };
  // A place INSIDE a municipality (Torres · Praia Paraíso) is not a card of its own; a Federal District administrative region is (it has its own page).
  if (isSubLocality(b)) return { card: null, reason: "produto de localidade dentro da cidade, não da cidade" };
  const city = localityOfBinding(b);
  const family = familyById(b.designFamily);
  if (!city || !family) return { card: null, reason: "localidade ou estilo desconhecido" };
  if (city.regionSlug !== region) return { card: null, reason: "localidade de outra região" };
  if (!catalog.coveredLocalityIds(region).has(city.id)) return { card: null, reason: "a localidade não tem página nesta loja" };
  if (!b.imageUrl) return { card: null, reason: "sem foto no catálogo" };
  if (!purchaseUrl(b)) return { card: null, reason: "sem link de compra verificado" };
  return {
    card: { familyId: `${family.id}:${b.inkProductId}`, familyName: family.name, cityName: city.name, uf: city.uf, imageUrl: b.imageUrl, price: formatPrice(b.price), listPrice: formatListPrice(b), href: `/${region}/${city.uf.toLowerCase()}/${city.slug}/${family.id}` },
    reason: null,
  };
}

/** A piece that is not a city's: its own name, no place, straight to its INK page (`cityName` and `uf` empty). */
function pieceCardOf(region: RegionSlug, m: MerchProduct): { card: HeroFamilyCard | null; reason: string | null } {
  if (!merchRegions(m).includes(region)) return { card: null, reason: "peça vendida em outra região" };
  if (!m.imageUrl) return { card: null, reason: "sem foto no catálogo" };
  const href = purchaseUrl(m);
  if (!href) return { card: null, reason: "sem link de compra verificado" };
  return { card: { familyId: `peca:${m.inkProductId}`, familyName: m.name.replace(/\s+/g, " ").trim(), cityName: "", uf: "", imageUrl: m.imageUrl, price: formatPrice(m.price), listPrice: formatListPrice(m), href }, reason: null };
}

/** Resolves each reference against the snapshot, in order, with the reason when it cannot be shown. */
export function resolveFeatured(region: RegionSlug, refs: readonly FeaturedProductRef[]): FeaturedSlot[] {
  const catalog = getCatalog();
  return refs.slice(0, MAX_FEATURED).map((ref) => {
    // The CMS keeps its reference as saved; single-store mode reads an old regional ref through the old → new map (references.ts).
    const served = canonicalRef({ store: ref.store, id: ref.productId });
    if (!served) return { ref, ok: false, reason: "produto da loja regional sem correspondência confirmada na loja única", card: null, buyUrl: null, imageUrl: null };
    if (served.store !== storeForRegion(region)) return { ref, ok: false, reason: "produto de outra loja da INK", card: null, buyUrl: null, imageUrl: null };
    const products = catalog.productsOfStore(served.store);
    const binding = products.cityDesigns.get(served.id);
    const piece = binding ? undefined : products.merch.get(served.id);
    if (piece) {
      const { card, reason } = pieceCardOf(region, piece);
      return { ref, ok: card !== null, reason, card, buyUrl: purchaseUrl(piece), imageUrl: piece.imageUrl || null };
    }
    if (!binding) return { ref, ok: false, reason: "o produto não existe mais no catálogo sincronizado", card: null, buyUrl: null, imageUrl: null };
    const { card, reason } = cardOf(region, binding, catalog);
    return { ref, ok: card !== null, reason, card, buyUrl: purchaseUrl(binding), imageUrl: binding.imageUrl || null };
  });
}

/** A product marked on a picture, as the public draws it: its card and where it sits in the picture (% of its width and height). */
export type HeroSlidePin = { card: HeroFamilyCard; x: number; y: number };
/**
 * One product of the "feature" opening as the public draws it: the card and, when the owner gave it one, its own banner. `pins`: the products marked
 * on that banner that can be shown (an ineligible one is left out, like an ineligible card); absent or empty = the product bar, as before.
 */
export type HeroSlide = { card: HeroFamilyCard; image?: MediaRef; pins?: HeroSlidePin[] };

/**
 * The products the public hero draws, each with its banner. `featured === undefined` (never customised): Sul keeps its three original cards
 * (`legacy`, resolved by the code exactly as before) and every other region shows none. A configured list shows only its eligible products, in order.
 */
export function heroSlides(region: RegionSlug, featured: readonly FeaturedProductRef[] | undefined, legacy: HeroFamilyCard[]): HeroSlide[] {
  if (featured === undefined) return (region === "sul" ? legacy : []).map((card) => ({ card }));
  return resolveFeatured(region, featured).flatMap((s) => {
    if (!s.card) return [];
    const pins = s.ref.image && s.ref.pins ? resolveFeatured(region, s.ref.pins).flatMap((p, j) => (p.card ? [{ card: p.card, x: s.ref.pins![j].x, y: s.ref.pins![j].y }] : [])) : [];
    return [{ card: s.card, ...(s.ref.image ? { image: s.ref.image } : {}), ...(pins.length > 0 ? { pins } : {}) }];
  });
}

/** The cards of the three-card hero: its first `HERO_CARDS` eligible products (a list kept for the "feature" opening may hold more). */
export function heroCards(region: RegionSlug, featured: readonly FeaturedProductRef[] | undefined, legacy: HeroFamilyCard[]): HeroFamilyCard[] {
  return heroSlides(region, featured, legacy).slice(0, HERO_CARDS).map((s) => s.card);
}

/** The references of the three cards the Sul hero has always shown (Porto Alegre · Ponto de Origem, Curitiba · Feito em, Joinville · Coordenadas). Sul only. */
export function legacyFeaturedRefs(region: RegionSlug): FeaturedProductRef[] {
  if (region !== "sul") return [];
  return HERO_FAMILIES.flatMap(({ family, uf, slug }) => {
    const hit = resolveCityProduct(region, uf, slug, family);
    return hit ? [{ store: hit.primary.commerceStoreKey, productId: hit.primary.inkProductId }] : [];
  });
}

// ── Search (admin) ────────────────────────────────────────────────────────────────────────────────────────────

export type FeaturedCandidate = {
  store: CommerceStoreKey;
  productId: string;
  /** The style's name, or the piece's own name for a piece that is not a city's. */
  familyName: string;
  /** The place's name: a city or an administrative region (`localityType` says which). Empty for a piece that is not a city's. */
  cityName: string;
  /** Absent for a piece that is not a city's. */
  localityType?: LocalityType;
  uf: string;
  price: string | null;
  imageUrl: string;
  buyUrl: string;
  href: string;
  /** The city's main product for this style (others are versions of it). */
  primary: boolean;
};

type Indexed = { candidate: FeaturedCandidate; haystack: { city: string; uf: string; family: string; familyId: string; id: string; parent: string; kind: string } };
const indexes = new WeakMap<Catalog, Map<CommerceStoreKey, Indexed[]>>();

function indexOf(region: RegionSlug): Indexed[] {
  const catalog = getCatalog();
  const store = storeForRegion(region);
  let perStore = indexes.get(catalog);
  if (!perStore) indexes.set(catalog, (perStore = new Map()));
  const cached = perStore.get(store);
  if (cached) return cached;
  const primaries = new Set<string>();
  for (const localityId of catalog.coveredLocalityIds(region)) for (const e of catalog.cityFamilies(localityId)) primaries.add(e.primary.inkProductId);
  const built: Indexed[] = [];
  for (const b of catalog.productsOfStore(store).cityDesigns.values()) {
    const { card } = cardOf(region, b, catalog);
    if (!card) continue;
    const place = localityOfBinding(b)!; // `cardOf` only returns a card for a known place
    const isRegion = place.type === "administrative_region";
    built.push({
      candidate: { store, productId: b.inkProductId, familyName: card.familyName, cityName: card.cityName, localityType: place.type, uf: card.uf, price: card.price, imageUrl: card.imageUrl, buyUrl: purchaseUrl(b)!, href: card.href, primary: primaries.has(b.inkProductId) },
      // For an administrative region the parent ("Distrito Federal") and the kind ("Região Administrativa") are searchable too; a municipality's parent is its state, which `uf` already covers.
      haystack: { city: normalizeText(card.cityName), uf: card.uf.toLowerCase(), family: normalizeText(card.familyName), familyId: familyById(b.designFamily)?.id ?? "", id: b.inkProductId, parent: isRegion ? normalizeText(place.parentLabel) : "", kind: isRegion ? normalizeText(localityKindLabel(place)) : "" },
    });
  }
  // The pieces that are not a city's (the Christmas shirts, the bodies), found by their name or id.
  for (const m of catalog.productsOfStore(store).merch.values()) {
    const { card } = pieceCardOf(region, m);
    if (!card) continue;
    built.push({
      candidate: { store, productId: m.inkProductId, familyName: card.familyName, cityName: "", uf: "", price: card.price, imageUrl: card.imageUrl, buyUrl: card.href, href: card.href, primary: false },
      haystack: { city: "", uf: "", family: normalizeText(card.familyName), familyId: "peca", id: m.inkProductId, parent: "", kind: "" },
    });
  }
  perStore.set(store, built);
  return built;
}

/** Real, eligible products of the region's own store matching city or administrative region, UF, style or product id. Bounded: never the whole catalog. */
export function searchFeaturedCandidates(region: RegionSlug, query: string, limit = 12): { results: FeaturedCandidate[]; total: number } {
  const tokens = normalizeText(query).split(" ").filter(Boolean).slice(0, 6);
  if (tokens.join("").length < 2) return { results: [], total: 0 };
  const matches = indexOf(region).filter(({ haystack: h }) =>
    tokens.every((t) => h.city.includes(t) || h.uf === t || h.parent.includes(t) || h.kind.includes(t) || h.family.includes(t) || h.familyId.includes(t) || h.id === t || (t.length >= 5 && h.id.startsWith(t))),
  );
  // City styles first (the main one of each city ahead), then the pieces that are not a city's.
  matches.sort((a, b) => Number(b.candidate.primary) - Number(a.candidate.primary) || Number(!a.candidate.cityName) - Number(!b.candidate.cityName) || a.candidate.cityName.localeCompare(b.candidate.cityName, "pt-BR") || a.candidate.familyName.localeCompare(b.candidate.familyName, "pt-BR"));
  return { results: matches.slice(0, Math.min(limit, 24)).map((m) => m.candidate), total: matches.length };
}

export const STYLE_NAMES: readonly string[] = DESIGN_FAMILIES.map((f) => f.name);

/** How many eligible products the region's catalog offers (0 = nothing to choose from in this environment). */
export const eligibleFeaturedCount = (region: RegionSlug): number => indexOf(region).length;

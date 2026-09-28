/**
 * INK's own `product_type.id` is global and stable across the three stores (confirmed live against Sul,
 * Norte and Centro-Oeste — the same ids and names came back everywhere: docs/storefront/city-garment-tabs-round.md).
 * `1` ("Camiseta") is the classic piece already represented by a family's `primary` binding — it is kept here
 * only so the central map has one authoritative place per id, never used to produce a second, redundant
 * `GarmentBinding` for the classic piece.
 *
 * This list holds ONLY garment types confirmed to exist in the real catalog during this round's audit. Do
 * not add a type here on a guess (the MD's own examples, e.g. "baby look", were never observed and are
 * deliberately absent) — an unrecognized `product_type.id` seen by the linker (garments-link.ts) is
 * excluded, never labeled.
 *
 * Client-safe on purpose (no `server-only` import, directly or transitively): the city page's tab component
 * imports `CLASSIC_GARMENT_TYPE_ID` from here. The actual linking logic (garments-link.ts) needs
 * `ink/config`'s host allowlist, which is `server-only`-tainted, so it lives in its own file — mixing it in
 * here would drag that taint into the client bundle the moment any client component imported this constant.
 */
export const GARMENT_TYPES: ReadonlyArray<{ id: number; slug: string; label: string; sortOrder: number }> = [
  { id: 1, slug: "classica", label: "Camiseta clássica", sortOrder: 0 },
  { id: 72, slug: "peruano", label: "Algodão Peruano", sortOrder: 1 },
  { id: 178, slug: "oversized", label: "Oversized", sortOrder: 2 },
  { id: 8, slug: "regata", label: "Regata", sortOrder: 3 },
  { id: 23, slug: "cropped", label: "Cropped", sortOrder: 4 },
  { id: 28, slug: "cropped-moletom", label: "Cropped Moletom", sortOrder: 5 },
  { id: 119, slug: "moletom-capuz", label: "Moletom Capuz", sortOrder: 6 },
  { id: 120, slug: "moletom-sueter", label: "Moletom Suéter", sortOrder: 7 },
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

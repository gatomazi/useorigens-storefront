import "server-only";
import perfisCidades from "../../../data/mundo/perfis-cidades.json";
import sedesIbge from "../../../data/mundo/sedes-municipais-ibge-2022.json";
import { getCatalog } from "../catalog/repository";
import { localitiesOfRegion } from "../geo/localities";
import { STATE_CAPITAL_SLUG, type RegionSlug } from "../geo/regions";

/**
 * "Meu Pequeno Mundo": the catalog data the experience reads, built from the same sources and rules as the storefront (getCatalog(),
 * localitiesOfRegion(), the city and design page routes). One builder for both consumers: the `/api/mundo/*` routes of the storefront
 * and `npm run mundo:dados` (the standalone prototype export). No second, hand-edited list of places exists anywhere.
 *
 * - the index (search): every place with at least one design — id, name, UF, region, slug, aliases, mesoregion, RA/capital markers;
 * - one record per place, loaded only for the places a visitor picks: the store page, the primary product of each design family and,
 *   when known, the IBGE reference point (municipal seat / administrative region point, Localidades 2022) and the 2017 regional division.
 * Prices are left out on purpose: the snapshot can be days old and the experience must not show a price INK no longer charges.
 */

/** `p: 1` = the place has a curated profile (the experience fetches only those, never a 404 per place). */
export type IndiceLugar = { i: string; n: string; u: string; r: RegionSlug; s: string; a?: string[]; m?: string; t?: "ra"; c?: 1; p?: 1 };
const COM_PERFIL = new Set(Object.keys((perfisCidades as { cidades: Record<string, unknown> }).cidades));
export type Referencia = { sede?: { lat: number; lon: number; tipo: "sede" | "ra"; nomeIbge?: string }; rgi?: string; rgint?: string };
export type LugarDoMundo = {
  v: 1;
  i: string;
  n: string;
  u: string;
  r: RegionSlug;
  /** The city page: absolute when `site` is given (standalone export), otherwise a same-origin path (storefront). */
  url: string;
  produtos: { f: string; nome: string; img: string; url: string }[];
} & Referencia;

/** File name of a place's record (IBGE code, or `df-ra-<slug>` for an administrative region). Must match `chaveArquivo` in the experience. */
export const fileKey = (id: string) => id.replace(/[^a-z0-9-]/gi, "-");

type Sedes = { sedes: Record<string, [number, number, string, string]>; regioesDF: Record<string, [number, number]> };
const SEDES = sedesIbge as unknown as Sedes;
/** Store slugs whose IBGE name differs (the IBGE base predates the slug); regions created after the 2022 survey have no point at all. */
const RA_NOME_IBGE: Record<string, string> = { "scia-estrutural": "SCIA" };
const slugify = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
let raPorSlug: Map<string, { nome: string; p: [number, number] }> | null = null;

function referenciaIbge(place: { id: string; slug: string; type: string }): Referencia {
  if (place.type === "administrative_region") {
    raPorSlug ??= new Map(Object.entries(SEDES.regioesDF).map(([nome, p]) => [slugify(nome), { nome, p }]));
    const ra = raPorSlug.get(place.slug) ?? raPorSlug.get(slugify(RA_NOME_IBGE[place.slug] ?? ""));
    return ra ? { sede: { lat: ra.p[0], lon: ra.p[1], tipo: "ra", nomeIbge: ra.nome } } : {};
  }
  const s = SEDES.sedes[place.id];
  return s ? { sede: { lat: s[0], lon: s[1], tipo: "sede" }, rgi: s[2], rgint: s[3] } : {};
}

/** Every place with designs in the given regions, in the storefront's order. */
export function indiceDoMundo(regions: readonly RegionSlug[]): IndiceLugar[] {
  const catalog = getCatalog();
  const index: IndiceLugar[] = [];
  for (const region of regions) {
    const covered = catalog.coveredLocalityIds(region);
    for (const place of localitiesOfRegion(region)) {
      if (!covered.has(place.id) || catalog.cityFamilies(place.id).length === 0) continue;
      index.push({
        i: place.id,
        n: place.name,
        u: place.uf,
        r: region,
        s: place.slug,
        ...(place.aliases.length ? { a: [...place.aliases] } : {}),
        ...(place.meso ? { m: place.meso } : {}),
        ...(place.type === "administrative_region" ? { t: "ra" as const } : {}),
        ...(STATE_CAPITAL_SLUG[place.uf] === place.slug && place.type === "municipality" ? { c: 1 as const } : {}),
        ...(COM_PERFIL.has(place.id) ? { p: 1 as const } : {}),
      });
    }
  }
  return index;
}

/** One place's record, or null when it is not in these regions or has no design. `site`: "" for same-origin paths. */
export function lugarDoMundo(id: string, regions: readonly RegionSlug[], site = ""): LugarDoMundo | null {
  const catalog = getCatalog();
  for (const region of regions) {
    const place = localitiesOfRegion(region).find((p) => p.id === id);
    if (!place) continue;
    if (!catalog.coveredLocalityIds(region).has(place.id)) return null;
    const families = catalog.cityFamilies(place.id);
    if (families.length === 0) return null;
    const placeUrl = `${site}/${region}/${place.uf.toLowerCase()}/${place.slug}`;
    return {
      v: 1,
      i: place.id,
      n: place.name,
      u: place.uf,
      r: region,
      url: placeUrl,
      produtos: families.map((entry) => ({ f: entry.family.id, nome: entry.family.name, img: entry.primary.imageUrl, url: `${placeUrl}/${entry.family.id}` })),
      ...referenciaIbge(place),
    };
  }
  return null;
}

/** The place id behind a record file name (`4205407`, `df-ra-plano-piloto`), among the given regions; null when unknown. */
export function idDoArquivo(key: string, regions: readonly RegionSlug[]): string | null {
  if (!/^[a-z0-9-]{1,80}$/i.test(key)) return null;
  for (const region of regions) {
    const place = localitiesOfRegion(region).find((p) => fileKey(p.id) === key);
    if (place) return place.id;
  }
  return null;
}

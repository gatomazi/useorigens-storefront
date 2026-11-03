import { administrativeRegionByLabel } from "../geo/administrative-regions";
import { citiesByName } from "../geo/cities";
import { REGIONS, STATE_NAMES, UF_TO_REGION, type RegionSlug } from "../geo/regions";
import { normalizeText } from "../geo/text";

/**
 * The region of an Uma Penca article, read from its title. The feed has no category, tag or field per region (g:product_type and
 * g:description come empty), so the title is the only fact: "Caneca Lá de Guarapuava" names a place, and the place has a UF.
 *
 * - "Lá de/da/do/das/dos <lugar>" names a municipality, an administrative region of the DF or a state, matched EXACTLY (accent- and
 *   case-insensitive) — never by proximity or by guess.
 * - A name that exists in more than one region (Palmas PR/TO, Rio Branco AC/MT, Santa Maria RS/DF…) needs the UF at the end of the title:
 *   "Caneca Lá de Palmas | TO", the store's naming (also "– TO", "- TO", "/TO", "(TO)" or " TO"). Without it the article is left out,
 *   with the reason, so it is fixed in the Uma Penca store instead of landing in the wrong region. Any title may carry the UF; it must
 *   then agree with the place.
 * - A title without "Lá de …" names no place (a generic article): it belongs to every region, as every article did before the split.
 */
export type ArticlePlace = { ok: true; region: RegionSlug | null; uf: string | null } | { ok: false; reason: string };

const PLACE_RE = /\bl[aá]\s+(?:de|da|do|das|dos)\s+(.+)$/iu;
const UF_SUFFIX_RE = /^(.+?)\s*(?:[|\-–—/,]\s*|\(\s*|\s)([A-Z]{2})\s*\)?$/u;
const BRAZIL_UFS = new Set(["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"]);

/** Every place of the storefront's regions called `name`: municipalities, DF administrative regions and states. */
function placesNamed(name: string): { uf: string; region: RegionSlug }[] {
  const ufs = Object.keys(UF_TO_REGION);
  const places = citiesByName(name, ufs).map((c) => ({ uf: c.uf, region: c.regionSlug }));
  const ra = administrativeRegionByLabel(name);
  if (ra) places.push({ uf: ra.uf, region: ra.regionSlug });
  const key = normalizeText(name);
  for (const uf of ufs) if (normalizeText(STATE_NAMES[uf] ?? "") === key) places.push({ uf, region: UF_TO_REGION[uf] });
  return places;
}

/** The place the title names, as written, and the UF suffix when it has one ("Lá de Palmas | TO" → Palmas, TO). Null when it names none. */
function titlePlace(title: string): { name: string; uf: string | null; label: string } | null {
  const trimmed = title.trim();
  const m = PLACE_RE.exec(trimmed);
  if (!m) return null;
  const name = m[1].trim();
  const suffix = UF_SUFFIX_RE.exec(name);
  if (suffix && BRAZIL_UFS.has(suffix[2])) return { name: suffix[1].trim(), uf: suffix[2], label: trimmed.slice(0, m.index + m[0].length - name.length) + suffix[1].trim() };
  return { name, uf: null, label: trimmed };
}

export function articlePlace(title: string): ArticlePlace {
  const named = titlePlace(title);
  if (!named) return { ok: true, region: null, uf: null };
  const { name, uf } = named;
  if (uf && !UF_TO_REGION[uf]) return { ok: false, reason: `UF ${uf} is not in any storefront region` };

  const places = placesNamed(name).filter((p) => uf === null || p.uf === uf);
  if (places.length === 0) return { ok: false, reason: uf ? `"${name}" is not a place of ${uf}` : `"${name}" is not a known city, DF administrative region or state` };
  const ufs = [...new Set(places.map((p) => p.uf))].sort();
  const regions = new Set(places.map((p) => p.region));
  if (regions.size > 1) return { ok: false, reason: `"${name}" exists in ${ufs.join(", ")}: put the UF at the end of the title (e.g. "Lá de ${name} | ${ufs[0]}")` };
  return { ok: true, region: places[0].region, uf: ufs.length === 1 ? ufs[0] : null };
}

/** Whether an article is shown in `region`: its own region, or every region when its title names no place. */
export const isArticleOfRegion = (article: { region?: RegionSlug | null }, region: string): boolean => (article.region ?? null) === null || article.region === region;

/**
 * The city of an article, for the "Outros artigos" city filter and the global search: the place's own spelling ("Lá de florianopolis" →
 * Florianópolis), its UF when certain, and the title without the UF suffix ("Caneca Lá de Palmas"). Null for a generic article or a place that
 * `articlePlace` refuses (such an article never reaches a page anyway).
 */
export function articleCity(title: string): { name: string; uf: string | null; label: string } | null {
  const named = titlePlace(title);
  const place = articlePlace(title);
  if (!named || !place.ok || place.region === null) return null;
  const ufs = place.uf ? [place.uf] : REGIONS[place.region].ufs;
  const official = citiesByName(named.name, ufs)[0]?.name ?? administrativeRegionByLabel(named.name)?.name ?? named.name;
  return { name: official, uf: place.uf, label: named.label };
}

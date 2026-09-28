/**
 * Titles, descriptions and the short visible paragraphs of the storefront's indexable pages, as pure functions of REAL data (the city, its
 * state, the families that exist for it). Nothing here invents a claim: styles are listed only if the catalog has them, counts come from the
 * catalog, and there is no demonym for a city (none is validated). Pure on purpose, so uniqueness, escaping-safe text and length are unit-tested.
 */
import { pluralRegioesAdministrativas } from "../geo/localities";
import { REGIONS, type RegionSlug } from "../geo/regions";
import { joinStatesOf, stateDemonym, stateIn, stateOf } from "./state-copy";

const MAX_DESCRIPTION = 160;

export const normalizeSpaces = (text: string): string => text.replace(/\s+/g, " ").trim();

/** Cuts at a word boundary and adds an ellipsis only when the text is longer than a snippet holds. */
export function fitDescription(text: string, max = MAX_DESCRIPTION): string {
  const clean = normalizeSpaces(text);
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:\s-]+$/, "")}…`;
}

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** "A, B e C" / "A e B" / "A". */
export function listNames(names: readonly string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

const stylesCount = (n: number): string => (n === 1 ? "1 estilo" : `${n} estilos`);

// ── Region home ─────────────────────────────────────────────────────────────────────────────────────────

const MAX_STATES_LISTED = 4;

export function regionTitle(region: RegionSlug): string {
  return `Camisetas do ${REGIONS[region].name} e da Sua Cidade`;
}

export function regionDescription(region: RegionSlug): string {
  const { name, ufs } = REGIONS[region];
  const where = ufs.length <= MAX_STATES_LISTED ? joinStatesOf(ufs) : `do ${name}`;
  return fitDescription(`Encontre camisetas de cidades ${where}. Escolha sua cidade, explore as estampas e vista suas origens.`);
}

// ── State ───────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A state whose places are not all cities (the Federal District: Brasília plus its administrative regions) never says "cidades": its
 * copy names Brasília and the Regiões Administrativas apart. `administrativeRegions` = how many of them really have products; 0 (every
 * other state) keeps the original wording untouched.
 */
export function stateTitle(uf: string, administrativeRegions = 0): string {
  if (administrativeRegions > 0) return `Camisetas de Brasília e Regiões Administrativas do ${uf.toUpperCase()}`;
  const demonym = stateDemonym(uf);
  // "Camisetas Gaúchas e de Cidades do RS": the preposition is the first word of the state's own phrase ("do" / "de"), the UF keeps it short.
  return demonym ? `Camisetas ${capitalize(demonym)} e de Cidades ${stateOf(uf).split(" ")[0]} ${uf.toUpperCase()}` : `Camisetas de Cidades ${stateOf(uf)}`;
}

export function stateDescription(uf: string, cityCount: number, administrativeRegions = 0): string {
  if (administrativeRegions > 0) {
    return fitDescription(`Explore camisetas de Brasília e de ${pluralRegioesAdministrativas(administrativeRegions)} ${stateOf(uf)}, com estampas de nome, mapa e coordenadas. Busque a sua localidade.`);
  }
  const count = cityCount > 0 ? `${cityCount} cidades com estampas de nome, mapa e coordenadas` : "estampas de nome, mapa e coordenadas";
  return fitDescription(`Explore camisetas de cidades ${stateOf(uf)}: ${count}. Busque a sua ou navegue por região.`);
}

/** The short visible paragraph of the state page (the count is the number of cities that really have products). */
export function stateIntro(uf: string, cityCount: number, administrativeRegions = 0): string {
  if (administrativeRegions > 0) {
    return `Camisetas ${stateOf(uf)}: estampas de nome, mapa e coordenadas de Brasília e de ${pluralRegioesAdministrativas(administrativeRegions)}. Busque a sua localidade ou navegue por Brasília e pelas Regiões Administrativas.`;
  }
  const demonym = stateDemonym(uf);
  const lead = demonym ? `Camisetas ${demonym} e de cidades ${stateOf(uf)}` : `Camisetas de cidades ${stateOf(uf)}`;
  return `${lead}: ${cityCount} cidades com estampas de nome, mapa e coordenadas. Busque a sua cidade ou escolha por região ou em ordem alfabética.`;
}

// ── City ────────────────────────────────────────────────────────────────────────────────────────────────

export function cityTitle(city: { name: string; uf: string }): string {
  return `Camisetas de ${city.name}, ${city.uf}`;
}

/** `type` is what tells an administrative region ("Região Administrativa do DF") apart from a municipality; absent = municipality. */
type Place = { name: string; uf: string; type?: "municipality" | "administrative_region" };

const whereIs = (place: Place): string =>
  place.type === "administrative_region" ? `Região Administrativa ${stateOf(place.uf)}` : stateIn(place.uf);

export function cityDescription(city: Place, styleNames: readonly string[]): string {
  const where = `Camisetas de ${city.name}, ${whereIs(city)}`;
  if (styleNames.length === 0) return fitDescription(`${where}. Veja os estilos e escolha o seu na loja.`);
  if (styleNames.length === 1) return fitDescription(`${where}: 1 estilo disponível, ${styleNames[0]}. Veja o estilo e escolha na loja.`);
  const shown = styleNames.slice(0, 3);
  const rest = styleNames.length - shown.length;
  const list = rest > 0 ? `${shown.join(", ")} e mais ${rest}` : listNames(shown);
  return fitDescription(`${where}: ${stylesCount(styleNames.length)} disponíveis, como ${list}. Veja os estilos e escolha o seu na loja.`);
}

/** 40–80 words about the real styles on the page; returns null when the city has none (the page then shows its own "coming soon" line). */
export function cityIntro(city: Place, region: RegionSlug, styleNames: readonly string[]): string | null {
  if (styleNames.length === 0) return null;
  const store = `Use ${REGIONS[region].name}`;
  return (
    `Camisetas de ${city.name}, ${whereIs(city)}. Na ${store} há ${stylesCount(styleNames.length)} para vestir ${city.name}: ${listNames(styleNames)}. ` +
    `Cada estilo abre a página do modelo, com as versões disponíveis e o caminho para comprar na loja, onde você define tamanho, cor, frete e pagamento.`
  );
}

// ── Design family page ──────────────────────────────────────────────────────────────────────────────────

/** The UF keeps two homonymous cities of different states apart (there are many "São José", "Bom Jesus"). */
export function familyTitle(family: { name: string }, city: { name: string; uf: string }): string {
  return `${family.name} de ${city.name}, ${city.uf}`;
}

export function familyDescription(family: { name: string; description: string }, city: { name: string; uf: string }): string {
  return fitDescription(`Camiseta ${family.name} de ${city.name}, ${stateIn(city.uf)}. ${family.description}`);
}

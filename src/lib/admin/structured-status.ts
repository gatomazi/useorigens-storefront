import "server-only";
import { DESIGN_FAMILIES } from "../catalog/families";
import { MAX_CITY_STYLES } from "../site-config/schema";
import { REGIONS, type RegionSlug } from "../geo/regions";
import { getRegionHome } from "../home";
import { storeForRegion } from "../catalog/commerce-mode";

/**
 * What the REAL catalog of a region can feed to the three structured home components, for the admin (editor panel, model cards and preview
 * notes). Purely local data (the catalog snapshot already on disk); nothing is invented: a component with no real data says so and the public
 * home omits it. Products of another region's INK store are never counted.
 */
export type StructuredStatus = { ok: boolean; summary: string; notes: string[] };

const NUMBER_WORDS: Readonly<Record<string, number>> = { dois: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10 };

/** The number of styles a heading promises ("Sua cidade, de 8 jeitos.", "nove estilos"), or null when it states none. */
function promisedCount(title: string): number | null {
  const digits = /\b(\d{1,2})\b/.exec(title);
  if (digits) return Number(digits[1]);
  const words = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().match(/[a-z]+/g) ?? [];
  const word = words.find((w) => w in NUMBER_WORDS);
  return word ? NUMBER_WORDS[word] : null;
}

export function cityStylesStatus(region: RegionSlug, configured?: { title?: string; count?: number }): StructuredStatus {
  const home = getRegionHome(region);
  const own = storeForRegion(region);
  const showcase = home.showcase;
  if (!showcase) return { ok: false, summary: "Sem cidade de exemplo com produtos", notes: [`Nenhuma cidade de exemplo de ${REGIONS[region].name} tem produtos no catálogo desta loja: a seção não aparece na loja até o catálogo ser sincronizado.`] };
  const entries = showcase.families.filter((f) => f.primary.commerceStoreKey === own);
  const have = new Set(entries.map((e) => e.family.id));
  const missing = DESIGN_FAMILIES.filter((f) => !have.has(f.id)).map((f) => f.name);
  const shown = Math.min(entries.length, configured?.count ?? MAX_CITY_STYLES);
  if (entries.length === 0) return { ok: false, summary: `Cidade de exemplo: ${showcase.city.name} · sem estilos disponíveis`, notes: ["Nenhum estilo real disponível para a cidade de exemplo: a seção não aparece na loja."] };
  const notes = [`Cidade de exemplo: ${showcase.city.name}. Estilos reais disponíveis: ${entries.length} de ${DESIGN_FAMILIES.length} (${entries.map((e) => e.family.name).join(", ")}).`];
  if (missing.length > 0) notes.push(`Sem produto desta loja para: ${missing.join(", ")}. Esses estilos não são mostrados.`);
  // A heading that states a number must match what the section shows: fewer promises what does not exist, more hides a new style.
  const promised = configured?.title ? promisedCount(configured.title) : null;
  if (promised !== null && promised !== shown) {
    notes.push(`O título fala em ${promised}, mas a seção mostra ${shown} ${shown === 1 ? "estilo real" : "estilos reais"}: ajuste o título${shown < entries.length ? " ou a quantidade de estilos" : ""} para bater com o que a loja mostra.`);
  }
  return { ok: true, summary: `${shown} estilo(s) serão mostrados (${entries.length} disponíveis)`, notes };
}

export function statesStatus(region: RegionSlug): StructuredStatus {
  const states = getRegionHome(region).states;
  const ready = states.filter((s) => s.cityCount > 0);
  const pending = states.filter((s) => s.cityCount === 0);
  // A state whose places are not all cities (Federal District: Brasília + administrative regions) says so instead of "(1)".
  const notes = [`Estados com cidades e produtos reais: ${ready.map((s) => `${s.name} (${s.administrativeRegionCount > 0 ? s.localityLabel : s.cityCount})`).join(", ") || "nenhum"}.`];
  if (pending.length > 0) notes.push(`Sem cidades com produtos nesta loja e por isso omitidos: ${pending.map((s) => s.name).join(", ")}.`);
  if (ready.length === 0) return { ok: false, summary: "Nenhum estado com produtos", notes: [...notes, "A seção não aparece na loja até o catálogo cobrir cidades de algum estado."] };
  return { ok: true, summary: `${ready.length} de ${states.length} estado(s) serão mostrados`, notes };
}

export function campaignStatus(region: RegionSlug): StructuredStatus {
  const crops = getRegionHome(region).campaignCrops.length;
  return { ok: true, summary: "Não depende do catálogo", notes: [crops > 0 ? `Recortes de camisetas reais disponíveis para o fundo: ${crops}.` : "Sem recortes de camisetas reais nesta região: use uma cor, um degradê ou uma imagem."] };
}

export function imageGridStatus(configured?: { tiles?: { image?: unknown }[] }): StructuredStatus {
  const tiles = configured?.tiles ?? [];
  const withoutImage = tiles.filter((t) => !t.image).length;
  const notes = ["Cada bloco tem nome, imagem e destino próprios: uma coleção da INK, uma página desta região ou uma URL da loja Use."];
  if (withoutImage > 0) notes.push(`${withoutImage} bloco(s) sem imagem aparecem como uma placa de cor com o nome. Envie as fotos em Mídia e escolha-as aqui.`);
  return { ok: true, summary: configured ? `${tiles.length} bloco(s)` : "Não depende do catálogo", notes };
}

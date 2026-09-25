import "server-only";
import { DESIGN_FAMILIES } from "../catalog/families";
import { REGIONS, type RegionSlug } from "../geo/regions";
import { getRegionHome } from "../home";

/**
 * What the REAL catalog of a region can feed to the three structured home components, for the admin (editor panel, model cards and preview
 * notes). Purely local data (the catalog snapshot already on disk); nothing is invented: a component with no real data says so and the public
 * home omits it. Products of another region's INK store are never counted.
 */
export type StructuredStatus = { ok: boolean; summary: string; notes: string[] };

export function cityStylesStatus(region: RegionSlug, configured?: { title?: string; count?: number }): StructuredStatus {
  const home = getRegionHome(region);
  const own = REGIONS[region].storeKey;
  const showcase = home.showcase;
  if (!showcase) return { ok: false, summary: "Sem cidade de exemplo com produtos", notes: [`Nenhuma cidade de exemplo de ${REGIONS[region].name} tem produtos no catálogo desta loja: a seção não aparece na loja até o catálogo ser sincronizado.`] };
  const entries = showcase.families.filter((f) => f.primary.commerceStoreKey === own);
  const have = new Set(entries.map((e) => e.family.id));
  const missing = DESIGN_FAMILIES.filter((f) => !have.has(f.id)).map((f) => f.name);
  const shown = Math.min(entries.length, configured?.count ?? 8);
  if (entries.length === 0) return { ok: false, summary: `Cidade de exemplo: ${showcase.city.name} · sem estilos disponíveis`, notes: ["Nenhum estilo real disponível para a cidade de exemplo: a seção não aparece na loja."] };
  const notes = [`Cidade de exemplo: ${showcase.city.name}. Estilos reais disponíveis: ${entries.length} de ${DESIGN_FAMILIES.length} (${entries.map((e) => e.family.name).join(", ")}).`];
  if (missing.length > 0) notes.push(`Sem produto desta loja para: ${missing.join(", ")}. Esses estilos não são mostrados.`);
  if (configured?.title && /\b8\b|oito/i.test(configured.title) && entries.length < 8) notes.push(`O título fala em 8, mas hoje só há ${entries.length} estilos reais: ajuste o título para não prometer o que não existe.`);
  return { ok: true, summary: `${shown} estilo(s) serão mostrados (${entries.length} disponíveis)`, notes };
}

export function statesStatus(region: RegionSlug): StructuredStatus {
  const states = getRegionHome(region).states;
  const ready = states.filter((s) => s.cityCount > 0);
  const pending = states.filter((s) => s.cityCount === 0);
  const notes = [`Estados com cidades e produtos reais: ${ready.map((s) => `${s.name} (${s.cityCount})`).join(", ") || "nenhum"}.`];
  if (pending.length > 0) notes.push(`Sem cidades com produtos nesta loja e por isso omitidos: ${pending.map((s) => s.name).join(", ")}.`);
  if (ready.length === 0) return { ok: false, summary: "Nenhum estado com produtos", notes: [...notes, "A seção não aparece na loja até o catálogo cobrir cidades de algum estado."] };
  return { ok: true, summary: `${ready.length} de ${states.length} estado(s) serão mostrados`, notes };
}

export function campaignStatus(region: RegionSlug): StructuredStatus {
  const crops = getRegionHome(region).campaignCrops.length;
  return { ok: true, summary: "Não depende do catálogo", notes: [crops > 0 ? `Recortes de camisetas reais disponíveis para o fundo: ${crops}.` : "Sem recortes de camisetas reais nesta região: use uma cor, um degradê ou uma imagem."] };
}

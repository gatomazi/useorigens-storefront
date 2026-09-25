import "server-only";
import { regionReadiness } from "../catalog/readiness";
import { REGIONS, type RegionSlug } from "../geo/regions";
import type { ScopeDoc } from "../site-config/schema";
import { collectionProblems, readabilityProblems, sourceStatus } from "./validate-draft";

/**
 * Why a region cannot be launched publicly yet (empty = it can). A region is launched only when it has a real catalog of its own, a home
 * with something to show, and valid sections; otherwise it stays in preview. This is the guard against a public page that is empty, shows
 * "0 cidades", or links nowhere. Purely local data (the catalog and collections snapshots and the draft): no network.
 */
export async function launchBlockers(region: Exclude<RegionSlug, "sul">, doc: ScopeDoc): Promise<string[]> {
  const name = REGIONS[region].name;
  const out: string[] = [];
  const readiness = regionReadiness(region);
  if (!readiness.ready) out.push(`o catálogo da loja ${name} cobre só ${readiness.coveredCities} de ${readiness.totalCities} cidades (mínimo 50%): sincronize o catálogo desta loja`);
  if (!doc.home) return [...out, "a home ainda não foi criada (use “Criar home inicial”)"];
  const active = doc.home.sections.filter((s) => s.active && s.template !== "footer");
  if (active.length === 0) out.push("não há seções ativas");
  out.push(...collectionProblems(doc), ...readabilityProblems(doc));
  const carousels = active.filter((s) => s.template === "product-carousel");
  const usable = carousels.filter((s) => {
    const status = sourceStatus(s, doc);
    return status && !status.problem && (status.products ?? 0) >= 3;
  });
  if (usable.length === 0) out.push("nenhuma seção de produtos com pelo menos 3 produtos reais da loja da região");
  return out;
}

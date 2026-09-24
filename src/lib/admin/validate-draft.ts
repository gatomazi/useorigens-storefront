import "server-only";
import { categoryLookup, MIN_USABLE_PRODUCTS } from "../catalog/collection-source";
import { findCollection, getStoreCollections } from "../catalog/collections-file";
import { getCatalog } from "../catalog/repository";
import { getRegionHome } from "../home";
import { readability, type ReadabilityIssue } from "./contrast";
import type { RegionSlug } from "../geo/regions";
import type { Scope, ScopeDoc, Section } from "../site-config/schema";

/**
 * What the editor shows next to each section, and what blocks a publish. Real data only: editorial-module counts come from the same
 * `getRegionHome` the storefront uses, collection counts from the collections snapshot INTERSECTED with the store's catalog (never
 * INK's reported total). A section whose source cannot resolve is a problem in the editor and is left OUT of the storefront (no empty
 * carousel) — publishing it is refused so nobody ships one by accident.
 */
export type SourceStatus = { label: string; products: number | null; problem: string | null };

const REASONS: Record<string, string> = {
  "ink-collections-not-synced": "coleções da INK ainda não sincronizadas (rode npm run collections:sync)",
  "collection-not-found": "a coleção não existe mais no snapshot sincronizado",
  "collection-unavailable": "a coleção está oculta na loja (segmentação interna)",
  "collection-has-no-products": "nenhum produto da coleção existe no catálogo local",
  "manual-source-not-implemented": "curadoria manual ainda não disponível",
};

const EDITORIAL_LABEL = { terra: "Módulo editorial · Da Nossa Terra", recreations: "Módulo editorial · Redesenhos", lenda: "Módulo editorial · Linha Lenda", dizeres: "Módulo editorial · Fala daqui", ddd: "Módulo editorial · DDD" } as const;

export function sourceStatus(section: Section, region: RegionSlug = "sul"): SourceStatus | null {
  const src = section.source;
  if (!src) return null;
  if (src.kind === "editorial-module") {
    const home = getRegionHome(region);
    const items = { terra: home.terra, recreations: home.recreations, lenda: home.feitoParaVoce, dizeres: home.fala, ddd: home.ddd }[src.key];
    return { label: EDITORIAL_LABEL[src.key], products: items.length, problem: items.length === 0 ? "o módulo não encontrou produtos no catálogo local" : null };
  }
  if (src.kind === "ink-category") {
    const collection = findCollection(src.store, src.collectionId);
    const label = collection ? `Coleção INK · ${collection.name}` : `Coleção INK #${src.collectionId}`;
    const lookup = categoryLookup(getCatalog().merch(region))(src.store, src.collectionId, src.limit);
    if (lookup.status !== "ok") return { label, products: null, problem: REASONS[lookup.reason] ?? lookup.reason };
    const eligible = collection?.merchProductIds.length ?? lookup.items.length;
    return { label, products: lookup.items.length, problem: eligible < MIN_USABLE_PRODUCTS ? `só ${eligible} produto(s) elegíveis (mínimo ${MIN_USABLE_PRODUCTS})` : null };
  }
  return { label: "Curadoria manual", products: null, problem: REASONS["manual-source-not-implemented"] };
}

/** Blocking problems for the ACTIVE sections of a document. */
export function collectionProblems(doc: ScopeDoc): string[] {
  const out: string[] = [];
  for (const s of doc.home?.sections ?? []) {
    if (!s.active || !s.source || s.source.kind === "editorial-module") continue;
    const status = sourceStatus(s, doc.scope === "global" ? "sul" : (doc.scope as Exclude<Scope, "global">));
    if (status?.problem) out.push(`"${s.title ?? s.id}": ${status.problem}`);
  }
  return out;
}

export const collectionsSyncedFor = (store: Parameters<typeof getStoreCollections>[0]) => getStoreCollections(store);

/** The text tone a section actually renders with: carousels follow their layout; the hero is dark text and the campaign white text by design. */
export function sectionTone(section: Section): "light" | "dark" | null {
  if (section.template === "product-carousel") return section.layout?.tone ?? "light";
  if (section.template === "hero") return "light";
  if (section.template === "campaign") return "dark";
  return null;
}

export function sectionReadability(section: Section): ReadabilityIssue[] {
  const tone = sectionTone(section);
  if (!tone) return [];
  const image = section.appearance.image;
  const hasImage = Boolean(image?.mobile || image?.desktop);
  // The campaign keeps its own dark surface (with product crops) when it has neither image nor fill, so only judge what is configured.
  if (section.template === "campaign" && !hasImage && section.appearance.fill.kind === "none") return [];
  return readability(section.appearance, tone, hasImage);
}

/** Blocking readability problems of the ACTIVE sections (warnings are shown in the editor but never stop a publish). */
export function readabilityProblems(doc: ScopeDoc): string[] {
  return (doc.home?.sections ?? []).filter((s) => s.active).flatMap((s) => sectionReadability(s).filter((i) => i.level === "blocking").map((i) => `"${s.title ?? s.id}": ${i.message}`));
}

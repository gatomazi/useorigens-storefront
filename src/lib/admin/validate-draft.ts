import "server-only";
import { categoryLookup, libraryEntries, MIN_USABLE_PRODUCTS } from "../catalog/collection-source";
import { findCollection } from "../catalog/collections-file";
import { getCatalog } from "../catalog/repository";
import { getRegionHome } from "../home";
import { REGIONS, type RegionSlug } from "../geo/regions";
import { enabledInternalIds } from "../site-config/collections-enabled";
import type { ScopeDoc, Section, Source } from "../site-config/schema";
import { readability, type ReadabilityIssue } from "./contrast";

/**
 * What the editor shows next to each section, and what blocks a publish. Real data only: editorial-module counts come from the same
 * `getRegionHome` the storefront uses; collection counts are the products that exist in the SAME store's catalog snapshot (never INK's
 * reported total). A section whose source cannot resolve is a problem in the editor and is left OUT of the storefront (no empty
 * carousel) — publishing it is refused so nobody ships one by accident.
 */
export type SourceStatus = { label: string; products: number | null; problem: string | null; internal?: boolean };

const REASONS: Record<string, string> = {
  "ink-collections-not-synced": "coleções da INK ainda não sincronizadas (rode npm run collections:sync)",
  "collection-not-found": "a coleção não existe mais no snapshot sincronizado",
  "collection-not-enabled": "coleção interna não habilitada no CMS (habilite na Biblioteca de coleções)",
  "collection-needs-resync": "registro antigo sem os produtos da coleção (rode npm run collections:sync de novo)",
  "collection-has-no-products": "nenhum produto da coleção existe no catálogo local",
  "manual-source-not-implemented": "curadoria manual ainda não disponível",
};

const EDITORIAL_LABEL = { terra: "Módulo editorial · Da Nossa Terra", recreations: "Módulo editorial · Redesenhos", lenda: "Módulo editorial · Linha Lenda", dizeres: "Módulo editorial · Fala daqui", ddd: "Módulo editorial · DDD" } as const;

const regionOf = (doc: ScopeDoc): RegionSlug => (doc.scope === "global" ? "sul" : (doc.scope as RegionSlug));

export function sourceStatus(section: Section, doc: ScopeDoc): SourceStatus | null {
  const src = section.source;
  if (!src) return null;
  const region = regionOf(doc);
  if (src.kind === "editorial-module") {
    const home = getRegionHome(region);
    const items = { terra: home.terra, recreations: home.recreations, lenda: home.feitoParaVoce, dizeres: home.fala, ddd: home.ddd }[src.key];
    return { label: EDITORIAL_LABEL[src.key], products: items.length, problem: items.length === 0 ? "o módulo não encontrou produtos no catálogo local" : null };
  }
  if (src.kind === "ink-category") {
    const collection = findCollection(src.store, src.collectionId);
    const label = collection ? `Coleção INK · ${collection.name}` : `Coleção INK #${src.collectionId}`;
    const catalog = getCatalog();
    const enabled = enabledInternalIds(doc, src.store);
    const lookup = categoryLookup((s) => catalog.productsOfStore(s), () => enabled)(src.store, src.collectionId, src.limit);
    const entry = libraryEntries(src.store, enabled).find((e) => e.id === src.collectionId);
    const internal = entry?.visibility === "internal";
    if (lookup.status !== "ok") return { label, products: null, internal, problem: REASONS[lookup.reason] ?? lookup.reason };
    return { label, products: lookup.items.length, internal, problem: entry && entry.matchedCount < MIN_USABLE_PRODUCTS ? `só ${entry.matchedCount} produto(s) elegíveis (mínimo ${MIN_USABLE_PRODUCTS})` : null };
  }
  return { label: "Curadoria manual", products: null, problem: REASONS["manual-source-not-implemented"] };
}

/** Why a collection cannot be used as a section source in this document, in Portuguese, or null when it can. Used by the actions BEFORE saving. */
export function sourceProblem(source: Source, doc: ScopeDoc): string | null {
  if (source.kind !== "ink-category") return null;
  // A region only uses collections of ITS OWN INK store: never another region's, whatever the form said.
  if (doc.scope !== "global" && source.store !== REGIONS[doc.scope as RegionSlug].storeKey) return "Essa coleção pertence a outra loja da INK: cada região usa só as coleções da própria loja.";
  const entry = libraryEntries(source.store, enabledInternalIds(doc, source.store)).find((e) => e.id === source.collectionId);
  if (!entry) return "Essa coleção não existe no snapshot sincronizado.";
  if (entry.selectable) return null;
  if (entry.reason === "needs-resync") return "Esse registro é de uma sincronização antiga; rode npm run collections:sync.";
  if (entry.reason === "too-few-products") return `Só ${entry.matchedCount} produto(s) dessa coleção existem no catálogo local (mínimo ${MIN_USABLE_PRODUCTS}).`;
  return "Coleção interna: habilite-a primeiro na Biblioteca de coleções.";
}

/** Blocking problems for the ACTIVE sections of a document. */
export function collectionProblems(doc: ScopeDoc): string[] {
  const out: string[] = [];
  for (const s of doc.home?.sections ?? []) {
    if (!s.active) continue;
    const name = `"${s.title ?? s.id}"`;
    if (s.source && s.source.kind !== "editorial-module") {
      const status = sourceStatus(s, doc);
      if (status?.problem) out.push(`${name}: ${status.problem}`);
    }
    // An internal collection has no verified public page: a "Ver todos" pointing at it would be an invented URL.
    if (s.cta?.dest.kind === "ink-collection") {
      const c = findCollection(s.cta.dest.store, s.cta.dest.collectionId);
      if (!c?.isAvailable) out.push(`${name}: o botão "Ver todos" aponta para uma coleção interna ou inexistente (sem página pública verificada)`);
    }
  }
  return out;
}

/** The text tone a section actually renders with: carousels follow their layout; the hero is dark text and the campaign white text by design. */
export function sectionTone(section: Section): "light" | "dark" | null {
  if (section.template === "product-carousel") return section.layout?.tone ?? "light";
  if (section.template === "hero") return "light";
  if (section.template === "campaign") return "dark";
  if (section.template === "city-styles" || section.template === "states") return section.layout?.tone ?? "light";
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

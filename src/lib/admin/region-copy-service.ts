import "server-only";
import { randomBytes } from "node:crypto";
import { getCollections } from "../catalog/collections-file";
import { completeMembers } from "../catalog/collections";
import { regionOfStoreProduct } from "../catalog/collection-source";
import { getCatalog } from "../catalog/repository";
import { commercePlan, storeForRegion } from "../catalog/commerce-mode";
import type { RegionSlug } from "../geo/regions";
import { HOME_THEME_LABEL } from "../site-config/home-themes";
import { bundleChecksum } from "../site-config/checksum";
import { homeThemeOf, type ScopeDoc } from "../site-config/schema";
import { platform } from "./platform";
import { buildRegionCopy, collectionCopyKey, copyRequirements, COPY_PARTS, suggestedCopyCollection, type CopyCollection, type CopyItem, type CopyPart, type CopyRequest, type CopyReview, type CopySource } from "./region-copy";
import { editableScopes } from "./scope";
import { canEdit, type Actor } from "./store/ports";
import { editingHomeTheme, loadWorkspace } from "./workspace";

export function copyCollections(region?: RegionSlug): CopyCollection[] {
  const target = region && commercePlan().effective === "single-store" ? storeForRegion(region) : null;
  const products = target ? getCatalog().productsOfStore(target) : null;
  return Object.entries(getCollections().stores).flatMap(([store, snapshot]) => (snapshot?.collections ?? []).map((collection) => {
    const { id, name, slug, isAvailable, needsResync } = collection;
    const matchedCount = store === target && products && region
      ? (completeMembers(collection) ?? collection.memberIds).filter((id) => regionOfStoreProduct(products, id) === region).length
      : collection.matchedCount;
    return { store: store as CopyCollection["store"], id, name, slug, isAvailable, matchedCount, ...(needsResync ? { needsResync } : {}) };
  }));
}

function describeSource(doc: ScopeDoc, part: CopyPart, to: RegionSlug, collections: CopyCollection[]): CopyItem[] {
  const items = part === "page"
    ? (doc.pages ?? []).filter((p) => !p.archived).map((p) => ({ id: p.id, label: p.title, detail: `${p.sections.length} seção(ões) · ${p.slug}` }))
    : part === "customizer"
      ? (doc.customizers ?? []).map((m) => ({ id: m.id, label: m.name, detail: `${m.fields.length} campo(s)${m.lineGroup ? " e grupo de linhas" : ""} · ${m.slug}` }))
      : part === "home" && !doc.home?.sections.length || part === "promotions" && !doc.promotions?.items.length
        ? []
        : [{ id: "", label: COPY_PARTS[part].label, detail: part === "home" ? `${doc.home!.sections.length} seções · tema ${HOME_THEME_LABEL[homeThemeOf(doc)]} em uso na origem` : part === "theme" ? `Paleta do tema ${HOME_THEME_LABEL[homeThemeOf(doc)]} em uso na origem` : part === "promotions" ? `${doc.promotions!.items.length} cupom(ns) e promoção(ões)` : "Configuração desta região" }];
  const targets = collections.filter((c) => c.store === storeForRegion(to));
  return items.map((item) => ({
    ...item,
    collections: copyRequirements(doc, part, item.id).map((ref) => {
      const original = collections.find((c) => c.store === ref.store && c.id === ref.collectionId);
      return { key: collectionCopyKey(ref), label: original?.name ?? `Coleção #${ref.collectionId}`, suggested: suggestedCopyCollection(original, targets, ref), products: ref.products, publicOnly: ref.publicOnly };
    }),
  }));
}

/** Only authorized source metadata reaches the browser; no source documents or analytics credentials are serialized. */
export async function regionCopySources(actor: Actor, scope: RegionSlug, part: CopyPart): Promise<{ sources: CopySource[]; collections: CopyCollection[] }> {
  if (!canEdit(actor, scope)) return { sources: [], collections: [] };
  const collections = copyCollections(scope);
  const sources = await Promise.all(editableScopes(actor).filter((r) => r !== scope).map(async (fromScope) => {
    const ws = await loadWorkspace(fromScope);
    return { scope: fromScope, working: describeSource(ws.doc, part, scope, collections), published: describeSource(ws.baseDoc, part, scope, collections) };
  }));
  return { sources, collections: collections.filter((c) => c.store === storeForRegion(scope)) };
}

const changedDraft = "O rascunho de destino mudou em outra aba. Recarregue a página e revise a cópia novamente.";

/** The same preparation runs for review and commit. Its checksum covers both workspaces, the mappings and the catalog used by the preview. */
async function prepareCopy(actor: Actor, request: CopyRequest) {
  if (!canEdit(actor, request.scope) || !canEdit(actor, request.fromScope)) {
    await platform().audit.record({ actor: actor.id, action: "access.denied", scope: request.scope, target: "region.copy", meta: { fromScope: request.fromScope } }).catch(() => undefined);
    return { ok: false as const, errors: ["Você precisa de permissão nas regiões de origem e destino para copiar a configuração."] };
  }
  const [destination, origin, global] = await Promise.all([loadWorkspace(request.scope), loadWorkspace(request.fromScope), request.part === "theme" ? loadWorkspace("global") : null]);
  if ((destination.record?.rev ?? null) !== request.rev) return { ok: false as const, errors: [changedDraft] };
  const source = request.sourceVersion === "published" ? origin.baseDoc : origin.doc;
  const globalDoc = request.sourceVersion === "published" ? global?.baseDoc : global?.doc;
  const collections = copyCollections(request.scope);
  const targetStore = storeForRegion(request.scope);
  const destinationTheme = request.part === "home" || request.part === "theme" ? await editingHomeTheme(destination.doc) : undefined;
  const checksum = bundleChecksum({ request, source, destination: destination.doc, destinationTheme, targetStore, globalTheme: globalDoc?.theme, collections });
  const plan = buildRegionCopy({ source, destination: destination.doc, destinationTheme, targetStore, global: globalDoc, part: request.part, sourceId: request.sourceId, mappings: request.mappings, collections, newId: () => randomBytes(6).toString("hex") });
  return plan.ok ? { ok: true as const, plan, checksum, destination } : plan;
}

export async function reviewRegionCopy(actor: Actor, request: CopyRequest): Promise<CopyReview> {
  const result = await prepareCopy(actor, request);
  return result.ok ? { ok: true, checksum: result.checksum, request, summary: result.plan.summary, warnings: result.plan.warnings } : result;
}

/** Saves only to the destination draft, with CAS; neither publishing nor writing the source is part of this operation. */
export async function saveRegionCopy(actor: Actor, request: CopyRequest, expectedChecksum: string): Promise<{ ok: true; focusId?: string } | { ok: false; errors: string[] }> {
  if (!expectedChecksum) return { ok: false, errors: ["Revise a cópia antes de confirmar."] };
  const result = await prepareCopy(actor, request);
  if (!result.ok) return result;
  if (result.checksum !== expectedChecksum) return { ok: false, errors: ["A origem, o destino ou as associações mudaram desde a revisão. Recarregue a página e revise a cópia novamente."] };
  const saved = await platform().drafts.save(request.scope, result.plan.doc, request.rev, result.destination.publishedReleaseId, actor.id);
  if (!saved.ok) return { ok: false, errors: [changedDraft] };
  await platform().audit.record({ actor: actor.id, action: "draft.save", scope: request.scope, target: "region.copy", meta: { fromScope: request.fromScope, sourceVersion: request.sourceVersion, part: request.part, sourceId: request.sourceId || null } }).catch(() => undefined);
  return { ok: true, ...(result.plan.focusId ? { focusId: result.plan.focusId } : {}) };
}

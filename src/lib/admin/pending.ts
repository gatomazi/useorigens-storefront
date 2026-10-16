import "server-only";
import { findCollection } from "../catalog/collections-file";
import type { RegionSlug } from "../geo/regions";
import type { CollectionRef, Customizer, Page, ScopeDoc } from "../site-config/schema";
import { diffDocs, type Change } from "./diff";
import { MODEL_STATE_LABEL, modelState, PAGE_STATE_LABEL, pageState, type ModelState, type PageState } from "./pages-view";
import type { Actor } from "./store/ports";
import { loadWorkspace, type Workspace } from "./workspace";

/**
 * What the person could publish right now, by target: the region document (home, menu, collections, region palette, coupons, region tracking),
 * each page and each personalization model (published one by one), and the global document (owner only). Read by the "Publicar" shortcut in the
 * panel's top bar and by the Publicar screen, so both always count the same things.
 */
export type PendingPage = { page: Page; state: PageState; stateLabel: string };
export type PendingModel = { model: Customizer; state: ModelState; stateLabel: string };
export type Pending = {
  region: { changes: Change[]; tracking: boolean; pending: boolean };
  pages: PendingPage[];
  models: PendingModel[];
  /** null for a person who cannot publish the global document (editors). */
  global: { changes: Change[]; pending: boolean } | null;
  count: number;
};

const json = (v: unknown) => JSON.stringify(v ?? null);
const nameOf = (ref: CollectionRef) => findCollection(ref.store, ref.collectionId)?.name ?? null;
const isPublic = (ref: CollectionRef) => findCollection(ref.store, ref.collectionId)?.isAvailable ?? false;

/** What a publish of the global document carries, in words: the parts of its draft that differ from what is published. Pure. */
export function globalParts(published: ScopeDoc, draft: ScopeDoc): string[] {
  const differs = (k: "theme" | "tracking" | "cards" | "mundo") => json(published[k]) !== json(draft[k]);
  return [differs("theme") ? "paleta da Use Origens" : null, differs("cards") ? "botão nos cards" : null, differs("mundo") ? "Meu Pequeno Mundo" : null, differs("tracking") ? "tracking global" : null].filter((x): x is string => x !== null);
}

/** The region document's own differences (pages and models are published separately and never count here). Pure on the two documents. */
export const regionChanges = (published: ScopeDoc, draft: ScopeDoc): Change[] => diffDocs(published, draft, nameOf, isPublic);

export async function pendingPublishes(scope: RegionSlug, actor: Actor, loaded?: { ws?: Workspace; global?: Workspace }): Promise<Pending> {
  const [ws, global] = await Promise.all([loaded?.ws ?? loadWorkspace(scope), actor.role === "owner" ? (loaded?.global ?? loadWorkspace("global")) : null]);
  const changes = regionChanges(ws.baseDoc, ws.doc);
  const tracking = json(ws.doc.tracking) !== json(ws.baseDoc.tracking);
  // A page or model that differs from the store: never published (an archived draft is not waiting for anything) or published with edits.
  const pages = (ws.doc.pages ?? [])
    .map((page) => ({ page, state: pageState(page, ws.baseDoc.pages?.find((p) => p.id === page.id)) }))
    .filter((r) => r.state === "draft" || r.state === "changed")
    .map((r) => ({ ...r, stateLabel: PAGE_STATE_LABEL[r.state] }));
  const models = (ws.doc.customizers ?? [])
    .map((model) => ({ model, state: modelState(model as never, ws.baseDoc.customizers?.find((m) => m.id === model.id) as never) }))
    .filter((r) => r.state === "draft" || r.state === "changed")
    .map((r) => ({ ...r, stateLabel: MODEL_STATE_LABEL[r.state] }));
  const globalChanges = global ? diffDocs(global.baseDoc, global.doc) : [];
  const globalPending = global ? global.dirty : false;
  const regionPending = changes.length > 0 || tracking;
  return {
    region: { changes, tracking, pending: regionPending },
    pages,
    models,
    global: global ? { changes: globalChanges, pending: globalPending } : null,
    count: (regionPending ? 1 : 0) + pages.length + models.length + (globalPending ? 1 : 0),
  };
}

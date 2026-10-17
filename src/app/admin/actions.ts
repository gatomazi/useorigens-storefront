"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { cookies, headers } from "next/headers";
import { requireAdmin, SESSION_COOKIE, SESSION_COOKIE_PATH } from "@/lib/admin/auth/guard";
import { deleteUpload, saveUpload } from "@/lib/admin/media";
import { describeUploadFailure } from "@/lib/admin/media/upload-errors";
import { platform } from "@/lib/admin/platform";
import { publishRelease, reconcileReleases, type PublishDeps } from "@/lib/admin/publishing";
import { publishDeps } from "@/lib/admin/ops";
import { globalParts } from "@/lib/admin/pending";
import { allow } from "@/lib/admin/auth/rate-limit";
import { syncCollections } from "@/lib/catalog/collections-sync";
import { beginSyncJob, SyncAlreadyRunningError } from "@/lib/catalog/sync-job";
import { runCatalogSyncJob } from "@/lib/catalog/sync-runner";
import { INK_STORES, tokenFor } from "@/lib/ink/config";
import { ALL_SCOPES } from "@/lib/admin/auth/authorize";
import { canEdit, type Actor } from "@/lib/admin/store/ports";
import { collectionPageSlug, stateCategoryCollections, stateSubcategoryChoice } from "@/lib/catalog/collection-source";
import { STATE_PAGE_SECTIONS, STATE_PAGE_SECTION_LABELS, type StatePageSection } from "@/lib/site-config/state-page-schema";
import { findCollection } from "@/lib/catalog/collections-file";
import { collectionState } from "@/lib/catalog/collections";
import { REGION_SLUGS, type RegionSlug } from "@/lib/geo/regions";
import { enabledInternalIds, inkCollectionLinks } from "@/lib/site-config/collections-enabled";
import { MUNDO_MODOS, type MundoModo } from "@/lib/site-config/mundo-schema";
import { DEFAULT_BUY_LABEL, HOME_THEMES, isUmaPencaSource, MAX_BUY_LABEL, MAX_COLLECTION_NOTE, maxSectionProducts, MIN_SECTION_PRODUCTS, type CollectionNote, type HomeThemeName, type ProductDisplay, type Scope, type TrackingConfig, type VendorSetting } from "@/lib/site-config/schema";
import { CARD_BUY_STYLE_NAME, postedBuyStyle } from "@/lib/site-config/cards-schema";
import { hasHomeTheme, HOME_THEME_LABEL } from "@/lib/site-config/home-themes";
import { editorialCollections } from "@/lib/catalog/editorial-collections";
import { sourceProblem } from "@/lib/admin/validate-draft";
import { parseCollectionArrangement, parseCollectionRef, parseFeaturedFields, parseGridTiles, parseSectionForm } from "@/lib/admin/section-form";
import { parseCustomizerForm, parseOrigin } from "@/lib/admin/customizer-form";
import { parsePageBackdrop } from "@/lib/admin/page-form";
import type { PublishTarget } from "@/lib/admin/publishing";
import { nextStatuses, productLinkFor, REQUEST_STATUSES, type RequestStatus } from "@/lib/customization/requests";
import type { PageKind } from "@/lib/site-config/schema";
import { legacyFeaturedRefs, resolveFeatured, searchFeaturedCandidates, type FeaturedCandidate } from "@/lib/hero-featured";
import { buildRegionSeed } from "@/lib/admin/region-seed";
import { STRUCTURED_TEMPLATES, type StructuredTemplate } from "@/lib/site-config/structured";
import { launchBlockers } from "@/lib/admin/launch";
import { isRegionScope, REGION_SCOPES, SCOPE_COOKIE, scopeName, scopeOf, storeOf } from "@/lib/admin/scope";
import { applyAndSave, discardDraft, EDIT_THEME_COOKIE, loadEditorWorkspace, loadWorkspace, type SaveOutcome } from "@/lib/admin/workspace";
import type { DraftOp } from "@/lib/admin/draft-ops";
import { parseNavigationForm, parseThemeForm, readableNavigationError } from "@/lib/admin/navigation-form";
import { themeProblems } from "@/lib/site-config/navigation";
import { readablePromotionError, rowsToConfig } from "@/lib/admin/promotions-form";
import { readableTopBarError, topBarFromForm } from "@/lib/admin/top-bar-form";
import { ARTICLE_KIND_LABELS, ARTICLE_KINDS } from "@/lib/umapenca/types";

/**
 * Every server action of the CMS. Each one authenticates and authorises on its own (`requireAdmin`: development guard or Railway session,
 * host, Origin, role, region) before doing anything — the proxy and the layout are not trusted as the only barrier — and answers with a
 * redirect carrying a short flash message, so a reload never re-submits a form. The REGION an action works on comes from the form it was
 * rendered with (`scope`), and the person must be allowed to edit exactly that region.
 */
const deps = (actor: Actor): PublishDeps => publishDeps(actor.id === "dev-local" ? null : actor.id);
const audit = (actor: Actor, action: Parameters<ReturnType<typeof platform>["audit"]["record"]>[0]["action"], scope: Scope, target?: string, meta?: Record<string, unknown>) =>
  platform().audit.record({ actor: actor.id, action, scope, target: target ?? null, meta: meta ?? null }).catch(() => undefined);

/** The signed-in person and the region this submission is about; refused (with an audit entry) unless they may edit that region. */
async function editScope(fd: FormData): Promise<{ actor: Actor; scope: RegionSlug }> {
  const actor = await requireAdmin({ mutation: true });
  const scope = await scopeOf(fd, actor);
  if (!canEdit(actor, scope)) {
    await audit(actor, "access.denied", scope, "region");
    redirect(`/admin?err=${encodeURIComponent("Você não tem permissão para editar essa região.")}`);
  }
  return { actor, scope };
}

const text = (fd: FormData, name: string) => (typeof fd.get(name) === "string" ? (fd.get(name) as string).trim() : "");
const revNumber = (fd: FormData): number | null => {
  const v = text(fd, "rev");
  return v === "" || v === "null" ? null : Number(v);
};

function back(target: string, flash: { ok?: string; err?: string[] }): never {
  const q = new URLSearchParams();
  if (flash.ok) q.set("ok", flash.ok);
  if (flash.err?.length) q.set("err", flash.err.join(" | ").slice(0, 900));
  const [path, hash] = target.split("#", 2); // the flash goes in the query, before the anchor
  redirect(`${path}${q.size ? `${path.includes("?") ? "&" : "?"}${q}` : ""}${hash ? `#${hash}` : ""}`);
}

/** `/admin/home[/<id>]` → the same place inside a page (`/admin/paginas/<page>[/secoes/<id>]`): the section actions serve the home and the pages alike. */
const inPagePath = (pageId: string, p: string): string => p.replace(/^\/admin\/home\/([^/?]+)/, `/admin/paginas/${pageId}/secoes/$1`).replace(/^\/admin\/home(?=$|\?)/, `/admin/paginas/${pageId}`);

/** `wrapped`: the op already says where it applies (a batch with a page op inside): it is not wrapped for the page again. */
async function run(fd: FormData, op: DraftOp, okMessage: string, returnTo: string, focusToEditor = false, wrapped = false): Promise<never> {
  const { actor, scope } = await editScope(fd);
  const pageId = text(fd, "page");
  const to = (p: string) => (pageId ? inPagePath(pageId, p) : p);
  const outcome: SaveOutcome = await applyAndSave(scope, pageId && !wrapped ? { type: "in-page", page: pageId, op } : op, revNumber(fd), actor);
  revalidatePath("/admin", "layout");
  if (!outcome.ok) back(to(returnTo), { err: outcome.errors });
  await audit(actor, "draft.save", scope, op.type);
  if (focusToEditor && outcome.focusId) back(to(`/admin/home/${outcome.focusId}`), { ok: okMessage });
  back(to(returnTo), { ok: okMessage });
}

/** The region switcher: remembers the choice (cookie, admin paths only) and returns to where the person was. */
export async function setScopeAction(fd: FormData) {
  const actor = await requireAdmin({ mutation: true });
  const wanted = text(fd, "scope");
  if (!isRegionScope(wanted) || !canEdit(actor, wanted)) back("/admin", { err: ["Você não tem permissão para essa região."] });
  (await cookies()).set(SCOPE_COOKIE, wanted, { httpOnly: true, secure: true, sameSite: "lax", path: "/admin", maxAge: 60 * 60 * 24 * 30 });
  // Back to the page the person was on (the switcher lives in the shell of every page): same-host /admin paths only.
  let from = text(fd, "from");
  if (!from) {
    try {
      from = new URL((await headers()).get("referer") ?? "").pathname;
    } catch {
      from = "/admin";
    }
  }
  redirect(from.startsWith("/admin") && !from.startsWith("//") && !from.includes("..") && !from.startsWith("/admin/preview") ? from.split("?")[0] : "/admin");
}

/** "Exibição" of a new product section: a grid, or (anything else) the usual carousel. */
const displayOf = (fd: FormData): ProductDisplay | undefined => (text(fd, "display") === "grid" ? "grid" : undefined);
const limitOf = (fd: FormData, display: ProductDisplay | undefined, fallback: number) => Math.min(maxSectionProducts(display), Math.max(MIN_SECTION_PRODUCTS, Math.round(Number(text(fd, "limit")) || fallback)));

export async function addCollectionSection(fd: FormData) {
  const { scope } = await editScope(fd);
  const at = text(fd, "page") ? inPagePath(text(fd, "page"), "/admin/home") : "/admin/home";
  const ref = parseCollectionRef(text(fd, "collection"));
  if (!ref) back(at, { err: ["Escolha uma coleção nas sugestões (digite parte do nome)."] });
  // Same rule the editor's autocomplete applies, enforced here too: never trust that the form only offered valid choices.
  const problem = sourceProblem({ kind: "ink-category", ...ref, order: "category", limit: 6 }, (await loadWorkspace(scope)).doc);
  if (problem) back(at, { err: [problem] });
  const display = displayOf(fd);
  const limit = limitOf(fd, display, 6);
  const collection = findCollection(ref.store, ref.collectionId);
  // "Ver todos" leads to the collection's page on the storefront (every product, paged), public and internal collections alike: INK is for the product,
  // the cart and the checkout. The button can still be pointed at INK's own page of a public collection in the editor.
  const cta = { cta: { label: "Ver todos", dest: { kind: "collection-page" as const, ...ref } } };
  return run(fd, { type: "add-carousel", title: text(fd, "title") || collection?.name || "Nova coleção", source: { kind: "ink-category", ...ref, order: "category", limit }, ...cta, ...(display ? { display } : {}) }, "Seção criada no rascunho.", "/admin/home", true);
}

/**
 * A carousel of Uma Penca articles (canecas, ecobags from the synced feed): no INK collection involved. Its "Ver todos" points at the region's
 * own `/outros-artigos` page. The "Crie a sua" first card is set afterwards in the section editor (same as any carousel).
 */
export async function addUmaPencaSection(fd: FormData) {
  const { scope } = await editScope(fd);
  const at = text(fd, "page") ? inPagePath(text(fd, "page"), "/admin/home") : "/admin/home";
  const kinds = ARTICLE_KINDS.filter((k) => fd.get(`kind_${k}`) !== null);
  if (kinds.length === 0) back(at, { err: ["Escolha ao menos um tipo: Canecas ou Ecobags."] });
  const display = displayOf(fd);
  const limit = limitOf(fd, display, 8);
  const title = text(fd, "title") || (kinds.length === 1 ? ARTICLE_KIND_LABELS[kinds[0]].plural : "Outros artigos");
  return run(fd, { type: "add-carousel", title, source: { kind: "umapenca", articleKinds: kinds, limit }, cta: { label: "Ver todos", dest: { kind: "route", path: `/${scope}/outros-artigos` } }, ...(display ? { display } : {}) }, "Seção da Uma Penca criada no rascunho.", "/admin/home", true);
}

/** The order a drag in the sections list ended with (JSON list of section ids); the op checks it is the same sections with the fixed ones in place. */
export async function reorderSections(fd: FormData) {
  let ids: unknown;
  try {
    ids = JSON.parse(text(fd, "order"));
  } catch {
    ids = null;
  }
  const at = text(fd, "page") ? inPagePath(text(fd, "page"), "/admin/home") : "/admin/home";
  if (!Array.isArray(ids) || ids.length > 200 || !ids.every((id) => typeof id === "string")) back(at, { err: ["Ordem inválida: recarregue a página e tente de novo."] });
  return run(fd, { type: "reorder", ids }, "Ordem alterada.", "/admin/home");
}

export async function setSectionActive(fd: FormData) {
  const active = text(fd, "active") === "true";
  return run(fd, { type: "set-active", id: text(fd, "id"), active }, active ? "Seção ativada." : "Seção ocultada.", "/admin/home");
}

/** "O Pódio" of the region on/off, as a DRAFT. Once published, off hides it (home and state pages) and the daily calculation skips the region. */
export async function setPodioAction(fd: FormData) {
  const enabled = text(fd, "enabled") === "true";
  const ok = enabled
    ? "Rascunho salvo: O Pódio ligado. Publique para valer na loja."
    : "Rascunho salvo: O Pódio desligado. Publique para ele sair da loja e o cálculo diário parar.";
  return run(fd, { type: "set-podio", enabled }, ok, "/admin/estados#podio");
}

/** Adds one structured home component (city styles, state chooser, regional campaign) to the DRAFT of the region the form was rendered for. */
export async function addStructuredSection(fd: FormData) {
  const template = text(fd, "template");
  if (!(STRUCTURED_TEMPLATES as readonly string[]).includes(template)) back("/admin/home", { err: ["Modelo de seção desconhecido."] });
  return run(fd, { type: "add-structured", template: template as StructuredTemplate }, "Seção criada no rascunho. Ajuste os textos e a aparência; nada vai para a loja até publicar.", "/admin/home", true);
}

export async function duplicateSection(fd: FormData) {
  return run(fd, { type: "duplicate", id: text(fd, "id") }, "Seção duplicada (a cópia começa oculta).", "/admin/home", true);
}

export async function removeSection(fd: FormData) {
  return run(fd, { type: "remove", id: text(fd, "id") }, "Seção removida do rascunho.", "/admin/home");
}

export async function saveSection(fd: FormData) {
  const { scope } = await editScope(fd);
  const id = text(fd, "id");
  // The home's sections of the theme being edited (a kept theme's too); pages are the same in every theme.
  const ws = await loadEditorWorkspace(scope);
  const pageId = text(fd, "page");
  const container = pageId ? ws.doc.pages?.find((p) => p.id === pageId)?.sections : ws.doc.home?.sections;
  const section = container?.find((s) => s.id === id);
  if (!section) back(pageId ? `/admin/paginas/${pageId}` : "/admin/home", { err: ["Seção não encontrada."] });
  const patch = parseSectionForm(fd, section);
  if (section.template === "hero") {
    // The hero's cards: edited as a list of real products of THIS region's store, seeded from the original Sul cards, or reset to the code's default.
    const mode = text(fd, "featured_mode");
    if (mode === "edit") {
      const { refs, invalid } = parseFeaturedFields(fd);
      if (invalid.length > 0) back(`/admin/home/${id}`, { err: [`Produto inválido em: ${invalid.join(", ")}.`] });
      const kept = new Set((section.featured ?? []).map((r) => `${r.store}:${r.productId}`));
      const slots = resolveFeatured(scope, refs);
      // A NEW choice must be a real, eligible product of this region's store; a reference already in the draft is kept even when a sync made it
      // ineligible (the panel flags it and the storefront omits it), so a resync never erases the owner's choice.
      const rejected = slots.filter((sl) => !sl.ok && !kept.has(`${sl.ref.store}:${sl.ref.productId}`));
      if (rejected.length > 0) back(`/admin/home/${id}`, { err: rejected.map((sl) => `Produto ${sl.ref.productId} não pode ser usado: ${sl.reason}.`) });
      patch.featured = refs;
    } else if (mode === "seed") patch.featured = legacyFeaturedRefs(scope);
    else if (mode === "reset" && scope === "sul") patch.featured = undefined;
  }
  if (section.template === "image-grid") {
    const { problems } = parseGridTiles(fd);
    if (problems.length > 0) back(pageId ? inPagePath(pageId, `/admin/home/${id}`) : `/admin/home/${id}`, { err: problems });
  }
  const problem = patch.source ? sourceProblem(patch.source, ws.doc) : null;
  if (problem) back(pageId ? inPagePath(pageId, `/admin/home/${id}`) : `/admin/home/${id}`, { err: [problem] });
  // The order list belongs to the COLLECTION: saved with the section, in one go, for every section built on it and its page.
  const arrangement = patch.source?.kind === "ink-category" ? parseCollectionArrangement(fd, patch.source) : null;
  if (patch.source?.kind === "ink-category" && arrangement) {
    const update: DraftOp = { type: "update", id, patch };
    const ops: DraftOp[] = [pageId ? { type: "in-page", page: pageId, op: update } : update, { type: "set-collection-arrangement", store: patch.source.store, collectionId: patch.source.collectionId, ...arrangement }];
    return run(fd, { type: "batch", ops }, "Rascunho salvo.", `/admin/home/${id}`, false, true);
  }
  return run(fd, { type: "update", id, patch }, "Rascunho salvo.", `/admin/home/${id}`);
}

/** Search of real, eligible products of the region's own store for a hero card position (bounded; local snapshot only, INK is never called). */
export async function searchHeroProductsAction(scopeValue: string, query: string): Promise<{ results: FeaturedCandidate[]; total: number; error?: string }> {
  const actor = await requireAdmin({ mutation: true });
  if (!isRegionScope(scopeValue) || !canEdit(actor, scopeValue)) return { results: [], total: 0, error: "Você não tem permissão para essa região." };
  if (!allow(`hero-search:${actor.id}`, 120, 60_000)) return { results: [], total: 0, error: "Muitas buscas seguidas. Aguarde um instante." };
  return searchFeaturedCandidates(scopeValue, String(query).slice(0, 60), 12);
}

/**
 * Creates the initial, lean home of Norte / Centro-Oeste from what REALLY exists for that region's own INK store (see region-seed.ts). Only
 * when the region has no home yet; nothing is copied from Sul.
 */
export async function initRegionHomeAction(fd: FormData) {
  const { scope } = await editScope(fd);
  if (scope === "sul") back("/admin/home", { err: ["A home do Sul já existe."] });
  const seed = buildRegionSeed(scope);
  return run(fd, { type: "init-home", sections: seed.sections }, `Home inicial criada no rascunho (${seed.collections} coleção(ões) real(is)).${seed.notes.length ? ` ${seed.notes.join(" ")}` : ""}`, "/admin/home");
}

/**
 * Library: enable or disable ONE internal collection of THIS region's INK store. Explicit, individual, reversible; nothing is sent to INK.
 * Enabling requires the collection to exist, be internal, belong to the region's own store, and have enough real products; disabling is refused
 * (with the list of sections) while a section uses it. `q`, `f` and `from` only carry the library's own filter and the "back to where I was" link.
 */
export async function setCollectionEnabledAction(fd: FormData) {
  const { actor, scope } = await editScope(fd);
  const ref = parseCollectionRef(text(fd, "ref"));
  const enable = text(fd, "enabled") === "true";
  const from = text(fd, "from");
  const q = new URLSearchParams();
  for (const k of ["q", "f"]) if (text(fd, k)) q.set(k, text(fd, k));
  if (from.startsWith("/admin/")) q.set("from", from);
  const to = `/admin/colecoes${q.size ? `?${q}` : ""}`;
  if (!ref || ref.store !== storeOf(scope)) back(to, { err: [`Esta coleção pertence a outra loja da INK: a região ${scopeName(scope)} só usa coleções da própria loja.`] });
  const record = findCollection(ref.store, ref.collectionId);
  if (!record) back(to, { err: ["Coleção não encontrada no snapshot sincronizado."] });
  if (record.isAvailable) back(to, { err: ["Coleções públicas já podem ser usadas; só as internas precisam ser habilitadas."] });
  if (enable) {
    const state = collectionState(record, new Set());
    if (!state.eligible) back(to, { err: [state.reason === "needs-resync" ? "Registro antigo: sincronize as coleções antes de habilitar." : `Só ${record.matchedCount} produto(s) dessa coleção existem no catálogo local (mínimo 3).`] });
  }
  const outcome = await applyAndSave(scope, { type: "set-collection-enabled", ...ref, enabled: enable }, revNumber(fd), actor);
  revalidatePath("/admin", "layout");
  if (!outcome.ok) back(to, { err: outcome.errors });
  const enabledNow = enabledInternalIds((await loadWorkspace(scope)).doc, ref.store).has(ref.collectionId);
  back(to, { ok: enabledNow ? `“${record.name}” habilitada para uso no CMS (a INK não foi alterada).` : `“${record.name}” desabilitada.` });
}

const MENU_POSITIONS = new Set(["none", "top", "more"]);

/** The collection menu lives on the Menu screen (Navegação), next to the rest of the store's menu. */
const MENU_SCREEN = "/admin/navegacao";

/**
 * Menu: where ONE collection appears in the region's collection menu (the storefront header and the navbar the Worker draws on the INK product pages):
 * "Não exibir", "Topo" or "Categorias". Independent of "enabled for the home". A collection can enter only if it can be linked somewhere: a page of ours
 * (public, or internal and enabled, with enough products) or, for the INK navbar, a public INK page with products. Nothing goes public until the draft is
 * published.
 */
export async function setCollectionMenuPositionAction(fd: FormData) {
  const { actor, scope } = await editScope(fd);
  const ref = parseCollectionRef(text(fd, "ref"));
  const position = text(fd, "position");
  const to = MENU_SCREEN;
  if (!ref || ref.store !== storeOf(scope)) back(to, { err: [`Esta coleção pertence a outra loja da INK: a região ${scopeName(scope)} só usa coleções da própria loja.`] });
  if (!MENU_POSITIONS.has(position)) back(to, { err: ["Posição inválida."] });
  const record = findCollection(ref.store, ref.collectionId);
  if (!record) back(to, { err: ["Coleção não encontrada no snapshot sincronizado."] });
  if (position !== "none") {
    const ws = await loadWorkspace(scope);
    const onSite = collectionPageSlug(ws.doc, ref.store, ref.collectionId) !== null;
    const onInk = record.isAvailable && record.matchedCount >= 1;
    if (!onSite && !onInk) {
      back(to, { err: [record.isAvailable ? "Esta coleção não tem produtos no catálogo local; ela não apareceria no menu." : "Coleção interna: ela entra no menu do site depois de habilitada no CMS, e precisa de pelo menos 3 produtos."] });
    }
  }
  const outcome = await applyAndSave(scope, { type: "set-collection-menu-position", ...ref, position: position as "none" | "top" | "more", isPublic: record.isAvailable }, revNumber(fd), actor);
  revalidatePath("/admin", "layout");
  if (!outcome.ok) back(to, { err: outcome.errors });
  const where = position === "top" ? "vai para o topo do menu" : position === "more" ? "fica em Categorias" : "sai do menu";
  back(`${to}#menu-colecoes`, { ok: `“${record.name}” ${where} depois que você publicar.` });
}

/** Menu: one step left or right on the bar. */
export async function moveCollectionMenuAction(fd: FormData) {
  const { actor, scope } = await editScope(fd);
  const ref = parseCollectionRef(text(fd, "ref"));
  const direction = text(fd, "direction");
  const to = MENU_SCREEN;
  if (!ref || ref.store !== storeOf(scope)) back(to, { err: ["Coleção de outra loja da INK."] });
  if (direction !== "up" && direction !== "down") back(to, { err: ["Direção inválida."] });
  const outcome = await applyAndSave(scope, { type: "move-collection-menu", ...ref, direction }, revNumber(fd), actor);
  revalidatePath("/admin", "layout");
  if (!outcome.ok) back(to, { err: outcome.errors });
  back(`${to}#menu-colecoes`, { ok: "Ordem do topo alterada (vale depois que você publicar)." });
}

/** "Página do estado" → Categorias: a collection becomes (or stops being) a category of the region's state pages. The first edit starts from the menu bar. */
export async function setStateCategoryAction(fd: FormData) {
  const { actor, scope } = await editScope(fd);
  const ref = parseCollectionRef(text(fd, "ref"));
  const to = "/admin/estados";
  if (!ref || ref.store !== storeOf(scope)) back(to, { err: ["Coleção de outra loja da INK."] });
  const on = text(fd, "on") === "1";
  const base = stateCategoryCollections(scope, (await loadWorkspace(scope)).doc).records.map((c) => ({ store: storeOf(scope), collectionId: c.id }));
  const outcome = await applyAndSave(scope, { type: "set-state-category", ...ref, on, base }, revNumber(fd), actor);
  revalidatePath("/admin", "layout");
  if (!outcome.ok) back(to, { err: outcome.errors });
  back(`${to}#estado-categorias`, { ok: on ? "Categoria incluída na página do estado (vale depois que você publicar)." : "Categoria tirada da página do estado (vale depois que você publicar)." });
}

export async function moveStateCategoryAction(fd: FormData) {
  const { actor, scope } = await editScope(fd);
  const ref = parseCollectionRef(text(fd, "ref"));
  const direction = text(fd, "direction");
  const to = "/admin/estados";
  if (!ref || ref.store !== storeOf(scope)) back(to, { err: ["Coleção de outra loja da INK."] });
  if (direction !== "up" && direction !== "down") back(to, { err: ["Direção inválida."] });
  const base = stateCategoryCollections(scope, (await loadWorkspace(scope)).doc).records.map((c) => ({ store: storeOf(scope), collectionId: c.id }));
  const outcome = await applyAndSave(scope, { type: "move-state-category", ...ref, direction, base }, revNumber(fd), actor);
  revalidatePath("/admin", "layout");
  if (!outcome.ok) back(to, { err: outcome.errors });
  back(`${to}#estado-categorias`, { ok: "Ordem das categorias alterada (vale depois que você publicar)." });
}

export async function resetStateCategoriesAction(fd: FormData) {
  return run(fd, { type: "reset-state-categories" }, "As categorias da página do estado voltam a ser as do topo do menu (vale depois que você publicar).", "/admin/estados#estado-categorias");
}

/** "Página do estado" → Subcategorias: takes a public collection out of the automatic subcategories (or puts it back), or brings an internal one in. */
export async function setStateSubcategoryAction(fd: FormData) {
  const { actor, scope } = await editScope(fd);
  const ref = parseCollectionRef(text(fd, "ref"));
  const to = "/admin/estados";
  if (!ref || ref.store !== storeOf(scope)) back(to, { err: ["Coleção de outra loja da INK."] });
  const record = findCollection(ref!.store, ref!.collectionId);
  if (!record) back(to, { err: ["Coleção não encontrada nas coleções sincronizadas."] });
  const on = text(fd, "on") === "1";
  const base = stateSubcategoryChoice(scope, (await loadWorkspace(scope)).doc);
  const outcome = await applyAndSave(scope, { type: "set-state-subcategory", ...ref, on, isPublic: record!.isAvailable, base }, revNumber(fd), actor);
  revalidatePath("/admin", "layout");
  if (!outcome.ok) back(to, { err: outcome.errors });
  back(`${to}#estado-subcategorias`, { ok: on ? `“${record!.name}” está nas subcategorias (vale depois que você publicar).` : `“${record!.name}” saiu das subcategorias: os produtos dela ficam na categoria (vale depois que você publicar).` });
}

export async function resetStateSubcategoriesAction(fd: FormData) {
  return run(fd, { type: "reset-state-subcategories" }, "As subcategorias da página do estado voltam ao automático (vale depois que você publicar).", "/admin/estados#estado-subcategorias");
}

/** "Página do estado": shows or hides a section that is not built from collections ("Destaques", "Escolha o estilo", "Regiões e cidades"). */
export async function setStatePageSectionAction(fd: FormData) {
  const section = text(fd, "section");
  const shown = text(fd, "shown") === "true";
  const to = "/admin/estados#estado-secoes";
  if (!(STATE_PAGE_SECTIONS as readonly string[]).includes(section)) back(to, { err: ["Seção desconhecida."] });
  const label = STATE_PAGE_SECTION_LABELS[section as StatePageSection];
  return run(fd, { type: "set-state-page-section", section: section as StatePageSection, shown }, `Rascunho salvo: “${label}” ${shown ? "volta para" : "sai da"} página do estado. Publique para valer na loja.`, to);
}

/** Menu: a region from before the collection menu keeps what it shows and the INK navbar starts following it (once published). */
const HOME_THEME_SCREENS = ["/admin/home", "/admin/aparencia"] as const;
const themeScreen = (fd: FormData) => {
  const to = text(fd, "to");
  return (HOME_THEME_SCREENS as readonly string[]).includes(to) ? to : "/admin/home";
};

/**
 * Which home theme the panel EDITS in this region (Home and Aparência show and save that theme's sections and palette). Choosing one the region does not
 * have yet creates it (the editorial one is built from the current sections and the region's real collections) WITHOUT putting it on the store.
 */
export async function editHomeThemeAction(fd: FormData) {
  const { actor, scope } = await editScope(fd);
  const theme = text(fd, "home_theme") as HomeThemeName;
  const here = themeScreen(fd);
  if (!(HOME_THEMES as readonly string[]).includes(theme)) back(here, { err: ["Tema desconhecido."] });
  const ws = await loadWorkspace(scope);
  let created = false;
  if (!hasHomeTheme(ws.doc, theme)) {
    const outcome = await applyAndSave(scope, { type: "create-home-theme", theme, collections: editorialCollections(scope, ws.doc) }, revNumber(fd), actor);
    if (!outcome.ok) back(here, { err: outcome.errors });
    await audit(actor, "draft.save", scope, `create-home-theme:${theme}`);
    created = true;
  }
  (await cookies()).set(EDIT_THEME_COOKIE, theme, { httpOnly: true, secure: true, sameSite: "lax", path: "/admin", maxAge: 60 * 60 * 24 * 30 });
  revalidatePath("/admin", "layout");
  back(`${here}${here === "/admin/aparencia" ? "#tema-da-home" : ""}`, { ok: created ? `Tema ${HOME_THEME_LABEL[theme]} criado no rascunho, a partir das seções atuais. Agora você edita as seções e as cores dele; a loja continua no tema de antes até você escolher este para a loja e publicar.` : `Editando o tema ${HOME_THEME_LABEL[theme]}: as seções e as cores mostradas são as dele.` });
}

/**
 * The home theme the STORE uses (in the draft; live once the region is published). The current theme's sections and palette are kept; the chosen one's
 * come in (created first if the region does not have it). The panel goes on editing the theme it was editing.
 */
export async function setHomeThemeAction(fd: FormData) {
  const { actor, scope } = await editScope(fd);
  const theme = text(fd, "home_theme") as HomeThemeName;
  const here = themeScreen(fd);
  if (!(HOME_THEMES as readonly string[]).includes(theme)) back(here, { err: ["Tema desconhecido."] });
  const ws = await loadWorkspace(scope);
  const collections = theme === "editorial" ? editorialCollections(scope, ws.doc) : undefined;
  const outcome = await applyAndSave(scope, { type: "set-home-theme", theme, collections }, revNumber(fd), actor);
  revalidatePath("/admin", "layout");
  if (!outcome.ok) back(here, { err: outcome.errors });
  await audit(actor, "draft.save", scope, `set-home-theme:${theme}`);
  back(`${here}${here === "/admin/aparencia" ? "#tema-da-home" : ""}`, { ok: `Rascunho: a loja de ${scopeName(scope)} passa a usar o tema ${HOME_THEME_LABEL[theme]} quando a região for publicada. As seções e as cores do outro tema ficam guardadas.` });
}

/**
 * Navegação: the short descriptions under the collections' names in the open menus (one line each, `note_<store>:<id>`; empty = none). Saved in
 * the region's draft and published with it.
 */
export async function saveCollectionNotesAction(fd: FormData) {
  const { actor, scope } = await editScope(fd);
  const descriptions: CollectionNote[] = [];
  for (const [name, value] of fd.entries()) {
    const ref = name.startsWith("note_") ? parseCollectionRef(name.slice(5)) : null;
    const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, MAX_COLLECTION_NOTE) : "";
    if (ref && text) descriptions.push({ ...ref, text });
  }
  const outcome = await applyAndSave(scope, { type: "set-collection-descriptions", descriptions }, revNumber(fd), actor);
  revalidatePath("/admin", "layout");
  if (!outcome.ok) back(MENU_SCREEN, { err: outcome.errors });
  await audit(actor, "draft.save", scope, "set-collection-descriptions");
  back(`${MENU_SCREEN}#descricoes-colecoes`, { ok: `Rascunho salvo: ${descriptions.length === 0 ? "nenhuma coleção com descrição" : descriptions.length === 1 ? "1 coleção com descrição" : `${descriptions.length} coleções com descrição`} no menu. Publique para valer na loja.` });
}

export async function adoptCollectionMenuAction(fd: FormData) {
  const { actor, scope } = await editScope(fd);
  const to = MENU_SCREEN;
  const outcome = await applyAndSave(scope, { type: "adopt-collection-menu" }, revNumber(fd), actor);
  revalidatePath("/admin", "layout");
  if (!outcome.ok) back(to, { err: outcome.errors });
  back(`${to}#menu-colecoes`, { ok: "A navbar da INK passa a seguir este menu depois que você publicar." });
}

export async function discardDraftAction(fd: FormData) {
  const { actor, scope } = await editScope(fd);
  await discardDraft(scope);
  await audit(actor, "draft.discard", scope);
  revalidatePath("/admin", "layout");
  back("/admin/publicar", { ok: "Rascunho descartado: o editor voltou ao que está publicado." });
}

/** Everything the public site caches that a publish can change: the region layouts/pages and each region's city-search index. */
const revalidateStorefront = async () => {
  revalidatePath("/[region]", "layout");
  for (const region of REGION_SLUGS) revalidatePath(`/api/cidades/${region}`);
};

const publishError = (error: unknown) => ({ ok: false as const, errors: [error instanceof Error && error.message.includes("in flight") ? "Já há uma publicação em andamento. Aguarde alguns segundos e tente de novo." : "Não foi possível publicar agora. Nada mudou na loja."] });

export async function publishAction(fd: FormData) {
  const { actor, scope } = await editScope(fd);
  const ws = await loadWorkspace(scope);
  // A publish left `pending` by a crashed request would block this one until the reconciler fails it: repair first.
  await reconcileReleases(deps(actor), revalidateStorefront).catch(() => undefined);
  const result = await publishRelease(deps(actor), { kind: "publish", doc: ws.doc, note: text(fd, "note").slice(0, 200) || undefined, confirmTracking: text(fd, "confirmTracking") === "on" }, revalidateStorefront).catch(publishError);
  revalidatePath("/admin", "layout");
  if (!result.ok) back("/admin/publicar", { err: result.errors });
  const o = result.outcome;
  await audit(actor, o.status === "failed" ? "publish.failed" : "publish", scope, o.releaseId, { status: o.status });
  const where = platform().mode === "prod" ? "Publicado" : "Publicado no sandbox local";
  if (o.status === "published") back("/admin/publicar", { ok: `${where} (release ${o.releaseId}).` });
  if (o.status === "failed") back("/admin/publicar", { err: ["A publicação falhou ao gravar o arquivo; a versão anterior continua no ar."] });
  back("/admin/publicar", { ok: `Publicação concluída com aviso (${o.status}); o reconciliador corrige na próxima abertura.` });
}

/**
 * Launches or recalls a region PUBLICLY (Norte / Centro-Oeste): owner only. Both are ordinary publishes of that region's document with the
 * `launched` flag set, so they are per region (nothing of the other regions or the catalog moves), reversible (recall, or restore a release)
 * and audited. Launching is refused while the region is not really ready (see launch.ts).
 */
export async function setRegionLaunchAction(fd: FormData) {
  const actor = await requireAdmin({ mutation: true, owner: true });
  const scope = await scopeOf(fd, actor);
  if (scope === "sul") back("/admin/publicar", { err: ["O Sul já é público; não há o que lançar."] });
  const launch = text(fd, "launch") === "true";
  const before = await loadWorkspace(scope);
  if (launch) {
    const blockers = await launchBlockers(scope, before.doc);
    if (blockers.length > 0) back("/admin/publicar", { err: [`A região ${scopeName(scope)} ainda não pode ser lançada: ${blockers.join(" · ")}`] });
  }
  const saved = await applyAndSave(scope, { type: "set-launched", launched: launch }, before.record?.rev ?? null, actor);
  if (!saved.ok) back("/admin/publicar", { err: saved.errors });
  const ws = await loadWorkspace(scope);
  await reconcileReleases(deps(actor), revalidateStorefront).catch(() => undefined);
  const result = await publishRelease(deps(actor), { kind: "publish", doc: ws.doc, note: launch ? `Lançamento público de ${scopeName(scope)}` : `Região ${scopeName(scope)} recolhida (volta à prévia)`, confirmTracking: text(fd, "confirmTracking") === "on" }, revalidateStorefront).catch(publishError);
  revalidatePath("/admin", "layout");
  if (!result.ok) back("/admin/publicar", { err: result.errors });
  await audit(actor, "publish", scope, result.outcome.releaseId, { status: result.outcome.status, launched: launch });
  back("/admin/publicar", { ok: launch ? `${scopeName(scope)} lançada publicamente (release ${result.outcome.releaseId}).` : `${scopeName(scope)} recolhida: deixou de ser pública (release ${result.outcome.releaseId}).` });
}

/** Restores the state of ONE region from an earlier release, as a new release; the other regions' published state is left exactly as it is. */
export async function rollbackAction(fd: FormData) {
  const { actor, scope } = await editScope(fd);
  const toReleaseId = text(fd, "release");
  await reconcileReleases(deps(actor), revalidateStorefront).catch(() => undefined);
  const result = await publishRelease(deps(actor), { kind: "rollback", toReleaseId, scope, note: `Restaurada a versão ${toReleaseId} (${scopeName(scope)})`, confirmTracking: text(fd, "confirmTracking") === "on" }, revalidateStorefront).catch(() => ({ ok: false as const, errors: ["Não foi possível restaurar agora. Nada mudou na loja."] }));
  if (!result.ok) back("/admin/publicar", { err: result.errors });
  // The working draft follows the restored version so the editor shows what is now live.
  await discardDraft(scope);
  await audit(actor, "rollback", scope, toReleaseId, { status: result.outcome.status });
  revalidatePath("/admin", "layout");
  back("/admin/publicar", { ok: `${scopeName(scope)}: versão ${toReleaseId} restaurada como nova publicação${platform().mode === "prod" ? "" : " no sandbox local"}.` });
}

/** Deletes ONE release from the history (owner only, explicit confirmation). Never the live one; audited. The database migration 0003 allows it. */
export async function deleteReleaseAction(fd: FormData) {
  const actor = await requireAdmin({ mutation: true, owner: true });
  const id = text(fd, "release");
  if (text(fd, "confirmDelete") !== "on") back("/admin/publicar", { err: [`Marque a confirmação para apagar a release ${id}.`] });
  const result = await platform().releases.remove(id);
  revalidatePath("/admin", "layout");
  if (!result.ok) back("/admin/publicar", { err: [result.error] });
  await audit(actor, "release.delete", "global", id);
  back("/admin/publicar", { ok: `Release ${id} apagada do histórico.` });
}

export async function reconcileAction(fd: FormData) {
  const { actor, scope } = await editScope(fd);
  const done = await reconcileReleases(deps(actor), revalidateStorefront);
  if (done.length) await audit(actor, "reconcile", scope, undefined, { actions: done });
  revalidatePath("/admin", "layout");
  back("/admin/publicar", { ok: done.length ? `Reconciliação aplicada: ${done.join(", ")}.` : "Nada a reconciliar: arquivo, registro e cache estão coerentes." });
}

// ── Tracking (Meta Pixel / GA4): global (owner) and per region ────────────────────────────────────────────────

const VENDOR_MODES = ["inherit", "override", "disabled", "legacy"] as const;

function vendorFromForm(fd: FormData, tool: "meta" | "ga4", scope: Scope): VendorSetting | string {
  const mode = text(fd, `${tool}_mode`);
  const id = text(fd, `${tool}_id`).toUpperCase().replace(/^G-/, "G-");
  if (!(VENDOR_MODES as readonly string[]).includes(mode)) return "Escolha uma opção válida.";
  if (scope === "global") {
    // The global layer is either ACTIVE with an ID, or inactive (optionally remembering an ID for later).
    if (mode === "override") return id ? { mode: "override", id } : "Informe o ID para ativar o global.";
    return id ? { mode: "disabled", id } : { mode: "disabled" };
  }
  if (mode === "override") return id ? { mode: "override", id } : "Informe o ID próprio (ou escolha herdar / desligar).";
  return { mode: mode as "inherit" | "disabled" | "legacy" };
}

/** Saves the tracking configuration of one document (draft only: nothing reaches visitors until it is published and confirmed). */
export async function saveTrackingAction(fd: FormData) {
  const actor = await requireAdmin({ mutation: true });
  const target = text(fd, "scope");
  const scope: Scope | null = target === "global" ? "global" : isRegionScope(target) ? target : null;
  if (!scope) back("/admin/tracking", { err: ["Documento de tracking inválido."] });
  if (scope === "global" ? actor.role !== "owner" : !canEdit(actor, scope)) {
    await audit(actor, "access.denied", scope, "tracking");
    back("/admin/tracking", { err: [scope === "global" ? "Só o owner altera o tracking global." : "Você não tem permissão para essa região."] });
  }
  const meta = vendorFromForm(fd, "meta", scope);
  const ga4 = vendorFromForm(fd, "ga4", scope);
  if (typeof meta === "string") back("/admin/tracking", { err: [`Meta Pixel: ${meta}`] });
  if (typeof ga4 === "string") back("/admin/tracking", { err: [`GA4: ${ga4}`] });
  const tracking: TrackingConfig = { meta, ga4 };
  const outcome = await applyAndSave(scope, { type: "set-tracking", tracking }, revNumber(fd), actor);
  revalidatePath("/admin", "layout");
  if (!outcome.ok) back("/admin/tracking", { err: outcome.errors.map((e) => e.replace(/^doc\.tracking\./, "").replace("invalid id format for this vendor", "formato de ID inválido (Meta: só números; GA4: G-XXXXXXXXXX)")) });
  await audit(actor, "draft.save", scope, "set-tracking");
  back("/admin/tracking", { ok: scope === "global" ? "Rascunho de tracking salvo. O tracking global é publicado em Publicar → Configuração global, com a confirmação dos IDs efetivos." : "Rascunho de tracking salvo. Nada muda na loja até você publicar e confirmar os IDs efetivos." });
}

// ── Navegação e Aparência (menu por região; paleta global ou por região) ─────────────────────────────────────────

/** Saves the navigation of a region as a DRAFT (nothing reaches the store until it is published from "Publicar"). */
export async function saveNavigationAction(fd: FormData) {
  const { actor, scope } = await editScope(fd);
  const parsed = parseNavigationForm(fd, scope);
  if (!parsed.ok) back("/admin/navegacao", { err: parsed.errors });
  const outcome = await applyAndSave(scope, { type: "set-navigation", navigation: parsed.value }, revNumber(fd), actor);
  revalidatePath("/admin", "layout");
  if (!outcome.ok) back("/admin/navegacao", { err: outcome.errors.map(readableNavigationError) });
  await audit(actor, "draft.save", scope, "set-navigation");
  back("/admin/navegacao", { ok: `Rascunho da navegação de ${scopeName(scope)} salvo. Nada muda na loja até você publicar.` });
}

/** Back to the default menu (default labels, order and visibility) as a draft. */
export async function resetNavigationAction(fd: FormData) {
  const { actor, scope } = await editScope(fd);
  const outcome = await applyAndSave(scope, { type: "set-navigation", navigation: null }, revNumber(fd), actor);
  revalidatePath("/admin", "layout");
  if (!outcome.ok) back("/admin/navegacao", { err: outcome.errors });
  await audit(actor, "draft.save", scope, "set-navigation");
  back("/admin/navegacao", { ok: "Navegação padrão restaurada no rascunho. Publique para valer na loja." });
}

/** Saves a palette as a DRAFT: the global one (owner only) or a region's. Contrast under AA is reported, never silently accepted; under 3:1 it cannot be published. */
export async function saveThemeAction(fd: FormData) {
  const actor = await requireAdmin({ mutation: true });
  const target = text(fd, "scope");
  const scope: Scope | null = target === "global" ? "global" : isRegionScope(target) ? target : null;
  if (!scope) back("/admin/aparencia", { err: ["Paleta inválida."] });
  if (scope === "global" ? actor.role !== "owner" : !canEdit(actor, scope)) {
    await audit(actor, "access.denied", scope, "theme");
    back("/admin/aparencia", { err: [scope === "global" ? "Só o owner altera a paleta da Use Origens." : "Você não tem permissão para essa região."] });
  }
  const parsed = parseThemeForm(fd, scope);
  if (!parsed.ok) back("/admin/aparencia", { err: parsed.errors });
  const outcome = await applyAndSave(scope, { type: "set-theme", theme: parsed.value }, revNumber(fd), actor);
  revalidatePath("/admin", "layout");
  if (!outcome.ok) back("/admin/aparencia", { err: outcome.errors });
  await audit(actor, "draft.save", scope, "set-theme");
  const saved = (await loadEditorWorkspace(scope)).doc; // the palette of the home theme being edited
  const problems = saved.theme ? themeProblems(scope, saved, (await loadWorkspace("global")).doc) : { blocking: [], warnings: [] };
  const what = scope === "global" ? "da Use Origens" : `de ${scopeName(scope)}`;
  if (problems.blocking.length > 0) back("/admin/aparencia", { err: [`Rascunho ${what} salvo, mas NÃO poderá ser publicado assim:`, ...problems.blocking] });
  if (problems.warnings.length > 0) back("/admin/aparencia", { ok: `Rascunho ${what} salvo. Atenção ao contraste: ${problems.warnings.join(" · ")}` });
  back("/admin/aparencia", { ok: `Rascunho da aparência ${what} salvo. Nada muda na loja até você publicar.` });
}

/**
 * Publishes the GLOBAL document (owner only), from Publicar: the Use Origens palette, the cards' button, Meu Pequeno Mundo and the global tracking, all
 * at once (they are one document). Regions that inherit change together, so a change of an effective tracking ID needs the confirmation.
 */
export async function publishGlobalAction(fd: FormData) {
  const actor = await requireAdmin({ mutation: true, owner: true });
  const ws = await loadWorkspace("global");
  const parts = globalParts(ws.baseDoc, ws.doc);
  const here = "/admin/publicar"; // the flash is at the top of the screen: no anchor, so it is seen
  await reconcileReleases(deps(actor), revalidateStorefront).catch(() => undefined);
  const result = await publishRelease(deps(actor), { kind: "publish", doc: ws.doc, note: text(fd, "note").slice(0, 200) || `Configuração global${parts.length ? `: ${parts.join(", ")}` : ""}`, confirmTracking: text(fd, "confirmTracking") === "on" }, revalidateStorefront).catch(publishError);
  revalidatePath("/admin", "layout");
  if (!result.ok) back(here, { err: result.errors });
  await audit(actor, result.outcome.status === "failed" ? "publish.failed" : "publish", "global", result.outcome.releaseId, { status: result.outcome.status });
  if (result.outcome.status === "failed") back(here, { err: ["A publicação falhou ao gravar o arquivo; a versão anterior continua no ar."] });
  back(here, { ok: `Configuração global publicada (release ${result.outcome.releaseId})${parts.length ? `: ${parts.join(", ")}` : ""}.` });
}

/**
 * Aparência (owner): the store-wide buy button of the product cards, saved in the GLOBAL draft. On: every product card of every region gets a button
 * with this text (a section's own text wins). Off: each section decides, as before. Published from Publicar → Configuração global.
 */
export async function saveCardsAction(fd: FormData) {
  const actor = await requireAdmin({ mutation: true, owner: true });
  const on = fd.get("cards_buy") === "on";
  const label = text(fd, "cards_buy_label").slice(0, MAX_BUY_LABEL).trim() || DEFAULT_BUY_LABEL;
  const style = postedBuyStyle(text(fd, "cards_buy_style"));
  const outcome = await applyAndSave("global", { type: "set-cards", cards: on ? { buyLabel: label, ...(style ? { buyStyle: style } : {}) } : null }, revNumber(fd), actor);
  revalidatePath("/admin", "layout");
  if (!outcome.ok) back("/admin/aparencia", { err: outcome.errors.map((e) => (e.includes("buyLabel") ? `O texto do botão precisa ter de 1 a ${MAX_BUY_LABEL} caracteres, sem espaço nas pontas.` : e)) });
  await audit(actor, "draft.save", "global", "set-cards");
  back("/admin/aparencia#botao-cards", { ok: on ? `Rascunho salvo: ${CARD_BUY_STYLE_NAME[style ?? "button"]} “${label}” em todos os cards. Publique a configuração global para valer na loja.` : "Rascunho salvo: cada seção volta a decidir o próprio botão. Publique a configuração global para valer na loja." });
}

/**
 * Aparência (owner): how far "Meu Pequeno Mundo" is open, saved in the GLOBAL draft ("segue" = no choice: the server's MEU_PEQUENO_MUNDO
 * alone). The env stays the ceiling. Published from Publicar → Configuração global.
 */
export async function saveMundoAction(fd: FormData) {
  const actor = await requireAdmin({ mutation: true, owner: true });
  const escolha = text(fd, "mundo_modo");
  const modo = (MUNDO_MODOS as readonly string[]).includes(escolha) ? (escolha as MundoModo) : null;
  const outcome = await applyAndSave("global", { type: "set-mundo", modo }, revNumber(fd), actor);
  revalidatePath("/admin", "layout");
  if (!outcome.ok) back("/admin/aparencia#meu-pequeno-mundo", { err: outcome.errors });
  await audit(actor, "draft.save", "global", "set-mundo");
  const como = { on: "página e entradas na loja", pagina: "só a página, sem entradas", off: "desligado" } as const;
  back("/admin/aparencia#meu-pequeno-mundo", { ok: `Rascunho salvo: Meu Pequeno Mundo ${modo ? como[modo] : "segue o servidor"}. Publique a configuração global em Publicar para valer na loja.` });
}

export async function discardGlobalAction() {
  const actor = await requireAdmin({ mutation: true, owner: true });
  await discardDraft("global");
  await audit(actor, "draft.discard", "global");
  revalidatePath("/admin", "layout");
  back("/admin/publicar", { ok: "Rascunho da configuração global descartado: paleta, botão nos cards, Meu Pequeno Mundo e tracking global voltaram ao publicado." });
}

// ── Cupons e promoções (por região) ─────────────────────────────────────────────────────────────────────────────

/** Saves the coupons and promotions of a region as a DRAFT (nothing reaches the store or the INK until it is published from "Publicar"). */
export async function savePromotionsAction(fd: FormData) {
  const { actor, scope } = await editScope(fd);
  let rows: unknown;
  try {
    rows = JSON.parse(text(fd, "items") || "[]");
  } catch {
    back("/admin/promocoes", { err: ["Não foi possível ler a lista. Recarregue a página e tente de novo."] });
  }
  const parsed = rowsToConfig(rows, scope);
  if (!parsed.ok) back("/admin/promocoes", { err: parsed.errors });
  const outcome = await applyAndSave(scope, { type: "set-promotions", promotions: parsed.value }, revNumber(fd), actor);
  revalidatePath("/admin", "layout");
  if (!outcome.ok) back("/admin/promocoes", { err: outcome.errors.map((e) => readablePromotionError(e, parsed.value.items)) });
  await audit(actor, "draft.save", scope, "set-promotions");
  back("/admin/promocoes", { ok: `Rascunho dos cupons e promoções de ${scopeName(scope)} salvo. Nada muda na loja nem na INK até você publicar.` });
}

// ── Faixa do topo (por região) ───────────────────────────────────────────────────────────────────────────────────

/** Saves the top strip of a region (messages and INK production time) as a DRAFT: the store and the INK pages change only once it is published. */
export async function saveTopBarAction(fd: FormData) {
  const { actor, scope } = await editScope(fd);
  const here = "/admin/faixa";
  let rows: unknown;
  try {
    rows = JSON.parse(text(fd, "messages") || "[]");
  } catch {
    back(here, { err: ["Não foi possível ler a lista. Recarregue a página e tente de novo."] });
  }
  const parsed = topBarFromForm(rows, text(fd, "productionDays"), scope, text(fd, "style"), { background: text(fd, "colorBackground"), text: text(fd, "colorText") });
  if (!parsed.ok) back(here, { err: parsed.errors });
  const outcome = await applyAndSave(scope, { type: "set-top-bar", topBar: parsed.value }, revNumber(fd), actor);
  revalidatePath("/admin", "layout");
  if (!outcome.ok) back(here, { err: outcome.errors.map((e) => readableTopBarError(e, scope)) });
  await audit(actor, "draft.save", scope, "set-top-bar");
  back(here, { ok: `Rascunho da faixa do topo de ${scopeName(scope)} salvo. Nada muda na loja nem na INK até você publicar.` });
}

/**
 * Uploads ONE picture and answers with a result (no redirect), so the media screen can send several one after another and show each outcome.
 * The browser shrinks very large photos first (MediaUploader); the server still decodes, validates and re-encodes everything itself.
 */
export async function uploadMediaAction(fd: FormData): Promise<{ ok: boolean; message: string }> {
  const actor = await requireAdmin({ mutation: true });
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Escolha um arquivo." };
  if (!allow(`upload:${actor.id}`, 60, 10 * 60_000)) return { ok: false, message: "Muitos envios seguidos. Aguarde alguns minutos." };
  const result = await saveUpload(Buffer.from(await file.arrayBuffer()), file.name, actor.id === "dev-local" ? null : actor.id).catch((error: unknown) => {
    // The reason is logged (never a secret: the object-store client only reports the HTTP status) and its class shown to the owner.
    console.error("[admin] media upload failed:", error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 300) : "unknown");
    return { ok: false as const, error: describeUploadFailure(error, process.env.BUCKET_ADDRESSING) };
  });
  revalidatePath("/admin", "layout");
  if (!result.ok) return { ok: false, message: result.error };
  await audit(actor, "media.upload", "sul", result.choice.assetId);
  return { ok: true, message: result.duplicate ? `A imagem "${result.choice.label}" já existia; foi reaproveitada.` : `Imagem "${result.choice.label}" enviada${platform().mode === "prod" ? "" : " (somente neste computador)"}.` };
}

export async function deleteMediaAction(fd: FormData) {
  const actor = await requireAdmin({ mutation: true });
  const assetId = text(fd, "assetId");
  // Media is shared by the three regions: an image used by ANY region's draft cannot be removed.
  for (const scope of REGION_SCOPES) if (JSON.stringify((await loadWorkspace(scope)).doc).includes(assetId)) back("/admin/midia", { err: [`Essa imagem está em uso no rascunho de ${scopeName(scope)}. Troque-a antes de excluir.`] });
  const result = await deleteUpload(assetId);
  revalidatePath("/admin", "layout");
  if (!result.ok) back("/admin/midia", { err: [result.error] });
  await audit(actor, "media.delete", "sul", assetId);
  back("/admin/midia", { ok: "Imagem excluída." });
}

// ── Owner-only: people, syncs, sign-out ──────────────────────────────────────────────────────────────────────

const SYNC_MIN_INTERVAL_MS = 5 * 60_000;

/** Refreshes the INK collections snapshot (≈4 read-only GETs, paced). Owner only; one at a time (database-backed lock); never touches the last-good file on failure. */
export async function syncCollectionsAction() {
  const actor = await requireAdmin({ mutation: true, owner: true });
  const { syncs } = platform();
  await syncs.failStale("collections", 10 * 60_000);
  const last = await syncs.last("collections");
  if (last && last.status === "succeeded" && Date.now() - new Date(last.startedAt).getTime() < SYNC_MIN_INTERVAL_MS) back("/admin/sincronizacao", { err: ["A última sincronização foi há poucos minutos. Aguarde um pouco antes de repetir."] });
  const run = await syncs.start("collections", actor.id);
  if (!run) back("/admin/sincronizacao", { err: ["Já há uma sincronização de coleções em andamento."] });
  let outcomes: Awaited<ReturnType<typeof syncCollections>>;
  try {
    outcomes = await syncCollections();
  } catch (error) {
    await syncs.finish(run.id, { ok: false, error: error instanceof Error ? error.message : "erro" }).catch(() => undefined);
    back("/admin/sincronizacao", { err: ["Falha ao sincronizar. Os dados anteriores foram mantidos."] });
  }
  const failed = outcomes.filter((o) => !o.ok);
  const summary = { stores: outcomes.length, failed: failed.length, requests: outcomes.reduce((n, o) => n + (o.ok ? o.requests : 0), 0) };
  // A run in which any store failed is recorded as failed: it must not throttle the retry the person makes right after fixing the cause.
  await syncs.finish(run.id, failed.length === 0 ? { ok: true, summary } : { ok: false, error: failed.map((f) => (f.ok ? "" : `${f.storeKey}: ${f.error}`)).join("; ").slice(0, 500) });
  await platform().audit.record({ actor: actor.id, action: "collections.sync", meta: summary }).catch(() => undefined);
  revalidatePath("/[region]", "layout");
  revalidatePath("/admin", "layout");
  back("/admin/sincronizacao", failed.length ? { err: [`Sincronização parcial: ${failed.map((f) => (f.ok ? "" : `${f.storeKey}: ${f.error}`)).join("; ")}. Os dados anteriores foram mantidos.`] } : { ok: `Coleções sincronizadas (${summary.requests} requisições de leitura à INK).` });
}

/**
 * Refreshes the CATALOG (and then the collections) of the INK store of the region being edited. Owner only. Read-only against INK, paced (a
 * store takes a few minutes), so it runs in the background exactly like the authenticated route: the person is answered at once and the
 * Sincronização screen shows the job. One sync at a time (the same in-process lock as the route); never touches the last-good data on failure.
 */
export async function syncCatalogAction(fd: FormData) {
  const actor = await requireAdmin({ mutation: true, owner: true });
  const scope = await scopeOf(fd, actor);
  const store = storeOf(scope);
  if (!tokenFor(store)) back("/admin/sincronizacao", { err: [`A variável ${INK_STORES[store]?.tokenEnv ?? "INK_TOKEN_*"} não está configurada neste ambiente (ou o serviço ainda não terminou de reiniciar depois de criá-la).`] });
  let running: ReturnType<typeof beginSyncJob>;
  try {
    running = beginSyncJob([store]);
  } catch (error) {
    if (error instanceof SyncAlreadyRunningError) back("/admin/sincronizacao", { err: ["Já há uma sincronização de catálogo em andamento. Aguarde terminar."] });
    throw error;
  }
  after(() =>
    runCatalogSyncJob(running, {
      storeKeys: [store],
      withCollections: true,
      onPromoted: () => {
        revalidatePath("/[region]", "layout");
        for (const region of REGION_SLUGS) revalidatePath(`/api/cidades/${region}`);
      },
    }),
  );
  await audit(actor, "catalog.sync", scope, store, { withCollections: true });
  revalidatePath("/admin", "layout");
  back("/admin/sincronizacao", { ok: `Sincronização do catálogo de ${scopeName(scope)} iniciada. Leva alguns minutos; recarregue esta página para acompanhar. As coleções são atualizadas ao final.` });
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function saveUserAction(fd: FormData) {
  const actor = await requireAdmin({ mutation: true, owner: true });
  const { users, sessions } = platform();
  if (!users || !sessions) back("/admin/usuarios", { err: ["Gerenciar pessoas só existe em produção."] });
  const email = text(fd, "email").toLowerCase();
  if (!EMAIL_RE.test(email)) back("/admin/usuarios", { err: ["E-mail inválido."] });
  const scopes = ALL_SCOPES.filter((sc) => fd.getAll("scopes").includes(sc));
  const existing = await users.findByEmail(email);
  if (existing) {
    if (existing.role === "owner") back("/admin/usuarios", { err: ["O owner é definido pelo ambiente e não pode ser alterado aqui."] });
    if (scopes.length === 0) back("/admin/usuarios", { err: ["Escolha ao menos uma região."] });
    await users.update(existing.id, { scopes, active: true });
    await sessions.destroyAllFor(existing.id); // permissions changed: sign the person out everywhere
    await platform().audit.record({ actor: actor.id, action: "user.update", target: existing.id, meta: { scopes } }).catch(() => undefined);
    back("/admin/usuarios", { ok: "Permissões atualizadas." });
  }
  if (scopes.length === 0) back("/admin/usuarios", { err: ["Escolha ao menos uma região."] });
  const created = await users.create({ email, name: null, role: "editor", scopes });
  await platform().audit.record({ actor: actor.id, action: "user.create", target: created.id, meta: { scopes } }).catch(() => undefined);
  back("/admin/usuarios", { ok: "Editor cadastrado. Ele já pode entrar com a conta Railway desse e-mail." });
}

export async function deactivateUserAction(fd: FormData) {
  const actor = await requireAdmin({ mutation: true, owner: true });
  const { users, sessions } = platform();
  if (!users || !sessions) back("/admin/usuarios", { err: ["Gerenciar pessoas só existe em produção."] });
  const target = await users.findById(text(fd, "id"));
  if (!target || target.role === "owner" || target.id === actor.id) back("/admin/usuarios", { err: ["Essa pessoa não pode ser desativada aqui."] });
  await users.update(target.id, { active: false });
  await sessions.destroyAllFor(target.id);
  await platform().audit.record({ actor: actor.id, action: "user.deactivate", target: target.id }).catch(() => undefined);
  back("/admin/usuarios", { ok: "Acesso removido." });
}

export async function logoutAction() {
  const actor = await requireAdmin({ mutation: true });
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await platform().sessions?.destroy(token);
  jar.set(SESSION_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: SESSION_COOKIE_PATH, maxAge: 0 });
  await platform().audit.record({ actor: actor.id, action: "logout" }).catch(() => undefined);
  redirect("/admin/login");
}

// ── Pages (hotpages and parent-category landings) ────────────────────────────────────────────────────────────

/** Like `run`, for operations that are not section operations: it may send the person to a place built from the new object's id. */
async function runRaw(fd: FormData, op: DraftOp, okMessage: string, returnTo: string, focus?: (id: string) => string): Promise<never> {
  const { actor, scope } = await editScope(fd);
  const outcome: SaveOutcome = await applyAndSave(scope, op, revNumber(fd), actor);
  revalidatePath("/admin", "layout");
  if (!outcome.ok) back(returnTo, { err: outcome.errors });
  await audit(actor, "draft.save", scope, op.type);
  back(outcome.focusId && focus ? focus(outcome.focusId) : returnTo, { ok: okMessage });
}

const pageKindOf = (fd: FormData): PageKind => (text(fd, "kind") === "categoryLanding" ? "categoryLanding" : "hotpage");
const publishedPage = (base: import("@/lib/site-config/schema").ScopeDoc, id: string) => base.pages?.find((p) => p.id === id);

export async function createPageAction(fd: FormData) {
  return runRaw(fd, { type: "create-page", kind: pageKindOf(fd), title: text(fd, "title"), slug: text(fd, "slug") || undefined }, "Página criada no rascunho. Nada é público até publicar.", "/admin/paginas", (id) => `/admin/paginas/${id}`);
}

/**
 * Visão geral, "Levar para as páginas do site": every "Ver todos" (and menu link, grid tile) that still opens a collection on INK opens its page on the site
 * instead, for every collection the region can show (one that cannot keeps its INK link, so nothing turns into a dead button). A draft, like any edit.
 */
export async function linkCollectionPagesAction(fd: FormData) {
  const { scope } = await editScope(fd);
  const ws = await loadWorkspace(scope);
  const refs = inkCollectionLinks(ws.doc).filter((r) => collectionPageSlug(ws.doc, r.store, r.collectionId) !== null);
  if (refs.length === 0) back("/admin", { ok: "Nenhum link para trocar: os que restam levam a coleções sem página no site." });
  return runRaw(fd, { type: "link-collection-pages", refs }, `${refs.length === 1 ? "1 link agora leva" : `${refs.length} links agora levam`} à página da coleção no site (rascunho). Publique a home e as páginas alteradas para valer.`, "/admin");
}

/**
 * "Personalizar página" of a collection (Coleções): its page, as a draft parent-category landing at the collection's own address, with the hero and
 * every product of it, for the owner to dress (texts, picture, SEO). Until it is published the storefront keeps drawing the automatic one.
 */
export async function createCollectionPageAction(fd: FormData) {
  const { scope } = await editScope(fd);
  const ref = parseCollectionRef(text(fd, "ref"));
  if (!ref) back("/admin/colecoes", { err: ["Coleção inválida."] });
  const ws = await loadWorkspace(scope);
  const problem = sourceProblem({ kind: "ink-category", ...ref, order: "category", limit: 6 }, ws.doc);
  if (problem) back("/admin/colecoes", { err: [problem] });
  const collection = findCollection(ref.store, ref.collectionId);
  if (!collection) back("/admin/colecoes", { err: ["Essa coleção não existe no snapshot sincronizado."] });
  const existing = ws.doc.pages?.find((p) => p.kind === "categoryLanding" && p.slug === collection.slug);
  if (existing) back(`/admin/paginas/${existing.id}`, { ok: "Esta coleção já tem uma página no rascunho." });
  return runRaw(fd, { type: "create-page", kind: "categoryLanding", title: collection.name.replace(/\s+/g, " ").trim(), slug: collection.slug, collection: ref }, "Página da coleção criada no rascunho. Até publicar, a loja segue mostrando a página automática.", "/admin/colecoes", (id) => `/admin/paginas/${id}`);
}

/** Title, address and SEO. The address of a page that is already published cannot change (its URL is public); only the owner turns indexing on. */
export async function updatePageAction(fd: FormData) {
  const { actor, scope } = await editScope(fd);
  const id = text(fd, "id");
  const ws = await loadWorkspace(scope);
  const page = ws.doc.pages?.find((p) => p.id === id);
  const here = `/admin/paginas/${id}`;
  if (!page) back("/admin/paginas", { err: ["Página não encontrada."] });
  const live = publishedPage(ws.baseDoc, id);
  const slug = text(fd, "slug") || page.slug;
  if (live && slug !== live.slug) back(here, { err: [`O endereço "${live.slug}" já é público e não pode mudar. Duplique a página para usar outro endereço.`] });
  const wantsIndex = text(fd, "indexable") === "on";
  if (wantsIndex !== page.seo.indexable && actor.role !== "owner") back(here, { err: ["Só o owner liga ou desliga a indexação da página."] });
  const og = text(fd, "seo_og");
  const seo = {
    indexable: wantsIndex,
    ...(text(fd, "seo_title") ? { title: text(fd, "seo_title") } : {}),
    ...(text(fd, "seo_description") ? { description: text(fd, "seo_description") } : {}),
    ...(og ? { ogImage: { assetId: og, alt: text(fd, "seo_og_alt"), decorative: text(fd, "seo_og_alt") === "" } } : {}),
  };
  return runRaw(fd, { type: "update-page", id, patch: { title: text(fd, "title"), slug, seo } }, "Rascunho da página salvo.", here);
}

/** The page's own ground ("Fundo da página": colour, text tone, optional pattern), or back to the region's ground when switched off. */
export async function savePageBackdropAction(fd: FormData) {
  const id = text(fd, "id");
  const here = `/admin/paginas/${id}`;
  const { backdrop, problems } = parsePageBackdrop(fd);
  if (problems.length > 0) back(here, { err: problems });
  return runRaw(fd, { type: "update-page", id, patch: { backdrop } }, backdrop ? "Fundo da página salvo no rascunho." : "A página voltou ao fundo da região (rascunho).", here);
}

export async function duplicatePageAction(fd: FormData) {
  return runRaw(fd, { type: "duplicate-page", id: text(fd, "id") }, "Página duplicada como rascunho.", "/admin/paginas", (id) => `/admin/paginas/${id}`);
}

export async function removePageAction(fd: FormData) {
  const { scope } = await editScope(fd);
  const id = text(fd, "id");
  if (publishedPage((await loadWorkspace(scope)).baseDoc, id)) back(`/admin/paginas/${id}`, { err: ["Esta página já foi publicada: arquive-a em vez de apagar."] });
  return runRaw(fd, { type: "remove-page", id }, "Rascunho da página apagado.", "/admin/paginas");
}

/** Archiving takes effect at once when the page is live (it is published as archived: 404, no link target); a never-published page only changes its draft. */
export async function archivePageAction(fd: FormData) {
  const { actor, scope } = await editScope(fd);
  const id = text(fd, "id");
  const archive = text(fd, "archive") !== "false";
  const before = await loadWorkspace(scope);
  const saved = await applyAndSave(scope, { type: "set-page-archived", id, archived: archive }, before.record?.rev ?? null, actor);
  if (!saved.ok) back(`/admin/paginas/${id}`, { err: saved.errors });
  if (publishedPage(before.baseDoc, id)) {
    const ws = await loadWorkspace(scope);
    await reconcileReleases(deps(actor), revalidateStorefront).catch(() => undefined);
    const result = await publishRelease(deps(actor), { kind: "publish", doc: ws.doc, target: { kind: "page", id }, note: archive ? "Página arquivada" : "Página reativada" }, revalidateStorefront).catch(publishError);
    revalidatePath("/admin", "layout");
    if (!result.ok) back(`/admin/paginas/${id}`, { err: result.errors });
    await audit(actor, "page.archive", scope, id, { archived: archive, release: result.outcome.releaseId });
  }
  revalidatePath("/admin", "layout");
  back(`/admin/paginas/${id}`, { ok: archive ? "Página arquivada: deixou de ser pública." : "Página reativada." });
}

/** Publishes ONE page or ONE model (the home and everything else stay as published). */
export async function publishTargetAction(fd: FormData) {
  const { actor, scope } = await editScope(fd);
  const kind = text(fd, "target") === "customizer" ? "customizer" : "page";
  const id = text(fd, "id");
  const back_ = text(fd, "from") === "publicar" ? "/admin/publicar" : kind === "page" ? `/admin/paginas/${id}` : `/admin/personalizacao/${id}`;
  const ws = await loadWorkspace(scope);
  const target: PublishTarget = { kind, id };
  await reconcileReleases(deps(actor), revalidateStorefront).catch(() => undefined);
  const result = await publishRelease(deps(actor), { kind: "publish", doc: ws.doc, target, note: text(fd, "note").slice(0, 200) || undefined }, revalidateStorefront).catch(publishError);
  revalidatePath("/admin", "layout");
  if (!result.ok) back(back_, { err: result.errors });
  await audit(actor, result.outcome.status === "failed" ? "publish.failed" : "publish", scope, result.outcome.releaseId, { target: kind, id, status: result.outcome.status });
  if (result.outcome.status === "failed") back(back_, { err: ["A publicação falhou ao gravar o arquivo; a versão anterior continua no ar."] });
  back(back_, { ok: `${kind === "page" ? "Página publicada" : "Modelo publicado"}${platform().mode === "prod" ? "" : " no sandbox local"} (release ${result.outcome.releaseId}).` });
}

/** Restores ONE page or ONE model from an earlier release (as a new release); the home and everything else are left exactly as they are. */
export async function restoreTargetAction(fd: FormData) {
  const { actor, scope } = await editScope(fd);
  const kind = text(fd, "target") === "customizer" ? "customizer" : "page";
  const id = text(fd, "id");
  const releaseId = text(fd, "release");
  const here = kind === "page" ? `/admin/paginas/${id}` : `/admin/personalizacao/${id}`;
  await reconcileReleases(deps(actor), revalidateStorefront).catch(() => undefined);
  const result = await publishRelease(deps(actor), { kind: "rollback", toReleaseId: releaseId, scope, target: { kind, id }, note: `Restaurada a versão ${releaseId} (${kind === "page" ? "página" : "modelo"})` }, revalidateStorefront).catch(() => ({ ok: false as const, errors: ["Não foi possível restaurar agora. Nada mudou na loja."] }));
  revalidatePath("/admin", "layout");
  if (!result.ok) back(here, { err: result.errors });
  await audit(actor, "rollback", scope, releaseId, { target: kind, id });
  back(here, { ok: `Versão ${releaseId} restaurada como nova publicação (só ${kind === "page" ? "esta página" : "este modelo"}). O rascunho continua como estava: descarte-o para voltar ao publicado.` });
}

// ── Personalization models ───────────────────────────────────────────────────────────────────────────────────

export async function createCustomizerAction(fd: FormData) {
  const { scope } = await editScope(fd);
  const origin = parseOrigin(text(fd, "origin"));
  if (origin.kind === "umapenca") {
    return runRaw(fd, { type: "create-customizer", name: text(fd, "name"), slug: text(fd, "slug") || undefined, source: { kind: "umapenca", articleKind: origin.articleKind } }, "Modelo criado como rascunho (inativo). Configure os campos e a imagem.", "/admin/personalizacao", (id) => `/admin/personalizacao/${id}`);
  }
  const ref = parseCollectionRef(text(fd, "collection"));
  if (!ref) back("/admin/personalizacao", { err: ["Escolha a coleção da INK do modelo nas sugestões."] });
  if (ref.store !== storeOf(scope)) back("/admin/personalizacao", { err: [`Esta coleção pertence a outra loja da INK: ${scopeName(scope)} usa só as coleções da própria loja.`] });
  const problem = sourceProblem({ kind: "ink-category", ...ref, order: "category", limit: 6 }, (await loadWorkspace(scope)).doc);
  if (problem) back("/admin/personalizacao", { err: [problem] });
  return runRaw(fd, { type: "create-customizer", name: text(fd, "name"), slug: text(fd, "slug") || undefined, source: ref }, "Modelo criado como rascunho (inativo). Configure os campos e a imagem.", "/admin/personalizacao", (id) => `/admin/personalizacao/${id}`);
}

export async function saveCustomizerAction(fd: FormData) {
  const { scope } = await editScope(fd);
  const id = text(fd, "id");
  const here = `/admin/personalizacao/${id}`;
  const ws = await loadWorkspace(scope);
  const current = ws.doc.customizers?.find((m) => m.id === id);
  if (!current) back("/admin/personalizacao", { err: ["Modelo não encontrado."] });
  const live = ws.baseDoc.customizers?.find((m) => m.id === id);
  const { patch, errors } = parseCustomizerForm(fd, current, { store: storeOf(scope) }, { slugLocked: Boolean(live) });
  if (errors.length > 0) back(here, { err: errors });
  if (patch.source && !isUmaPencaSource(patch.source)) {
    const problem = sourceProblem({ kind: "ink-category", ...patch.source, order: "category", limit: 6 }, ws.doc);
    if (problem) back(here, { err: [problem] });
  }
  return runRaw(fd, { type: "update-customizer", id, patch }, "Modelo salvo no rascunho. Nada é público até publicar.", here);
}

export async function duplicateCustomizerAction(fd: FormData) {
  return runRaw(fd, { type: "duplicate-customizer", id: text(fd, "id") }, "Modelo duplicado como rascunho inativo.", "/admin/personalizacao", (id) => `/admin/personalizacao/${id}`);
}

export async function removeCustomizerAction(fd: FormData) {
  const { scope } = await editScope(fd);
  const id = text(fd, "id");
  if ((await loadWorkspace(scope)).baseDoc.customizers?.some((m) => m.id === id)) back(`/admin/personalizacao/${id}`, { err: ["Este modelo já foi publicado: desative-o e publique em vez de apagar (as solicitações antigas continuam com os dados originais)."] });
  return runRaw(fd, { type: "remove-customizer", id }, "Rascunho do modelo apagado.", "/admin/personalizacao");
}

// ── Requests (the operational queue) ─────────────────────────────────────────────────────────────────────────

async function requestFor(fd: FormData) {
  const actor = await requireAdmin({ mutation: true });
  const id = text(fd, "id");
  const record = await platform().requests.get(id);
  // The server decides, from the stored region: an editor of another region cannot touch this request even with a forged form.
  if (!record || !canEdit(actor, record.region)) {
    await audit(actor, "access.denied", record?.region ?? "global", "request");
    back("/admin/personalizacao/solicitacoes", { err: ["Solicitação não encontrada ou sem permissão para essa região."] });
  }
  return { actor, record };
}

export async function setRequestStatusAction(fd: FormData) {
  const { actor, record } = await requestFor(fd);
  const to = text(fd, "status") as RequestStatus;
  const here = `/admin/personalizacao/solicitacoes/${record.id}`;
  if (!(REQUEST_STATUSES as readonly string[]).includes(to) || !nextStatuses(record.status).includes(to)) back(here, { err: ["Mudança de estado não permitida a partir do estado atual."] });
  // "Cliente contatado" is a HUMAN statement (someone wrote to the customer): it is never set by a click on a link, a webhook or silence.
  if (to === "customerContacted" && text(fd, "confirm") !== "on") back(here, { err: ["Marque a confirmação de que você já falou com o cliente por WhatsApp ou e-mail."] });
  const result = await platform().requests.setStatus(record.id, to, actor.email || actor.id, text(fd, "note") || undefined);
  if (!result.ok) back(here, { err: [result.error] });
  await audit(actor, "request.status", record.region, record.id, { to });
  revalidatePath("/admin", "layout");
  back(here, { ok: "Estado atualizado." });
}

/** An internal note (what was asked of the customer, what they answered). It is history for the team: never shown to the customer. */
export async function addRequestNoteAction(fd: FormData) {
  const { actor, record } = await requestFor(fd);
  const here = `/admin/personalizacao/solicitacoes/${record.id}`;
  const note = text(fd, "note");
  if (!note) back(here, { err: ["Escreva a observação."] });
  const result = await platform().requests.addNote(record.id, actor.email || actor.id, note);
  if (!result.ok) back(here, { err: [result.error] });
  await audit(actor, "request.note", record.region, record.id);
  revalidatePath("/admin", "layout");
  back(here, { ok: "Observação registrada." });
}

/**
 * The INK product page prepared for THIS customer, typed by the team after the print exists. A purchase orientation only: it is not an order, nothing
 * is verified against INK, and it is only accepted when it is https on the request's own region's INK store (no other host, so no open redirect).
 */
export async function setRequestProductLinkAction(fd: FormData) {
  const { actor, record } = await requestFor(fd);
  const here = `/admin/personalizacao/solicitacoes/${record.id}`;
  const raw = text(fd, "product_link");
  let url: string | null = null;
  if (raw) {
    const checked = productLinkFor(record.region, raw, record.snapshot.store);
    if (!checked.ok) back(here, { err: [checked.error] });
    else url = checked.url;
  }
  const result = await platform().requests.setProductLink(record.id, url, actor.email || actor.id);
  if (!result.ok) back(here, { err: [result.error] });
  await audit(actor, "request.product", record.region, record.id, { set: url !== null });
  revalidatePath("/admin", "layout");
  back(here, { ok: url ? "Link do produto salvo. Ele entra na mensagem sugerida; nada é enviado sozinho." : "Link do produto removido." });
}

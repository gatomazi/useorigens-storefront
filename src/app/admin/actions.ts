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
import { allow } from "@/lib/admin/auth/rate-limit";
import { syncCollections } from "@/lib/catalog/collections-sync";
import { beginSyncJob, SyncAlreadyRunningError } from "@/lib/catalog/sync-job";
import { runCatalogSyncJob } from "@/lib/catalog/sync-runner";
import { INK_STORES, tokenFor } from "@/lib/ink/config";
import { ALL_SCOPES } from "@/lib/admin/auth/authorize";
import { canEdit, type Actor } from "@/lib/admin/store/ports";
import { findCollection } from "@/lib/catalog/collections-file";
import { collectionState } from "@/lib/catalog/collections";
import { REGION_SLUGS, type RegionSlug } from "@/lib/geo/regions";
import { enabledInternalIds } from "@/lib/site-config/collections-enabled";
import type { Scope, TrackingConfig, VendorSetting } from "@/lib/site-config/schema";
import { sourceProblem } from "@/lib/admin/validate-draft";
import { parseCollectionRef, parseFeaturedFields, parseSectionForm } from "@/lib/admin/section-form";
import { legacyFeaturedRefs, resolveFeatured, searchFeaturedCandidates, type FeaturedCandidate } from "@/lib/hero-featured";
import { buildRegionSeed } from "@/lib/admin/region-seed";
import { STRUCTURED_TEMPLATES, type StructuredTemplate } from "@/lib/site-config/structured";
import { launchBlockers } from "@/lib/admin/launch";
import { isRegionScope, REGION_SCOPES, SCOPE_COOKIE, scopeName, scopeOf, storeOf } from "@/lib/admin/scope";
import { applyAndSave, discardDraft, loadWorkspace, type SaveOutcome } from "@/lib/admin/workspace";
import type { DraftOp } from "@/lib/admin/draft-ops";

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

function back(path: string, flash: { ok?: string; err?: string[] }): never {
  const q = new URLSearchParams();
  if (flash.ok) q.set("ok", flash.ok);
  if (flash.err?.length) q.set("err", flash.err.join(" | ").slice(0, 900));
  redirect(`${path}${q.size ? `${path.includes("?") ? "&" : "?"}${q}` : ""}`);
}

async function run(fd: FormData, op: DraftOp, okMessage: string, returnTo: string, focusToEditor = false): Promise<never> {
  const { actor, scope } = await editScope(fd);
  const outcome: SaveOutcome = await applyAndSave(scope, op, revNumber(fd), actor);
  revalidatePath("/admin", "layout");
  if (!outcome.ok) back(returnTo, { err: outcome.errors });
  await audit(actor, "draft.save", scope, op.type);
  if (focusToEditor && outcome.focusId) back(`/admin/home/${outcome.focusId}`, { ok: okMessage });
  back(returnTo, { ok: okMessage });
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

export async function addCollectionSection(fd: FormData) {
  const { scope } = await editScope(fd);
  const ref = parseCollectionRef(text(fd, "collection"));
  if (!ref) back("/admin/home", { err: ["Escolha uma coleção nas sugestões (digite parte do nome)."] });
  // Same rule the editor's autocomplete applies, enforced here too: never trust that the form only offered valid choices.
  const problem = sourceProblem({ kind: "ink-category", ...ref, order: "category", limit: 6 }, (await loadWorkspace(scope)).doc);
  if (problem) back("/admin/home", { err: [problem] });
  const limit = Math.min(24, Math.max(3, Math.round(Number(text(fd, "limit")) || 6)));
  return run(fd, { type: "add-carousel", title: text(fd, "title") || findCollection(ref.store, ref.collectionId)?.name || "Nova coleção", source: { kind: "ink-category", ...ref, order: "category", limit } }, "Seção criada no rascunho.", "/admin/home", true);
}

export async function moveSection(fd: FormData) {
  const direction = text(fd, "direction") === "up" ? "up" : "down";
  return run(fd, { type: "move", id: text(fd, "id"), direction }, "Ordem alterada.", "/admin/home");
}

export async function setSectionActive(fd: FormData) {
  const active = text(fd, "active") === "true";
  return run(fd, { type: "set-active", id: text(fd, "id"), active }, active ? "Seção ativada." : "Seção ocultada.", "/admin/home");
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
  const ws = await loadWorkspace(scope);
  const section = ws.doc.home?.sections.find((s) => s.id === id);
  if (!section) back("/admin/home", { err: ["Seção não encontrada."] });
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
  const problem = patch.source ? sourceProblem(patch.source, ws.doc) : null;
  if (problem) back(`/admin/home/${id}`, { err: [problem] });
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

/**
 * Library: show or hide ONE public collection in the navbar the Worker draws on the INK product pages. Independent of "enabled for the home":
 * only PUBLIC collections (a real page on the INK store) with products are offered; internal ones have no public page, so they are refused here.
 */
export async function setCollectionNavbarAction(fd: FormData) {
  const { actor, scope } = await editScope(fd);
  const ref = parseCollectionRef(text(fd, "ref"));
  const show = text(fd, "shown") === "true";
  const from = text(fd, "from");
  const q = new URLSearchParams();
  for (const k of ["q", "f"]) if (text(fd, k)) q.set(k, text(fd, k));
  if (from.startsWith("/admin/")) q.set("from", from);
  const to = `/admin/colecoes${q.size ? `?${q}` : ""}`;
  if (!ref || ref.store !== storeOf(scope)) back(to, { err: [`Esta coleção pertence a outra loja da INK: a região ${scopeName(scope)} só usa coleções da própria loja.`] });
  const record = findCollection(ref.store, ref.collectionId);
  if (!record) back(to, { err: ["Coleção não encontrada no snapshot sincronizado."] });
  if (show) {
    if (!record.isAvailable) back(to, { err: ["Só coleções públicas na INK têm página própria: uma coleção interna não pode aparecer na navbar."] });
    if (record.matchedCount < 1) back(to, { err: ["Esta coleção não tem produtos no catálogo local; ela não apareceria na navbar."] });
  }
  const outcome = await applyAndSave(scope, { type: "set-collection-navbar", ...ref, shown: show }, revNumber(fd), actor);
  revalidatePath("/admin", "layout");
  if (!outcome.ok) back(to, { err: outcome.errors });
  back(to, { ok: show ? `“${record.name}” vai aparecer na navbar da INK depois que você publicar.` : `“${record.name}” sai da navbar da INK depois que você publicar.` });
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
  back("/admin/tracking", { ok: "Rascunho de tracking salvo. Nada muda na loja até você publicar e confirmar os IDs efetivos." });
}

/** Publishes the GLOBAL tracking document (owner only). Regions that inherit it change together, so the effective-ID confirmation is mandatory (see `pendingTrackingChanges`). */
export async function publishGlobalTrackingAction(fd: FormData) {
  const actor = await requireAdmin({ mutation: true, owner: true });
  const ws = await loadWorkspace("global");
  await reconcileReleases(deps(actor), revalidateStorefront).catch(() => undefined);
  const result = await publishRelease(deps(actor), { kind: "publish", doc: ws.doc, note: text(fd, "note").slice(0, 200) || "Tracking global", confirmTracking: text(fd, "confirmTracking") === "on" }, revalidateStorefront).catch(publishError);
  revalidatePath("/admin", "layout");
  if (!result.ok) back("/admin/tracking", { err: result.errors });
  await audit(actor, result.outcome.status === "failed" ? "publish.failed" : "publish", "global", result.outcome.releaseId, { status: result.outcome.status });
  if (result.outcome.status === "failed") back("/admin/tracking", { err: ["A publicação falhou ao gravar o arquivo; a versão anterior continua no ar."] });
  back("/admin/tracking", { ok: `Tracking global publicado (release ${result.outcome.releaseId}).` });
}

export async function discardGlobalTrackingAction() {
  const actor = await requireAdmin({ mutation: true, owner: true });
  await discardDraft("global");
  await audit(actor, "draft.discard", "global");
  revalidatePath("/admin", "layout");
  back("/admin/tracking", { ok: "Rascunho do tracking global descartado." });
}

export async function uploadMediaAction(fd: FormData) {
  const actor = await requireAdmin({ mutation: true });
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) back("/admin/midia", { err: ["Escolha um arquivo."] });
  if (!allow(`upload:${actor.id}`, 30, 10 * 60_000)) back("/admin/midia", { err: ["Muitos envios seguidos. Aguarde alguns minutos."] });
  const result = await saveUpload(Buffer.from(await file.arrayBuffer()), file.name, actor.id === "dev-local" ? null : actor.id).catch((error: unknown) => {
    // The reason is logged (never a secret: the object-store client only reports the HTTP status) and its class shown to the owner.
    console.error("[admin] media upload failed:", error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 300) : "unknown");
    return { ok: false as const, error: describeUploadFailure(error, process.env.BUCKET_ADDRESSING) };
  });
  revalidatePath("/admin", "layout");
  if (!result.ok) back("/admin/midia", { err: [result.error] });
  await audit(actor, "media.upload", "sul", result.choice.assetId);
  back("/admin/midia", { ok: result.duplicate ? `A imagem "${result.choice.label}" já existia; foi reaproveitada.` : `Imagem "${result.choice.label}" enviada${platform().mode === "prod" ? "" : " (somente neste computador)"}.` });
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
  if (last && last.status === "succeeded" && Date.now() - new Date(last.startedAt).getTime() < SYNC_MIN_INTERVAL_MS) back("/admin/colecoes", { err: ["A última sincronização foi há poucos minutos. Aguarde um pouco antes de repetir."] });
  const run = await syncs.start("collections", actor.id);
  if (!run) back("/admin/colecoes", { err: ["Já há uma sincronização de coleções em andamento."] });
  let outcomes: Awaited<ReturnType<typeof syncCollections>>;
  try {
    outcomes = await syncCollections();
  } catch (error) {
    await syncs.finish(run.id, { ok: false, error: error instanceof Error ? error.message : "erro" }).catch(() => undefined);
    back("/admin/colecoes", { err: ["Falha ao sincronizar. Os dados anteriores foram mantidos."] });
  }
  const failed = outcomes.filter((o) => !o.ok);
  const summary = { stores: outcomes.length, failed: failed.length, requests: outcomes.reduce((n, o) => n + (o.ok ? o.requests : 0), 0) };
  // A run in which any store failed is recorded as failed: it must not throttle the retry the person makes right after fixing the cause.
  await syncs.finish(run.id, failed.length === 0 ? { ok: true, summary } : { ok: false, error: failed.map((f) => (f.ok ? "" : `${f.storeKey}: ${f.error}`)).join("; ").slice(0, 500) });
  await platform().audit.record({ actor: actor.id, action: "collections.sync", meta: summary }).catch(() => undefined);
  revalidatePath("/[region]", "layout");
  revalidatePath("/admin", "layout");
  back("/admin/colecoes", failed.length ? { err: [`Sincronização parcial: ${failed.map((f) => (f.ok ? "" : `${f.storeKey}: ${f.error}`)).join("; ")}. Os dados anteriores foram mantidos.`] } : { ok: `Coleções sincronizadas (${summary.requests} requisições de leitura à INK).` });
}

/**
 * Refreshes the CATALOG (and then the collections) of the INK store of the region being edited. Owner only. Read-only against INK, paced (a
 * store takes a few minutes), so it runs in the background exactly like the authenticated route: the person is answered at once and the
 * Coleções screen shows the job. One sync at a time (the same in-process lock as the route); never touches the last-good data on failure.
 */
export async function syncCatalogAction(fd: FormData) {
  const actor = await requireAdmin({ mutation: true, owner: true });
  const scope = await scopeOf(fd, actor);
  const store = storeOf(scope);
  if (!tokenFor(store)) back("/admin/colecoes", { err: [`A variável ${INK_STORES[store]?.tokenEnv ?? "INK_TOKEN_*"} não está configurada neste ambiente (ou o serviço ainda não terminou de reiniciar depois de criá-la).`] });
  let running: ReturnType<typeof beginSyncJob>;
  try {
    running = beginSyncJob([store]);
  } catch (error) {
    if (error instanceof SyncAlreadyRunningError) back("/admin/colecoes", { err: ["Já há uma sincronização de catálogo em andamento. Aguarde terminar."] });
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
  back("/admin/colecoes", { ok: `Sincronização do catálogo de ${scopeName(scope)} iniciada. Leva alguns minutos; recarregue esta página para acompanhar. As coleções são atualizadas ao final.` });
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

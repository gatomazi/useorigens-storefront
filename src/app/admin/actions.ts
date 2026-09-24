"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requireAdmin, SESSION_COOKIE } from "@/lib/admin/auth/guard";
import { deleteUpload, saveUpload } from "@/lib/admin/media";
import { platform } from "@/lib/admin/platform";
import { publishRelease, reconcileReleases, type PublishDeps } from "@/lib/admin/publishing";
import { publishDeps } from "@/lib/admin/ops";
import { allow } from "@/lib/admin/auth/rate-limit";
import { syncCollections } from "@/lib/catalog/collections-sync";
import { ALL_SCOPES } from "@/lib/admin/auth/authorize";
import type { Actor } from "@/lib/admin/store/ports";
import { findCollection } from "@/lib/catalog/collections-file";
import { collectionState } from "@/lib/catalog/collections";
import { enabledInternalIds } from "@/lib/site-config/collections-enabled";
import { sourceProblem } from "@/lib/admin/validate-draft";
import { parseCollectionRef, parseSectionForm } from "@/lib/admin/section-form";
import { applyAndSave, discardDraft, loadWorkspace, SCOPE, type SaveOutcome } from "@/lib/admin/workspace";
import type { DraftOp } from "@/lib/admin/draft-ops";

/**
 * Every server action of the CMS. Each one authenticates and authorises on its own (`requireAdmin`: development guard or Google session,
 * host, Origin, role, region) before doing anything — the proxy and the layout are not trusted as the only barrier — and answers with a
 * redirect carrying a short flash message, so a reload never re-submits a form.
 */
const edit = () => requireAdmin({ mutation: true, scope: SCOPE });
const deps = (actor: Actor): PublishDeps => publishDeps(actor.id === "dev-local" ? null : actor.id);
const audit = (actor: Actor, action: Parameters<ReturnType<typeof platform>["audit"]["record"]>[0]["action"], target?: string, meta?: Record<string, unknown>) =>
  platform().audit.record({ actor: actor.id, action, scope: SCOPE, target: target ?? null, meta: meta ?? null }).catch(() => undefined);

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
  const actor = await edit();
  const outcome: SaveOutcome = await applyAndSave(op, revNumber(fd), actor);
  revalidatePath("/admin", "layout");
  if (!outcome.ok) back(returnTo, { err: outcome.errors });
  await audit(actor, "draft.save", op.type);
  if (focusToEditor && outcome.focusId) back(`/admin/home/${outcome.focusId}`, { ok: okMessage });
  back(returnTo, { ok: okMessage });
}

export async function addCollectionSection(fd: FormData) {
  await edit();
  const ref = parseCollectionRef(text(fd, "collection"));
  if (!ref) back("/admin/home", { err: ["Escolha uma coleção nas sugestões (digite parte do nome)."] });
  // Same rule the editor's autocomplete applies, enforced here too: never trust that the form only offered valid choices.
  const problem = sourceProblem({ kind: "ink-category", ...ref, order: "category", limit: 6 }, (await loadWorkspace()).doc);
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

export async function duplicateSection(fd: FormData) {
  return run(fd, { type: "duplicate", id: text(fd, "id") }, "Seção duplicada (a cópia começa oculta).", "/admin/home", true);
}

export async function removeSection(fd: FormData) {
  return run(fd, { type: "remove", id: text(fd, "id") }, "Seção removida do rascunho.", "/admin/home");
}

export async function saveSection(fd: FormData) {
  await edit();
  const id = text(fd, "id");
  const ws = await loadWorkspace();
  const section = ws.doc.home?.sections.find((s) => s.id === id);
  if (!section) back("/admin/home", { err: ["Seção não encontrada."] });
  const patch = parseSectionForm(fd, section);
  const problem = patch.source ? sourceProblem(patch.source, ws.doc) : null;
  if (problem) back(`/admin/home/${id}`, { err: [problem] });
  return run(fd, { type: "update", id, patch }, "Rascunho salvo.", `/admin/home/${id}`);
}

/**
 * Library: enable or disable ONE internal collection for the Sul document. Explicit, individual, reversible; nothing is sent to INK.
 * Enabling requires the collection to exist, be internal, and have enough real products; disabling is refused (with the list of
 * sections) while a section uses it. `q`, `f` and `from` only carry the library's own filter and the "back to where I was" link.
 */
export async function setCollectionEnabledAction(fd: FormData) {
  const actor = await edit();
  const ref = parseCollectionRef(text(fd, "ref"));
  const enable = text(fd, "enabled") === "true";
  const from = text(fd, "from");
  const q = new URLSearchParams();
  for (const k of ["q", "f"]) if (text(fd, k)) q.set(k, text(fd, k));
  if (from.startsWith("/admin/")) q.set("from", from);
  const to = `/admin/colecoes${q.size ? `?${q}` : ""}`;
  if (!ref || ref.store !== "use-sul") back(to, { err: ["Só as coleções do Sul podem ser habilitadas nesta versão."] });
  const record = findCollection(ref.store, ref.collectionId);
  if (!record) back(to, { err: ["Coleção não encontrada no snapshot sincronizado."] });
  if (record.isAvailable) back(to, { err: ["Coleções públicas já podem ser usadas; só as internas precisam ser habilitadas."] });
  if (enable) {
    const state = collectionState(record, new Set());
    if (!state.eligible) back(to, { err: [state.reason === "needs-resync" ? "Registro antigo: rode npm run collections:sync antes de habilitar." : `Só ${record.matchedCount} produto(s) dessa coleção existem no catálogo local (mínimo 3).`] });
  }
  const outcome = await applyAndSave({ type: "set-collection-enabled", ...ref, enabled: enable }, revNumber(fd), actor);
  revalidatePath("/admin", "layout");
  if (!outcome.ok) back(to, { err: outcome.errors });
  const enabledNow = enabledInternalIds((await loadWorkspace()).doc, ref.store).has(ref.collectionId);
  back(to, { ok: enabledNow ? `“${record.name}” habilitada para uso no CMS (a INK não foi alterada).` : `“${record.name}” desabilitada.` });
}

export async function discardDraftAction() {
  const actor = await edit();
  await discardDraft();
  await audit(actor, "draft.discard");
  revalidatePath("/admin", "layout");
  back("/admin/publicar", { ok: "Rascunho descartado: o editor voltou ao que está publicado." });
}

const revalidateStorefront = async () => {
  revalidatePath("/[region]", "layout");
};

export async function publishAction(fd: FormData) {
  const actor = await edit();
  const ws = await loadWorkspace();
  // A publish left `pending` by a crashed request would block this one until the reconciler fails it: repair first.
  await reconcileReleases(deps(actor), revalidateStorefront).catch(() => undefined);
  const result = await publishRelease(deps(actor), { kind: "publish", doc: ws.doc, note: text(fd, "note").slice(0, 200) || undefined }, revalidateStorefront).catch((error: unknown) => ({ ok: false as const, errors: [error instanceof Error && error.message.includes("in flight") ? "Já há uma publicação em andamento. Aguarde alguns segundos e tente de novo." : "Não foi possível publicar agora. Nada mudou na loja."] }));
  revalidatePath("/admin", "layout");
  if (!result.ok) back("/admin/publicar", { err: result.errors });
  const o = result.outcome;
  await audit(actor, o.status === "failed" ? "publish.failed" : "publish", o.releaseId, { status: o.status });
  const where = platform().mode === "prod" ? "Publicado" : "Publicado no sandbox local";
  if (o.status === "published") back("/admin/publicar", { ok: `${where} (release ${o.releaseId}).` });
  if (o.status === "failed") back("/admin/publicar", { err: ["A publicação falhou ao gravar o arquivo; a versão anterior continua no ar."] });
  back("/admin/publicar", { ok: `Publicação concluída com aviso (${o.status}); o reconciliador corrige na próxima abertura.` });
}

export async function rollbackAction(fd: FormData) {
  const actor = await edit();
  const toReleaseId = text(fd, "release");
  await reconcileReleases(deps(actor), revalidateStorefront).catch(() => undefined);
  const result = await publishRelease(deps(actor), { kind: "rollback", toReleaseId, note: `Restaurada a versão ${toReleaseId}` }, revalidateStorefront).catch(() => ({ ok: false as const, errors: ["Não foi possível restaurar agora. Nada mudou na loja."] }));
  if (!result.ok) back("/admin/publicar", { err: result.errors });
  // The working draft follows the restored version so the editor shows what is now live.
  await discardDraft();
  await audit(actor, "rollback", toReleaseId, { status: result.outcome.status });
  revalidatePath("/admin", "layout");
  back("/admin/publicar", { ok: `Versão ${toReleaseId} restaurada como nova publicação${platform().mode === "prod" ? "" : " no sandbox local"}.` });
}

export async function reconcileAction() {
  const actor = await edit();
  const done = await reconcileReleases(deps(actor), revalidateStorefront);
  if (done.length) await audit(actor, "reconcile", undefined, { actions: done });
  revalidatePath("/admin", "layout");
  back("/admin/publicar", { ok: done.length ? `Reconciliação aplicada: ${done.join(", ")}.` : "Nada a reconciliar: arquivo, registro e cache estão coerentes." });
}

export async function uploadMediaAction(fd: FormData) {
  const actor = await edit();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) back("/admin/midia", { err: ["Escolha um arquivo."] });
  if (!allow(`upload:${actor.id}`, 30, 10 * 60_000)) back("/admin/midia", { err: ["Muitos envios seguidos. Aguarde alguns minutos."] });
  const result = await saveUpload(Buffer.from(await file.arrayBuffer()), file.name, actor.id === "dev-local" ? null : actor.id).catch(() => ({ ok: false as const, error: "não foi possível salvar a imagem agora" }));
  revalidatePath("/admin", "layout");
  if (!result.ok) back("/admin/midia", { err: [result.error] });
  await audit(actor, "media.upload", result.choice.assetId);
  back("/admin/midia", { ok: result.duplicate ? `A imagem "${result.choice.label}" já existia; foi reaproveitada.` : `Imagem "${result.choice.label}" enviada${platform().mode === "prod" ? "" : " (somente neste computador)"}.` });
}

export async function deleteMediaAction(fd: FormData) {
  const actor = await edit();
  const assetId = text(fd, "assetId");
  const ws = await loadWorkspace();
  if (JSON.stringify(ws.doc).includes(assetId)) back("/admin/midia", { err: ["Essa imagem está em uso no rascunho. Troque-a antes de excluir."] });
  const result = await deleteUpload(assetId);
  revalidatePath("/admin", "layout");
  if (!result.ok) back("/admin/midia", { err: [result.error] });
  await audit(actor, "media.delete", assetId);
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
  await syncs.finish(run.id, { ok: true, summary });
  await platform().audit.record({ actor: actor.id, action: "collections.sync", meta: summary }).catch(() => undefined);
  revalidatePath("/[region]", "layout");
  revalidatePath("/admin", "layout");
  back("/admin/colecoes", failed.length ? { err: [`Sincronização parcial: ${failed.map((f) => (f.ok ? "" : `${f.storeKey}: ${f.error}`)).join("; ")}. Os dados anteriores foram mantidos.`] } : { ok: `Coleções sincronizadas (${summary.requests} requisições de leitura à INK).` });
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
  back("/admin/usuarios", { ok: "Editor cadastrado. Ele já pode entrar com a conta Google desse e-mail." });
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
  jar.set(SESSION_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  await platform().audit.record({ actor: actor.id, action: "logout" }).catch(() => undefined);
  redirect("/admin/login");
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDevAdmin } from "@/lib/admin/require-dev-admin";
import { deleteUpload, listUploads, saveUpload } from "@/lib/admin/media";
import { findCollection } from "@/lib/catalog/collections-file";
import { parseCollectionRef, parseSectionForm } from "@/lib/admin/section-form";
import { publishToSandbox, reconcileSandbox } from "@/lib/admin/sandbox-publish";
import { applyAndSave, discardDraft, loadWorkspace, type SaveOutcome } from "@/lib/admin/workspace";
import type { DraftOp } from "@/lib/admin/draft-ops";

/**
 * Every server action of the local CMS. Each one re-checks that the request is the developer's own localhost (`requireDevAdmin`) before
 * doing anything — the proxy and the layout are not trusted as the only barrier — and answers with a redirect carrying a short flash
 * message, so a reload never re-submits a form. Nothing here reaches a production Volume, database or bucket.
 */
const text = (fd: FormData, name: string) => (typeof fd.get(name) === "string" ? (fd.get(name) as string).trim() : "");
const revNumber = (fd: FormData): number | null => {
  const v = text(fd, "rev");
  return v === "" || v === "null" ? null : Number(v);
};

function back(path: string, flash: { ok?: string; err?: string[] }): never {
  const q = new URLSearchParams();
  if (flash.ok) q.set("ok", flash.ok);
  if (flash.err?.length) q.set("err", flash.err.join(" | ").slice(0, 900));
  redirect(`${path}${q.size ? `?${q}` : ""}`);
}

async function run(fd: FormData, op: DraftOp, okMessage: string, returnTo: string, focusToEditor = false): Promise<never> {
  await requireDevAdmin();
  const outcome: SaveOutcome = await applyAndSave(op, revNumber(fd));
  revalidatePath("/admin", "layout");
  if (!outcome.ok) back(returnTo, { err: outcome.errors });
  if (focusToEditor && outcome.focusId) back(`/admin/home/${outcome.focusId}`, { ok: okMessage });
  back(returnTo, { ok: okMessage });
}

export async function addCollectionSection(fd: FormData) {
  const ref = parseCollectionRef(text(fd, "collection"));
  if (!ref) back("/admin/home", { err: ["Escolha uma coleção da lista."] });
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
  await requireDevAdmin();
  const id = text(fd, "id");
  const ws = await loadWorkspace();
  const section = ws.doc.home?.sections.find((s) => s.id === id);
  if (!section) back("/admin/home", { err: ["Seção não encontrada."] });
  return run(fd, { type: "update", id, patch: parseSectionForm(fd, section) }, "Rascunho salvo.", `/admin/home/${id}`);
}

export async function discardDraftAction() {
  await requireDevAdmin();
  await discardDraft();
  revalidatePath("/admin", "layout");
  back("/admin/publicar", { ok: "Rascunho descartado: o editor voltou ao que está publicado." });
}

const revalidateStorefront = async () => {
  revalidatePath("/[region]", "layout");
};

export async function publishAction(fd: FormData) {
  await requireDevAdmin();
  const ws = await loadWorkspace();
  const result = await publishToSandbox({ kind: "publish", doc: ws.doc, note: text(fd, "note").slice(0, 200) || undefined }, revalidateStorefront);
  revalidatePath("/admin", "layout");
  if (!result.ok) back("/admin/publicar", { err: result.errors });
  const o = result.outcome;
  if (o.status === "published") {
    back("/admin/publicar", { ok: `Publicado no sandbox local (release ${o.releaseId}).` });
  }
  if (o.status === "failed") back("/admin/publicar", { err: ["A publicação falhou ao gravar o arquivo; a versão anterior continua no ar."] });
  back("/admin/publicar", { ok: `Publicação concluída com aviso (${o.status}); o reconciliador corrige na próxima abertura.` });
}

export async function rollbackAction(fd: FormData) {
  await requireDevAdmin();
  const toReleaseId = text(fd, "release");
  const result = await publishToSandbox({ kind: "rollback", toReleaseId, note: `Restaurada a versão ${toReleaseId}` }, revalidateStorefront);
  if (!result.ok) back("/admin/publicar", { err: result.errors });
  // The working draft follows the restored version so the editor shows what is now live.
  await discardDraft();
  revalidatePath("/admin", "layout");
  back("/admin/publicar", { ok: `Versão ${toReleaseId} restaurada como nova publicação no sandbox local.` });
}

export async function reconcileAction() {
  await requireDevAdmin();
  const done = await reconcileSandbox(revalidateStorefront);
  revalidatePath("/admin", "layout");
  back("/admin/publicar", { ok: done.length ? `Reconciliação aplicada: ${done.join(", ")}.` : "Nada a reconciliar: arquivo, registro e cache estão coerentes." });
}

export async function uploadMediaAction(fd: FormData) {
  await requireDevAdmin();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) back("/admin/midia", { err: ["Escolha um arquivo."] });
  const result = await saveUpload(Buffer.from(await file.arrayBuffer()), file.name);
  revalidatePath("/admin", "layout");
  if (!result.ok) back("/admin/midia", { err: [result.error] });
  back("/admin/midia", { ok: `Imagem "${result.choice.label}" enviada (somente neste computador).` });
}

export async function deleteMediaAction(fd: FormData) {
  await requireDevAdmin();
  const assetId = text(fd, "assetId");
  const ws = await loadWorkspace();
  const used = JSON.stringify(ws.doc).includes(assetId);
  if (used) back("/admin/midia", { err: ["Essa imagem está em uso no rascunho. Troque-a antes de excluir."] });
  const ok = await deleteUpload(assetId);
  revalidatePath("/admin", "layout");
  const still = (await listUploads()).some((u) => u.assetId === assetId);
  back("/admin/midia", ok && !still ? { ok: "Imagem excluída." } : { err: ["Não foi possível excluir."] });
}

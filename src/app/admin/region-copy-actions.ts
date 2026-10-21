"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { COPY_PARTS, isCopyPart, type CopyRequest, type CopyReview } from "@/lib/admin/region-copy";
import { reviewRegionCopy, saveRegionCopy } from "@/lib/admin/region-copy-service";
import { isRegionScope, scopeName } from "@/lib/admin/scope";

const text = (fd: FormData, name: string): string => typeof fd.get(name) === "string" ? (fd.get(name) as string).trim() : "";

function copyRequest(fd: FormData): CopyRequest | null {
  const scope = text(fd, "scope");
  const fromScope = text(fd, "fromScope");
  const part = text(fd, "part");
  const sourceVersion = text(fd, "sourceVersion");
  const rawRev = text(fd, "rev");
  const rev = rawRev === "null" ? null : Number(rawRev);
  if (!isRegionScope(scope) || !isRegionScope(fromScope) || scope === fromScope || !isCopyPart(part) || !["working", "published"].includes(sourceVersion) || !rawRev || rev !== null && (!Number.isSafeInteger(rev) || rev < 1)) return null;
  let mappings: unknown;
  try { mappings = JSON.parse(text(fd, "mappings") || "{}"); } catch { return null; }
  if (!mappings || typeof mappings !== "object" || Array.isArray(mappings) || Object.keys(mappings).length > 300 || Object.values(mappings).some((v) => typeof v !== "string" || !/^\d{1,20}$/.test(v))) return null;
  return { scope, fromScope, part, sourceVersion: sourceVersion as CopyRequest["sourceVersion"], sourceId: text(fd, "sourceId"), rev, mappings: mappings as Record<string, string> };
}

export async function reviewRegionCopyAction(fd: FormData): Promise<CopyReview> {
  const actor = await requireAdmin({ mutation: true });
  const request = copyRequest(fd);
  return request ? reviewRegionCopy(actor, request) : { ok: false, errors: ["Escolha outra região e uma configuração válida para copiar."] };
}

export async function copyRegionConfigurationAction(fd: FormData): Promise<void> {
  const actor = await requireAdmin({ mutation: true });
  const request = copyRequest(fd);
  if (!request) redirect(`/admin?err=${encodeURIComponent("Configuração de cópia inválida. Reabra a tela e tente novamente.")}`);
  const result = await saveRegionCopy(actor, request, text(fd, "checksum"));
  const path = COPY_PARTS[request.part].path;
  if (!result.ok) redirect(`${path}?err=${encodeURIComponent(result.errors.join(" | ").slice(0, 900))}`);
  revalidatePath("/admin", "layout");
  const target = result.focusId ? `${path}/${result.focusId}` : path;
  redirect(`${target}?ok=${encodeURIComponent(`${COPY_PARTS[request.part].label} copiada de ${scopeName(request.fromScope)} para o rascunho de ${scopeName(request.scope)}. Revise os ajustes antes de publicar.`)}`);
}

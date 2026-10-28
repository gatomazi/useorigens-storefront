"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { platform } from "@/lib/admin/platform";
import { canEdit } from "@/lib/admin/store/ports";
import { isPartnerStatus, STATUS_LABEL } from "@/lib/partners/application";
import { partnerStoreOrNull } from "@/lib/partners/server";

const text = (fd: FormData, name: string): string => (typeof fd.get(name) === "string" ? (fd.get(name) as string).trim() : "");

function back(query: string, flash: { ok?: string; err?: string }): never {
  const q = new URLSearchParams(query);
  q.delete("ok");
  q.delete("err");
  if (flash.ok) q.set("ok", flash.ok);
  if (flash.err) q.set("err", flash.err);
  redirect(`/admin/parceiros${q.size ? `?${q}` : ""}`);
}

/**
 * Moves one partner application in the team's queue (Nova → Em conversa → Parceria fechada / Não seguiu). The region comes from the stored
 * application, never from the form: an editor of another region cannot touch it even with a forged form.
 */
export async function setPartnerStatusAction(fd: FormData) {
  const actor = await requireAdmin({ mutation: true });
  // The list's own filters, kept after the redirect (only the known keys, so nothing else rides along).
  const from = new URLSearchParams(text(fd, "from"));
  const query = new URLSearchParams([...from].filter(([k]) => k === "s" || k === "p")).toString();
  const store = partnerStoreOrNull();
  if (!store) back(query, { err: "Este ambiente não guarda inscrições." });
  const application = await store.get(text(fd, "id")).catch(() => null);
  if (!application || !canEdit(actor, application.region)) {
    await platform().audit.record({ actor: actor.id, action: "access.denied", scope: application?.region ?? "global", target: "partner", meta: null }).catch(() => undefined);
    back(query, { err: "Inscrição não encontrada ou sem permissão para essa região." });
  }
  const to = text(fd, "status");
  if (!isPartnerStatus(to)) back(query, { err: "Estado desconhecido." });
  if (to === application.status) back(query, {});
  const updated = await store.setStatus(application.id, to).catch(() => null);
  if (!updated) back(query, { err: "Não foi possível mudar o estado agora." });
  await platform().audit.record({ actor: actor.id, action: "partner.status", scope: application.region, target: application.id, meta: { to } }).catch(() => undefined);
  revalidatePath("/admin", "layout");
  back(query, { ok: `${application.name}: ${STATUS_LABEL[to]}.` });
}

"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { isUserId } from "@/lib/instagram/history";
import { reactivateBot } from "@/lib/instagram/history-client";

const text = (fd: FormData, name: string): string => (typeof fd.get(name) === "string" ? (fd.get(name) as string).trim() : "");

function back(userId: string, flash: { ok?: string; err?: string }): never {
  const q = new URLSearchParams();
  if (flash.ok) q.set("ok", flash.ok);
  if (flash.err) q.set("err", flash.err);
  redirect(`/admin/conversas/${encodeURIComponent(userId)}${q.size ? `?${q}` : ""}`);
}

/**
 * Turns the Instagram DM bot back on for one conversation before its 24 h pause ends. Anyone who may see the conversations may do it. Who did
 * it is recorded in the webhook's history (X-Actor), not in the panel's audit log, whose actions are a fixed list in the database.
 */
export async function reactivateBotAction(fd: FormData) {
  const actor = await requireAdmin({ mutation: true });
  const userId = text(fd, "userId");
  if (!isUserId(userId)) redirect("/admin/conversas");
  const result = await reactivateBot(userId, actor.email);
  if (!result.ok) back(userId, { err: result.reason === "not-configured" ? "O histórico do Instagram não está configurado neste ambiente." : "Não foi possível falar com o webhook agora. Tente de novo em instantes." });
  back(userId, { ok: result.data.wasPaused ? "Bot reativado nesta conversa: ele volta a responder a próxima mensagem." : "O bot já não estava pausado nesta conversa." });
}

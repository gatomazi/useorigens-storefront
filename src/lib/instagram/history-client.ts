import "server-only";
import { isUserId, parseConversation, parseConversationList, type Conversation, type ConversationList } from "./history";

/**
 * Reads the Instagram webhook's history API (another Railway project, so over its public URL). Env: INSTAGRAM_HISTORY_URL (the webhook's
 * base URL) and INSTAGRAM_HISTORY_SECRET (sent as X-Api-Secret; the webhook answers 404 without it). Both are read per request and are
 * optional: without them the page says the history is not configured, and nothing else in the panel changes.
 */

export type HistoryResult<T> = { ok: true; data: T } | { ok: false; reason: "not-configured" | "unavailable" | "not-found" };

function historyConfig(): { base: string; secret: string } | null {
  const base = process.env.INSTAGRAM_HISTORY_URL?.trim().replace(/\/+$/, "");
  const secret = process.env.INSTAGRAM_HISTORY_SECRET?.trim();
  if (!base || !secret) return null;
  try {
    const url = new URL(base);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return null;
  } catch {
    return null;
  }
  return { base, secret };
}

async function getJson(path: string, init: { method?: "GET" | "POST"; actor?: string } = {}): Promise<HistoryResult<unknown>> {
  const config = historyConfig();
  if (!config) return { ok: false, reason: "not-configured" };
  const headers: Record<string, string> = { "X-Api-Secret": config.secret };
  if (init.actor) headers["X-Actor"] = init.actor.slice(0, 120);
  try {
    const res = await fetch(`${config.base}${path}`, { method: init.method ?? "GET", headers, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (res.status === 404) return { ok: false, reason: "not-found" };
    if (!res.ok) return { ok: false, reason: "unavailable" };
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export async function listConversations(): Promise<HistoryResult<ConversationList>> {
  const r = await getJson("/historico/conversas");
  // On the list endpoint a 404 means the webhook has the history turned off (or the secret is wrong), not "no conversations".
  if (!r.ok) return r.reason === "not-found" ? { ok: false, reason: "unavailable" } : r;
  return { ok: true, data: parseConversationList(r.data) };
}

export async function getConversation(userId: string): Promise<HistoryResult<Conversation>> {
  if (!isUserId(userId)) return { ok: false, reason: "not-found" };
  const r = await getJson(`/historico/conversas/${encodeURIComponent(userId)}`);
  if (!r.ok) return r;
  const conv = parseConversation(r.data);
  return conv ? { ok: true, data: conv } : { ok: false, reason: "unavailable" };
}

/** Lifts the DM bot's pause on one conversation (the team took over and is done, or the pause was a mistake). `actor` only goes to the webhook's history. */
export async function reactivateBot(userId: string, actor: string): Promise<HistoryResult<{ wasPaused: boolean }>> {
  if (!isUserId(userId)) return { ok: false, reason: "not-found" };
  const r = await getJson(`/historico/conversas/${encodeURIComponent(userId)}/reativar`, { method: "POST", actor });
  if (!r.ok) return r;
  const wasPaused = typeof r.data === "object" && r.data !== null && (r.data as { reativado?: unknown }).reativado === true;
  return { ok: true, data: { wasPaused } };
}

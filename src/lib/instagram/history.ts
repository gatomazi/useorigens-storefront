/**
 * The message history kept by the Instagram webhook (repository instagram-webhook-go, `history.go`): what came in from customers and what
 * went out (public replies, DMs with links, the DM bot, the team typing by hand). The webhook keeps 10 days and deletes the rest; the panel
 * only reads it. Everything here is pure: parsing of the webhook's JSON (never trusted as-is) and the labels the pages show.
 */

export type HistoryAuthor = "cliente" | "bot" | "bot_sombra" | "equipe";

export type HistoryEvent = {
  id: string;
  at: string;
  channel: string;
  direction: "entrada" | "saida";
  author: HistoryAuthor;
  kind: string;
  userId: string;
  username: string | null;
  text: string;
  detail: string | null;
};

export type ConversationSummary = {
  userId: string;
  username: string | null;
  channels: string[];
  lastAt: string;
  lastText: string;
  lastAuthor: HistoryAuthor;
  total: number;
  handoffs: number;
  shadow: number;
  pausedUntil: string | null;
};

export type ConversationList = { retentionDays: number; botMode: string; conversations: ConversationSummary[] };
export type Conversation = { userId: string; username: string | null; pausedUntil: string | null; events: HistoryEvent[] };

export const AUTHOR_LABEL: Record<HistoryAuthor, string> = {
  cliente: "Cliente",
  bot: "Bot",
  bot_sombra: "Bot (sombra, não enviada)",
  equipe: "Equipe",
};

export const CHANNEL_LABEL: Record<string, string> = {
  instagram_dm: "DM Instagram",
  instagram_comentario: "Comentário Instagram",
  facebook_comentario: "Comentário Facebook",
  messenger: "Messenger",
};

export const KIND_LABEL: Record<string, string> = {
  mensagem: "Mensagem",
  comentario: "Comentário",
  resposta_publica: "Resposta pública",
  dm_link: "DM com link",
  resposta_bot: "Resposta do bot",
  handoff: "Passou para humano",
  ignorado: "Bot não respondeu",
  reativado: "Bot reativado",
};

export const BOT_MODE_LABEL: Record<string, string> = { off: "desligado", shadow: "sombra (gera e não envia)", on: "ligado" };

export const channelLabel = (c: string) => CHANNEL_LABEL[c] ?? c;
export const kindLabel = (k: string) => KIND_LABEL[k] ?? k;

const AUTHORS: readonly string[] = ["cliente", "bot", "bot_sombra", "equipe"];
// IGSIDs, PSIDs and comment user ids are digits; anything else is refused before it reaches a URL.
const USER_ID = /^[0-9A-Za-z_-]{1,64}$/;

export const isUserId = (v: string) => USER_ID.test(v);

const str = (v: unknown, max = 4000) => (typeof v === "string" ? v.slice(0, max) : "");
const optStr = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.slice(0, max) : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const author = (v: unknown): HistoryAuthor => (typeof v === "string" && AUTHORS.includes(v) ? (v as HistoryAuthor) : "cliente");
const record = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function parseEvent(v: unknown): HistoryEvent | null {
  const o = record(v);
  const userId = str(o.usuario_id, 64);
  if (!isUserId(userId)) return null;
  return {
    id: str(o.id, 40),
    at: str(o.em, 40),
    channel: str(o.canal, 40),
    direction: o.direcao === "saida" ? "saida" : "entrada",
    author: author(o.autor),
    kind: str(o.tipo, 40),
    userId,
    username: optStr(o.usuario, 60),
    text: str(o.texto),
    detail: optStr(o.detalhe),
  };
}

export function parseConversationList(v: unknown): ConversationList {
  const o = record(v);
  const conversations = (Array.isArray(o.conversas) ? o.conversas : [])
    .map((c): ConversationSummary | null => {
      const r = record(c);
      const userId = str(r.usuario_id, 64);
      if (!isUserId(userId)) return null;
      return {
        userId,
        username: optStr(r.usuario, 60),
        channels: (Array.isArray(r.canais) ? r.canais : []).map((x) => str(x, 40)).filter(Boolean),
        lastAt: str(r.ultima_em, 40),
        lastText: str(r.ultimo_texto, 300),
        lastAuthor: author(r.ultimo_autor),
        total: num(r.total),
        handoffs: num(r.handoffs),
        shadow: num(r.sombra),
        pausedUntil: optStr(r.pausado_ate, 40),
      };
    })
    .filter((c): c is ConversationSummary => c !== null);
  return { retentionDays: num(o.retencao_dias) || 10, botMode: str(o.bot_dm_modo, 20) || "off", conversations };
}

export function parseConversation(v: unknown): Conversation | null {
  const o = record(v);
  const userId = str(o.usuario_id, 64);
  if (!isUserId(userId)) return null;
  const events = (Array.isArray(o.eventos) ? o.eventos : []).map(parseEvent).filter((e): e is HistoryEvent => e !== null);
  return { userId, username: optStr(o.usuario, 60), pausedUntil: optStr(o.pausado_ate, 40), events };
}

/** Narrow the list by what the team is looking for. */
export type ConversationFilter = "todas" | "handoff" | "sombra" | "pausadas";

export function filterConversations(list: ConversationSummary[], filter: ConversationFilter, query: string): ConversationSummary[] {
  const q = query.trim().toLowerCase().replace(/^@/, "");
  return list.filter((c) => {
    if (filter === "handoff" && c.handoffs === 0) return false;
    if (filter === "sombra" && c.shadow === 0) return false;
    if (filter === "pausadas" && !c.pausedUntil) return false;
    if (q && !(c.username ?? "").toLowerCase().includes(q) && !c.userId.includes(q) && !c.lastText.toLowerCase().includes(q)) return false;
    return true;
  });
}

export const formatWhen = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

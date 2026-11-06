import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { listConversations } from "@/lib/instagram/history-client";
import { AUTHOR_LABEL, BOT_MODE_LABEL, CHANNEL_FILTERS, channelLabel, filterConversations, formatWhen, isChannelFilter, type ConversationFilter } from "@/lib/instagram/history";

const FILTERS: { value: ConversationFilter; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "handoff", label: "Passaram para humano" },
  { value: "sombra", label: "Com resposta em sombra" },
  { value: "pausadas", label: "Bot pausado" },
];

/** What the Instagram webhook received and sent in the last days (comments, DMs, the DM bot), read from the webhook; nothing is stored here. */
export default async function ConversationsPage({ searchParams }: { searchParams: Promise<{ f?: string; q?: string; c?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const filter = (FILTERS.find((f) => f.value === sp.f)?.value ?? "todas") as ConversationFilter;
  const q = (sp.q ?? "").slice(0, 80);
  const channel = isChannelFilter(sp.c) ? sp.c : "todos";
  const result = await listConversations();
  const rows = result.ok ? filterConversations(result.data.conversations, filter, q, channel) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="a-h1">Conversas do Instagram</h1>
        <p className="a-muted mt-3 max-w-3xl">
          O que entrou (comentários e DMs) e o que saiu (respostas públicas, DMs com link, bot de DMs e respostas da equipe). O webhook guarda{" "}
          {result.ok ? result.data.retentionDays : 10} dias e apaga o resto sozinho; o painel só lê.
        </p>
        {result.ok && (
          <p className="mt-3 text-[0.875rem]">
            Bot de DMs: <span className={`a-badge ${result.data.botMode === "on" ? "ok" : result.data.botMode === "shadow" ? "warn" : ""}`}>{BOT_MODE_LABEL[result.data.botMode] ?? result.data.botMode}</span>
          </p>
        )}
      </div>

      {!result.ok ? (
        <section className="a-card p-5" role="status">
          {result.reason === "not-configured" ? (
            <p>O histórico ainda não está ligado neste ambiente. Falta configurar <code>INSTAGRAM_HISTORY_URL</code> e <code>INSTAGRAM_HISTORY_SECRET</code> no serviço da loja.</p>
          ) : (
            <p>Não foi possível ler o histórico do webhook agora. Confira se ele está no ar e se <code>HISTORY_DIR</code> e o segredo batem dos dois lados.</p>
          )}
        </section>
      ) : (
        <>
          <form method="get" className="a-card flex flex-wrap items-end gap-4 p-5" aria-label="Filtros">
            <div>
              <label className="a-label" htmlFor="c">Canal</label>
              <select id="c" name="c" className="a-select" defaultValue={channel}>
                {CHANNEL_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <label className="a-label" htmlFor="f">Mostrar</label>
              <select id="f" name="f" className="a-select" defaultValue={filter}>
                {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div className="grow">
              <label className="a-label" htmlFor="q">Buscar (@, ID ou texto da última mensagem)</label>
              <input id="q" name="q" defaultValue={q} className="a-input" />
            </div>
            <button type="submit" className="a-btn ghost">Filtrar</button>
          </form>

          <section className="a-card overflow-x-auto" aria-label="Conversas">
            <table className="a-table a-stack">
              <caption className="sr-only">Conversas do Instagram</caption>
              <thead><tr><th scope="col">Cliente</th><th scope="col">Canais</th><th scope="col">Última mensagem</th><th scope="col">Quando</th><th scope="col">Situação</th><th scope="col"><span className="sr-only">Ação</span></th></tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={6} className="a-muted">{result.data.conversations.length === 0 ? "Nenhuma mensagem nos últimos dias." : "Nenhuma conversa com esses filtros."}</td></tr>}
                {rows.map((c) => (
                  <tr key={c.userId}>
                    <td data-label="Cliente" className="font-bold">{c.username ? `@${c.username}` : <span className="a-muted">{c.userId}</span>}</td>
                    <td data-label="Canais"><span className="flex flex-wrap gap-1">{c.channels.map((ch) => <span key={ch} className="a-badge">{channelLabel(ch)}</span>)}</span></td>
                    <td data-label="Última mensagem" className="max-w-md"><span className="a-muted">{AUTHOR_LABEL[c.lastAuthor]}:</span> {c.lastText.length > 120 ? `${c.lastText.slice(0, 120)}…` : c.lastText || <span className="a-muted">—</span>}</td>
                    <td data-label="Quando" className="a-muted whitespace-nowrap">{formatWhen(c.lastAt)}</td>
                    <td data-label="Situação">
                      <span className="flex flex-wrap gap-1">
                        {c.handoffs > 0 && <span className="a-badge warn">Humano ({c.handoffs})</span>}
                        {c.shadow > 0 && <span className="a-badge">Sombra ({c.shadow})</span>}
                        {c.pausedUntil && <span className="a-badge bad" title={`Bot pausado até ${formatWhen(c.pausedUntil)}`}>Bot pausado</span>}
                      </span>
                    </td>
                    <td className="text-right"><Link href={`/admin/conversas/${encodeURIComponent(c.userId)}${channel === "todos" ? "" : `?c=${channel}`}`} className="a-btn sm ghost">Abrir</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

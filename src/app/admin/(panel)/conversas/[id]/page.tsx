import Link from "next/link";
import { notFound } from "next/navigation";
import { reactivateBotAction } from "@/app/admin/instagram-actions";
import { Flash } from "@/components/admin/Flash";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { getConversation } from "@/lib/instagram/history-client";
import { AUTHOR_LABEL, CHANNEL_FILTERS, channelLabel, filterEvents, formatWhen, isChannelFilter, kindLabel, type HistoryAuthor } from "@/lib/instagram/history";

// The left rule tells who wrote it at a glance: customer, bot, bot in shadow (never sent) or someone of the team. Inline, because `.a-card`
// sets its own border and would win over a utility class.
const AUTHOR_RULE: Record<HistoryAuthor, React.CSSProperties> = {
  cliente: { borderLeft: "4px solid rgb(0 0 0 / 0.3)" },
  bot: { borderLeft: "4px solid var(--region-primary)" },
  bot_sombra: { borderLeft: "4px dashed rgb(0 0 0 / 0.45)", background: "rgb(0 0 0 / 0.03)" },
  equipe: { borderLeft: "4px solid #047857" },
};

/** One customer's messages in and out, oldest first, as the webhook recorded them. */
export default async function ConversationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string; c?: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const channel = isChannelFilter(sp.c) ? sp.c : "todos";
  const result = await getConversation(decodeURIComponent(id));
  if (!result.ok && result.reason === "not-found") notFound();

  return (
    <div className="space-y-6">
      <p><Link href="/admin/conversas" className="a-link">← Conversas</Link></p>
      <Flash ok={sp.ok} err={sp.err} />
      {!result.ok ? (
        <section className="a-card p-5" role="status">
          <p>{result.reason === "not-configured" ? "O histórico ainda não está ligado neste ambiente." : "Não foi possível ler o histórico do webhook agora."}</p>
        </section>
      ) : (
        <>
          <div>
            <h1 className="a-h1">{result.data.username ? `@${result.data.username}` : result.data.userId}</h1>
            <p className="a-muted mt-2 text-[0.875rem]">ID {result.data.userId}</p>
            {result.data.pausedUntil && (
              <form action={reactivateBotAction} className="mt-3 flex flex-wrap items-center gap-3">
                <span className="a-badge bad">Bot pausado até {formatWhen(result.data.pausedUntil)}</span>
                <input type="hidden" name="userId" value={result.data.userId} />
                <button type="submit" className="a-btn sm">Reativar bot</button>
                <span className="a-muted text-[0.8125rem]">Ele volta a responder a próxima mensagem desta pessoa.</span>
              </form>
            )}
          </div>
          <nav className="flex flex-wrap gap-2" aria-label="Canal">
            {CHANNEL_FILTERS.map((f) => (
              <Link key={f.value} href={`/admin/conversas/${encodeURIComponent(result.data.userId)}${f.value === "todos" ? "" : `?c=${f.value}`}`} aria-current={f.value === channel ? "page" : undefined} className={`a-btn sm ${f.value === channel ? "" : "ghost"}`}>
                {f.label}
              </Link>
            ))}
          </nav>
          {filterEvents(result.data.events, channel).length === 0 && <p className="a-muted">Nada neste canal nos últimos dias.</p>}
          <ol className="space-y-3" aria-label="Mensagens">
            {filterEvents(result.data.events, channel).map((e) => (
              <li key={e.id} className={`a-card p-4 ${e.direction === "saida" ? "ml-6 lg:ml-24" : "mr-6 lg:mr-24"}`} style={AUTHOR_RULE[e.author]}>
                <p className="flex flex-wrap items-center gap-2 text-[0.8125rem]">
                  <strong>{AUTHOR_LABEL[e.author]}</strong>
                  <span className="a-badge">{channelLabel(e.channel)}</span>
                  {e.kind && <span className={`a-badge ${e.kind === "handoff" ? "warn" : ""}`}>{kindLabel(e.kind)}</span>}
                  <span className="a-muted">{formatWhen(e.at)}</span>
                </p>
                {e.text && <p className="mt-2 whitespace-pre-wrap break-words">{e.text}</p>}
                {e.detail && <p className="a-muted mt-1 text-[0.8125rem]">{e.detail}</p>}
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

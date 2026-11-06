import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { getConversation } from "@/lib/instagram/history-client";
import { AUTHOR_LABEL, channelLabel, formatWhen, kindLabel, type HistoryAuthor } from "@/lib/instagram/history";

// The left rule tells who wrote it at a glance: customer, bot, bot in shadow (never sent) or someone of the team. Inline, because `.a-card`
// sets its own border and would win over a utility class.
const AUTHOR_RULE: Record<HistoryAuthor, React.CSSProperties> = {
  cliente: { borderLeft: "4px solid rgb(0 0 0 / 0.3)" },
  bot: { borderLeft: "4px solid var(--region-primary)" },
  bot_sombra: { borderLeft: "4px dashed rgb(0 0 0 / 0.45)", background: "rgb(0 0 0 / 0.03)" },
  equipe: { borderLeft: "4px solid #047857" },
};

/** One customer's messages in and out, oldest first, as the webhook recorded them. */
export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const result = await getConversation(decodeURIComponent(id));
  if (!result.ok && result.reason === "not-found") notFound();

  return (
    <div className="space-y-6">
      <p><Link href="/admin/conversas" className="a-link">← Conversas</Link></p>
      {!result.ok ? (
        <section className="a-card p-5" role="status">
          <p>{result.reason === "not-configured" ? "O histórico ainda não está ligado neste ambiente." : "Não foi possível ler o histórico do webhook agora."}</p>
        </section>
      ) : (
        <>
          <div>
            <h1 className="a-h1">{result.data.username ? `@${result.data.username}` : result.data.userId}</h1>
            <p className="a-muted mt-2 text-[0.875rem]">ID {result.data.userId}</p>
            {result.data.pausedUntil && <p className="mt-3"><span className="a-badge bad">Bot pausado até {formatWhen(result.data.pausedUntil)}</span></p>}
          </div>
          <ol className="space-y-3" aria-label="Mensagens">
            {result.data.events.map((e) => (
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

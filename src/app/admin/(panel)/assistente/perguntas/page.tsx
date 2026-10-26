import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { currentScope, scopeName } from "@/lib/admin/scope";
import { canEdit } from "@/lib/admin/store/ports";
import type { AssistantReplyKind } from "@/lib/assistant/engine";
import { QUESTION_GROUPS_LIMIT, QUESTION_RETENTION_DAYS, questionReport, type QuestionGroup, type QuestionTotal, type ReportLine } from "@/lib/assistant/questions";
import { questionStoreOrNull } from "@/lib/assistant/questions-server";
import { ASSISTANT_QUESTION_MAX, liveAnswers } from "@/lib/site-config/assistant-schema";
import { readPublished } from "@/lib/site-config/published";

const PERIODS = [7, 30, 90] as const;
const DAY = 86_400_000;
/** The instant of this request (the period is counted back from it). */
const requestTime = (): number => Date.now();

const KIND_LABEL: Record<AssistantReplyKind, string> = {
  "not-found": "Não achou estampa",
  fallback: "Sem resposta",
  ask: "Pediu mais detalhes",
  handoff: "Mandou para o WhatsApp",
  answer: "Respondeu",
  designs: "Mostrou estampas",
  order: "Pedido ou troca",
  refuse: "Recusou dado sensível",
  greeting: "Saudação",
  chat: "Conversa",
};
const WARN: readonly AssistantReplyKind[] = ["not-found", "fallback"];

const when = (ms: number) => new Date(ms).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const percent = (n: number, total: number) => (total > 0 ? `${Math.round((n / total) * 100)}%` : "—");

/**
 * What people asked the assistant in this region (db/migrations/0009_assistant_questions): what it could not answer first, then the most asked
 * and how often each answer of the base is used. No visitor is identified; e-mails and long numbers arrive masked. Read-only: "Criar resposta"
 * opens the assistant's editor with the question in a new answer.
 */
export default async function AssistantQuestionsPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const actor = await requireAdmin();
  const scope = await currentScope(actor);
  const sp = await searchParams;
  const days = PERIODS.find((p) => String(p) === sp.d) ?? 30;
  const state = readPublished();
  const answers = liveAnswers(state.source === "published" ? state.bundle.docs[scope]?.assistant : undefined);
  const editable = canEdit(actor, scope);

  const store = questionStoreOrNull();
  let groups: QuestionGroup[] = [];
  let totals: QuestionTotal[] = [];
  let unavailable: "no-store" | "no-table" | null = store ? null : "no-store";
  if (store) {
    const now = requestTime();
    // Retention also when no question arrives (the assistant switched off): what is older than 90 days goes when the page opens.
    await store.purgeBefore(now - QUESTION_RETENTION_DAYS * DAY).catch(() => 0);
    try {
      [groups, totals] = await Promise.all([store.groups(scope, now - days * DAY, QUESTION_GROUPS_LIMIT), store.totals(scope, now - days * DAY)]);
    } catch {
      unavailable = "no-table";
    }
  }
  const report = questionReport(totals, groups, answers);
  const unanswered = report.unanswered.reduce((n, l) => n + l.count, 0);
  const answerName = new Map(answers.map((a) => [a.id, a.question]));
  const create = (l: ReportLine) => `/admin/assistente?pergunta=${encodeURIComponent(l.sample.slice(0, ASSISTANT_QUESTION_MAX))}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="a-h1">Perguntas do assistente <span className="a-muted">· {scopeName(scope)}</span></h1>
        <p className="a-muted mt-2 max-w-3xl">
          O que as pessoas digitaram no assistente do site e das páginas da INK, e o que o assistente respondeu. Comece pelas perguntas sem resposta: cada uma vira uma resposta
          nova em <Link className="a-link" href="/admin/assistente">Assistente</Link>, ou outras palavras numa resposta que já existe. Não guardamos quem perguntou (nem IP, nem
          visitante); e-mails e números longos (telefone, CEP, pedido) chegam mascarados, e mensagens com CPF ou cartão ficam só como “recusada”. Fica guardado por {QUESTION_RETENTION_DAYS} dias.
        </p>
      </div>

      <nav className="flex flex-wrap items-center gap-2" aria-label="Período">
        <span className="a-label mb-0">Período</span>
        {PERIODS.map((p) => (
          <Link key={p} href={`/admin/assistente/perguntas?d=${p}`} className={`a-btn sm ${p === days ? "" : "ghost"}`} aria-current={p === days ? "page" : undefined}>
            {p} dias
          </Link>
        ))}
      </nav>

      {unavailable && (
        <p className="a-flash err" role="status" data-testid="questions-unavailable">
          {unavailable === "no-table"
            ? "As perguntas ainda não estão sendo guardadas neste ambiente: falta aplicar a migração 0009 do banco (npm run db:migrate no serviço). Enquanto isso, o assistente responde normalmente."
            : "Este ambiente não tem o banco do painel: as perguntas não são guardadas aqui."}
        </p>
      )}

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="questions-summary">
        <div className="a-card p-4">
          <dt className="a-label">Perguntas</dt>
          <dd className="text-[1.75rem] font-extrabold leading-tight">{report.total}</dd>
          <dd className="a-muted text-[0.8125rem]">{report.bySurface.site} no site · {report.bySurface.ink} na INK</dd>
        </div>
        <div className="a-card p-4">
          <dt className="a-label">Sem resposta</dt>
          <dd className="text-[1.75rem] font-extrabold leading-tight">{unanswered}</dd>
          <dd className="a-muted text-[0.8125rem]">{percent(unanswered, report.total)} · não achou, não soube, pediu detalhe ou mandou para o WhatsApp</dd>
        </div>
        <div className="a-card p-4">
          <dt className="a-label">Mostrou estampas</dt>
          <dd className="text-[1.75rem] font-extrabold leading-tight">{report.byKind.designs ?? 0}</dd>
          <dd className="a-muted text-[0.8125rem]">{percent(report.byKind.designs ?? 0, report.total)} das perguntas</dd>
        </div>
        <div className="a-card p-4">
          <dt className="a-label">Respondeu com a base</dt>
          <dd className="text-[1.75rem] font-extrabold leading-tight">{(report.byKind.answer ?? 0) + (report.byKind.order ?? 0)}</dd>
          <dd className="a-muted text-[0.8125rem]">respostas da loja, pedidos e trocas</dd>
        </div>
      </dl>

      <section className="a-card overflow-x-auto" aria-labelledby="q-unanswered" data-testid="questions-unanswered">
        <div className="p-5 pb-3">
          <h2 id="q-unanswered" className="a-h2">Sem resposta</h2>
          <p className="a-muted mt-1 text-[0.9375rem]">Perguntas iguais aparecem juntas, mesmo escritas de jeitos diferentes. Uma estampa que não existe pode ser ideia de estampa nova.</p>
        </div>
        <table className="a-table a-stack">
          <caption className="sr-only">Perguntas sem resposta</caption>
          <thead><tr><th scope="col">Pergunta</th><th scope="col">Vezes</th><th scope="col">O que o assistente fez</th><th scope="col">Última</th><th scope="col"><span className="sr-only">Ação</span></th></tr></thead>
          <tbody>
            {report.unanswered.length === 0 && <tr><td colSpan={5} className="a-muted">{unavailable ? "—" : `Nenhuma pergunta sem resposta nos últimos ${days} dias.`}</td></tr>}
            {report.unanswered.map((l) => (
              <tr key={l.key}>
                <td data-label="Pergunta">“{l.sample}”</td>
                <td data-label="Vezes" className="font-semibold tabular-nums">{l.count}</td>
                <td data-label="O que o assistente fez"><span className="flex flex-wrap gap-1">{l.kinds.map((k) => <span key={k} className={`a-badge ${WARN.includes(k) ? "warn" : ""}`}>{KIND_LABEL[k]}</span>)}</span></td>
                <td data-label="Última" className="tabular-nums">{when(l.lastAt)}</td>
                <td>{editable && <Link href={create(l)} className="a-btn sm ghost">Criar resposta</Link>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="a-card overflow-x-auto" aria-labelledby="q-top" data-testid="questions-top">
        <div className="p-5 pb-3">
          <h2 id="q-top" className="a-h2">Mais perguntadas</h2>
          <p className="a-muted mt-1 text-[0.9375rem]">Tudo o que foi perguntado, menos “oi” e “obrigado”. Uma resposta errada para a pergunta é sinal de que faltam outras palavras em alguma resposta.</p>
        </div>
        <table className="a-table a-stack">
          <caption className="sr-only">Perguntas mais feitas</caption>
          <thead><tr><th scope="col">Pergunta</th><th scope="col">Vezes</th><th scope="col">Resposta</th><th scope="col">Última</th></tr></thead>
          <tbody>
            {report.top.length === 0 && <tr><td colSpan={4} className="a-muted">{unavailable ? "—" : `Nenhuma pergunta nos últimos ${days} dias.`}</td></tr>}
            {report.top.map((l) => (
              <tr key={l.key}>
                <td data-label="Pergunta">“{l.sample}”</td>
                <td data-label="Vezes" className="font-semibold tabular-nums">{l.count}</td>
                <td data-label="Resposta">
                  <span className="flex flex-wrap gap-1">
                    {l.kinds.map((k) => <span key={k} className={`a-badge ${WARN.includes(k) ? "warn" : ""}`}>{KIND_LABEL[k]}</span>)}
                    {l.answerIds.map((id) => <span key={id} className="a-badge ok">{answerName.get(id) ?? "resposta removida"}</span>)}
                  </span>
                </td>
                <td data-label="Última" className="tabular-nums">{when(l.lastAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="a-card overflow-x-auto" aria-labelledby="q-answers" data-testid="questions-answers">
        <div className="p-5 pb-3">
          <h2 id="q-answers" className="a-h2">Respostas da loja</h2>
          <p className="a-muted mt-1 text-[0.9375rem]">Quantas vezes cada resposta publicada foi usada. Uma que nunca aparece pode precisar de outras palavras, ou não fazer falta.</p>
        </div>
        <table className="a-table a-stack">
          <caption className="sr-only">Uso das respostas da loja</caption>
          <thead><tr><th scope="col">Resposta</th><th scope="col">Vezes</th></tr></thead>
          <tbody>
            {report.answers.length === 0 && <tr><td colSpan={2} className="a-muted">Nenhuma resposta publicada nesta região.</td></tr>}
            {report.answers.map((a) => (
              <tr key={a.id}>
                <td data-label="Resposta">{a.question}</td>
                <td data-label="Vezes" className="tabular-nums">{a.count > 0 ? <strong>{a.count}</strong> : <span className="a-badge">nunca usada</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

import { discardDraftAction, publishAction, reconcileAction, rollbackAction } from "@/app/admin/actions";
import { Flash } from "@/components/admin/Flash";
import { PreviewFrame } from "@/components/admin/PreviewFrame";
import { diffDocs } from "@/lib/admin/diff";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { inspectPublishing, listHistory, preflightDoc } from "@/lib/admin/ops";
import { platform } from "@/lib/admin/platform";
import { loadWorkspace } from "@/lib/admin/workspace";

const when = (iso: string | number | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "—");

export default async function PublishPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requireAdmin();
  const prod = platform().mode === "prod";
  const sp = await searchParams;
  const ws = await loadWorkspace();
  const changes = diffDocs(ws.baseDoc, ws.doc);
  const errors = await preflightDoc(ws.doc);
  const history = await listHistory();
  const head = history.find((r) => r.status === "live");
  const pending = await inspectPublishing();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="a-h1">Publicar</h1>
        <p className="a-muted mt-2 max-w-2xl">{prod ? <>Publicar grava uma versão imutável no banco e promove o arquivo <code>published.json</code> da loja, de forma atômica. Se algo falhar no meio, a versão anterior continua no ar. A loja só usa esta configuração quando a chave <code>SITE_CONFIG_HOME</code> está ligada.</> : <>Publicar aqui grava só no <strong>sandbox local</strong> (<code>data/admin-dev/published</code>). A loja de produção não é tocada. A loja local só mostra o resultado quando iniciada com <code>npm run cms:dev</code>.</>}</p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="a-card p-5">
          <p className="a-h2">Alterações do rascunho</p>
          {changes.length === 0 ? <p className="a-muted mt-3">Nenhuma: o rascunho é igual ao que está publicado{head ? ` (release ${head.id})` : " (o seed atual da home)"}.</p> : (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-[0.9375rem]">{changes.map((c) => <li key={c.sectionId + c.kind + c.text}>{c.text}</li>)}</ul>
          )}
          {errors.length > 0 && (
            <div className="a-flash err mt-4">
              <p className="font-extrabold">Bloqueios para publicar</p>
              <ul className="mt-1 list-disc pl-5">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          )}
          <form action={publishAction} className="mt-5 space-y-3">
            <div><label className="a-label" htmlFor="note">Nota da publicação (opcional)</label><input id="note" name="note" className="a-input" maxLength={200} placeholder="Ex.: coleção Novidades depois de Da Nossa Terra" /></div>
            <button type="submit" className="a-btn" disabled={errors.length > 0 || changes.length === 0}>{prod ? "Publicar" : "Publicar no sandbox local"}</button>
            {changes.length === 0 && <span className="a-muted ml-3 text-[0.875rem]">Nada a publicar.</span>}
          </form>
          <form action={discardDraftAction} className="mt-3">
            <button type="submit" className="a-btn ghost sm" disabled={!ws.record}>Descartar rascunho e voltar ao publicado</button>
          </form>
        </div>

        <div className="a-card p-5">
          <p className="a-h2">{prod ? "Estado da publicação" : "Estado do sandbox"}</p>
          <ul className="mt-3 space-y-2 text-[0.9375rem]">
            <li className="flex justify-between gap-3"><span>Versão publicada</span><strong>{head ? `release ${head.id} · ${when(head.promotedAt)}` : "nenhuma (seed)"}</strong></li>
            <li className="flex justify-between gap-3"><span>Consistência</span>{pending.length === 0 ? <span className="a-badge ok">Coerente</span> : <span className="a-badge warn">Pendente: {pending.join(", ")}</span>}</li>
          </ul>
          <form action={reconcileAction} className="mt-4"><button type="submit" className="a-btn ghost sm">Reconciliar agora</button></form>
          <p className="a-muted mt-3 text-[0.8125rem]">Protocolo de duas fases (registro → arquivo atômico → promoção → invalidação de cache) com reconciliador. {prod ? "O registro fica no Postgres." : "No sandbox, o registro é um JSON no lugar do Postgres."}</p>
        </div>
      </section>

      <section className="a-card overflow-x-auto" aria-label="Histórico">
        <table className="a-table">
          <caption className="sr-only">Histórico de publicações</caption>
          <thead><tr><th scope="col">Release</th><th scope="col">Tipo</th><th scope="col">Quando</th><th scope="col">Seções ativas</th><th scope="col">Nota</th><th scope="col">Estado</th><th scope="col"><span className="sr-only">Ação</span></th></tr></thead>
          <tbody>
            {history.length === 0 && <tr><td colSpan={7} className="a-muted">Nenhuma publicação ainda.</td></tr>}
            {history.map((r) => (
              <tr key={r.id}>
                <td className="font-bold">#{r.id}</td>
                <td>{r.kind === "rollback" ? "Restauração" : "Publicação"}</td>
                <td>{when(r.promotedAt ?? r.createdAt)}</td>
                <td>{r.sections}</td>
                <td className="a-muted">{r.note ?? "—"}</td>
                <td>{r.id === head?.id ? <span className="a-badge ok">No ar</span> : r.status === "live" ? <span className="a-badge">Anterior</span> : r.status === "failed" ? <span className="a-badge bad">Falhou{r.failedReason ? `: ${r.failedReason}` : ""}</span> : <span className="a-badge warn">Pendente</span>}</td>
                <td>
                  {r.status === "live" && r.id !== head?.id && (
                    <form action={rollbackAction}><input type="hidden" name="release" value={r.id} /><button type="submit" className="a-btn sm ghost" title="Publica de novo o conteúdo desta versão (uma nova release) e descarta o rascunho atual">Restaurar esta versão</button></form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="a-muted text-[0.8125rem]">Restaurar cria uma nova release com o conteúdo da versão escolhida (nunca apaga histórico) e descarta o rascunho atual — o editor passa a mostrar o que ficou no ar.</p>

      <section className="a-card p-5" aria-label="Rascunho">
        <PreviewFrame version={ws.record?.rev ?? 0} height={620} />
      </section>
    </div>
  );
}

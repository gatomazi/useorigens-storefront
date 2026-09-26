import Link from "next/link";
import { deleteReleaseAction, discardDraftAction, publishAction, reconcileAction, rollbackAction, setRegionLaunchAction } from "@/app/admin/actions";
import { Flash } from "@/components/admin/Flash";
import { PreviewFrame } from "@/components/admin/PreviewFrame";
import { diffDocs } from "@/lib/admin/diff";
import { findCollection } from "@/lib/catalog/collections-file";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { launchBlockers } from "@/lib/admin/launch";
import { historyPage, inspectPublishing, preflightDoc, publishDeps } from "@/lib/admin/ops";
import { platform } from "@/lib/admin/platform";
import { pendingTrackingChanges } from "@/lib/admin/publishing";
import { currentScope, scopeName } from "@/lib/admin/scope";
import { loadWorkspace } from "@/lib/admin/workspace";

const when = (iso: string | number | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "—");

export default async function PublishPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; p?: string }> }) {
  const actor = await requireAdmin();
  const scope = await currentScope(actor);
  const prod = platform().mode === "prod";
  const sp = await searchParams;
  const ws = await loadWorkspace(scope);
  const changes = diffDocs(ws.baseDoc, ws.doc, (ref) => findCollection(ref.store, ref.collectionId)?.name ?? null);
  const errors = await preflightDoc(ws.doc);
  const trackingLines = await pendingTrackingChanges(publishDeps(), ws.doc);
  const { rows: history, total, pages, page, headId } = await historyPage(Number(sp.p));
  const head = history.find((r) => r.id === headId);
  const pending = await inspectPublishing();
  const separatelyLaunched = scope !== "sul";
  const launchedNow = ws.baseDoc.launched === true;
  const blockers = separatelyLaunched ? await launchBlockers(scope, ws.doc) : [];
  const mine = history.filter((r) => r.scopesChanged.includes(scope));
  const isOwner = actor.role === "owner";

  const scopeField = <input type="hidden" name="scope" value={scope} />;
  const confirmTracking =
    trackingLines.length > 0 ? (
      <div className="a-flash err mt-4" role="group" aria-label="Confirmação do rastreamento">
        <p className="font-extrabold">Isto muda o rastreamento efetivo (IDs públicos de Meta/GA4):</p>
        <ul className="mt-1 list-disc pl-5">{trackingLines.map((l) => <li key={l}>{l}</li>)}</ul>
        <label className="mt-3 flex items-start gap-2"><input type="checkbox" name="confirmTracking" className="mt-1" /> <span>Revisei os IDs efetivos acima e confirmo que eles podem ir para a loja.</span></label>
      </div>
    ) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="a-h1">Publicar <span className="a-muted">· {scopeName(scope)}</span></h1>
        <p className="a-muted mt-2 max-w-2xl">{prod ? <>Publicar grava uma versão imutável no banco e promove o arquivo <code>published.json</code> da loja, de forma atômica, <strong>somente para {scopeName(scope)}</strong>: as outras regiões, o tracking delas e o catálogo não são tocados. Se algo falhar no meio, a versão anterior continua no ar.</> : <>Publicar aqui grava só no <strong>sandbox local</strong> (<code>data/admin-dev/published</code>), somente para {scopeName(scope)}. A loja de produção não é tocada. A loja local só mostra o resultado quando iniciada com <code>npm run cms:dev</code>.</>}</p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      {separatelyLaunched && (
        <section className="a-card p-5" aria-labelledby="lancamento">
          <h2 id="lancamento" className="a-h2">Lançamento público de {scopeName(scope)}</h2>
          <p className="mt-2 flex flex-wrap items-center gap-2">
            {launchedNow ? <span className="a-badge ok">Pública na loja</span> : <span className="a-badge">Em prévia: não aparece na loja nem na navegação</span>}
          </p>
          <p className="a-muted mt-2 max-w-3xl text-[0.9375rem]">Lançar e recolher são publicações comuns desta região: reversíveis, registradas no histórico e sem efeito nas outras regiões nem no catálogo. Só o owner lança.</p>
          {!launchedNow && blockers.length > 0 && (
            <div className="a-flash err mt-3"><p className="font-extrabold">Ainda não dá para lançar:</p><ul className="mt-1 list-disc pl-5">{blockers.map((b) => <li key={b}>{b}</li>)}</ul></div>
          )}
          {actor.role === "owner" ? (
            <form action={setRegionLaunchAction} className="mt-4">
              {scopeField}
              <input type="hidden" name="launch" value={launchedNow ? "false" : "true"} />
              {confirmTracking}
              <button type="submit" className={`a-btn ${launchedNow ? "danger" : ""}`} disabled={!launchedNow && blockers.length > 0}>{launchedNow ? `Recolher ${scopeName(scope)} (voltar à prévia)` : `Lançar ${scopeName(scope)} ao público`}</button>
              {!launchedNow && <p className="a-muted mt-2 text-[0.8125rem]">Isto publica também as alterações não publicadas do rascunho desta região.</p>}
            </form>
          ) : <p className="a-muted mt-3">Peça ao owner para lançar ou recolher esta região.</p>}
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="a-card p-5">
          <p className="a-h2">Alterações do rascunho</p>
          {changes.length === 0 ? <p className="a-muted mt-3">Nenhuma: o rascunho é igual ao que está publicado{head ? ` (release ${head.id})` : " (o seed atual)"}.</p> : (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-[0.9375rem]">{changes.map((c) => <li key={c.sectionId + c.kind + c.text}>{c.text}</li>)}</ul>
          )}
          {errors.length > 0 && (
            <div className="a-flash err mt-4">
              <p className="font-extrabold">Bloqueios para publicar</p>
              <ul className="mt-1 list-disc pl-5">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          )}
          <form action={publishAction} className="mt-5 space-y-3">
            {scopeField}
            {confirmTracking}
            <div><label className="a-label" htmlFor="note">Nota da publicação (opcional)</label><input id="note" name="note" className="a-input" maxLength={200} placeholder="Ex.: coleção Novidades depois de Da Nossa Terra" /></div>
            <button type="submit" className="a-btn" disabled={errors.length > 0 || (changes.length === 0 && trackingLines.length === 0)}>{prod ? "Publicar" : "Publicar no sandbox local"}</button>
            {changes.length === 0 && <span className="a-muted ml-3 text-[0.875rem]">Nada a publicar.</span>}
          </form>
          <form action={discardDraftAction} className="mt-3">
            {scopeField}
            <button type="submit" className="a-btn ghost sm" disabled={!ws.record}>Descartar rascunho e voltar ao publicado</button>
          </form>
        </div>

        <div className="a-card p-5">
          <p className="a-h2">{prod ? "Estado da publicação" : "Estado do sandbox"}</p>
          <ul className="mt-3 space-y-2 text-[0.9375rem]">
            <li className="flex justify-between gap-3"><span>Última versão no ar (todas as regiões)</span><strong>{headId ? `release ${headId}${head ? ` · ${when(head.promotedAt)}` : ""}` : "nenhuma (seed)"}</strong></li>
            <li className="flex justify-between gap-3"><span>Consistência</span>{pending.length === 0 ? <span className="a-badge ok">Coerente</span> : <span className="a-badge warn">Pendente: {pending.join(", ")}</span>}</li>
          </ul>
          <form action={reconcileAction} className="mt-4">{scopeField}<button type="submit" className="a-btn ghost sm">Reconciliar agora</button></form>
          <p className="a-muted mt-3 text-[0.8125rem]">Protocolo de duas fases (registro → arquivo atômico → promoção → invalidação de cache) com reconciliador. {prod ? "O registro fica no Postgres." : "No sandbox, o registro é um JSON no lugar do Postgres."}</p>
        </div>
      </section>

      <section className="a-card overflow-x-auto" aria-label="Histórico">
        <table className="a-table a-stack">
          <caption className="sr-only">Histórico de publicações</caption>
          <thead><tr><th scope="col">Release</th><th scope="col">Tipo</th><th scope="col">Regiões</th><th scope="col">Quando</th><th scope="col">Nota</th><th scope="col">Estado</th><th scope="col"><span className="sr-only">Ação</span></th></tr></thead>
          <tbody>
            {history.length === 0 && <tr><td colSpan={7} className="a-muted">Nenhuma publicação ainda.</td></tr>}
            {history.map((r) => {
              const touchesMine = mine.some((m) => m.id === r.id);
              return (
                <tr key={r.id}>
                  <td data-label="Release" className="font-bold">#{r.id}</td>
                  <td data-label="Tipo">{r.kind === "rollback" ? "Restauração" : "Publicação"}</td>
                  <td data-label="Regiões">{r.scopesChanged.map((x) => (x === "global" ? "Global" : scopeName(x as "sul"))).join(", ") || "—"}</td>
                  <td data-label="Quando">{when(r.promotedAt ?? r.createdAt)}</td>
                  <td data-label="Nota" className="a-muted">{r.note ?? "—"}</td>
                  <td data-label="Estado">{r.id === headId ? <span className="a-badge ok">No ar</span> : r.status === "live" ? <span className="a-badge">Anterior</span> : r.status === "failed" ? <span className="a-badge bad">Falhou{r.failedReason ? `: ${r.failedReason}` : ""}</span> : <span className="a-badge warn">Pendente</span>}</td>
                  <td>
                    {r.status === "live" && r.id !== headId && touchesMine && (
                      <form action={rollbackAction} className="flex flex-wrap items-center gap-2">
                        {scopeField}
                        <input type="hidden" name="release" value={r.id} />
                        <button type="submit" className="a-btn sm ghost" title={`Restaura só ${scopeName(scope)} para o conteúdo desta versão (uma nova release) e descarta o rascunho desta região`}>Restaurar {scopeName(scope)}</button>
                        <label className="a-muted flex items-center gap-1 text-[0.75rem]"><input type="checkbox" name="confirmTracking" /> confirmo os IDs de tracking, se mudarem</label>
                      </form>
                    )}
                    {isOwner && r.id !== headId && r.status !== "pending" && (
                      <form action={deleteReleaseAction} className="mt-2 flex flex-wrap items-center gap-2">
                        <input type="hidden" name="release" value={r.id} />
                        <button type="submit" className="a-btn sm danger" aria-label={`Apagar a release ${r.id}`}>Apagar</button>
                        <label className="a-muted flex items-center gap-1 text-[0.75rem]"><input type="checkbox" name="confirmDelete" /> confirmo apagar #{r.id} do histórico</label>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {pages > 1 && (
          <nav aria-label="Páginas do histórico" className="flex flex-wrap items-center justify-between gap-3 border-t border-black/15 p-4 text-[0.875rem]">
            <span className="a-muted">{total} versões · página {page} de {pages}</span>
            <span className="flex items-center gap-2">
              {page > 1 ? <Link className="a-btn sm ghost" href={`/admin/publicar?p=${page - 1}`}>← Mais novas</Link> : <span className="a-btn sm ghost opacity-40" aria-disabled="true">← Mais novas</span>}
              {page < pages ? <Link className="a-btn sm ghost" href={`/admin/publicar?p=${page + 1}`}>Mais antigas →</Link> : <span className="a-btn sm ghost opacity-40" aria-disabled="true">Mais antigas →</span>}
            </span>
          </nav>
        )}
      </section>
      <p className="a-muted text-[0.8125rem]">Restaurar cria uma nova release só com o conteúdo de <strong>{scopeName(scope)}</strong> da versão escolhida (nunca apaga histórico, nunca mexe nas outras regiões) e descarta o rascunho desta região. Só releases que alteraram {scopeName(scope)} têm o botão. O owner pode apagar versões antigas do histórico (nunca a que está no ar); apagar uma versão a tira da lista de restauração.</p>

      <section className="a-card p-5" aria-label="Rascunho">
        <PreviewFrame version={ws.record?.rev ?? 0} height={620} />
      </section>
    </div>
  );
}

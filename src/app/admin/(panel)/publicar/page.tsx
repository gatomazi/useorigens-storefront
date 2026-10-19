import Link from "next/link";
import { deleteReleaseAction, discardDraftAction, discardGlobalAction, publishAction, publishGlobalAction, publishTargetAction, reconcileAction, rollbackAction, setRegionLaunchAction } from "@/app/admin/actions";
import { Flash } from "@/components/admin/Flash";
import { PreviewFrame } from "@/components/admin/PreviewFrame";
import { diffDocs } from "@/lib/admin/diff";
import { findCollection } from "@/lib/catalog/collections-file";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { launchBlockers } from "@/lib/admin/launch";
import { historyPage, inspectPublishing, preflightDoc, publishDeps } from "@/lib/admin/ops";
import { platform } from "@/lib/admin/platform";
import { globalParts, pendingPublishes } from "@/lib/admin/pending";
import { pendingTrackingChanges, seedForEnv } from "@/lib/admin/publishing";
import { changedLabel, currentScope, REGION_SCOPES, scopeName } from "@/lib/admin/scope";
import { loadWorkspace } from "@/lib/admin/workspace";
import { PAGE_KIND_LABEL, pageHref } from "@/lib/site-config/pages";

const when = (iso: string | number | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "—");

export default async function PublishPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; p?: string }> }) {
  const actor = await requireAdmin();
  const scope = await currentScope(actor);
  const prod = platform().mode === "prod";
  const sp = await searchParams;
  const ws = await loadWorkspace(scope);
  const changes = diffDocs(ws.baseDoc, ws.doc, (ref) => findCollection(ref.store, ref.collectionId)?.name ?? null, (ref) => findCollection(ref.store, ref.collectionId)?.isAvailable ?? false);
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
  // Everything else that waits: each page and model (published one by one) and the global document (one for every region, owner only).
  const global = await loadWorkspace("global");
  const waiting = await pendingPublishes(scope, actor, { ws, global });
  const regionPending = waiting.region.pending || trackingLines.length > 0;
  const blockersOf = async (target: { kind: "page" | "customizer"; id: string }) => [target.id, await preflightDoc(ws.doc, target).catch(() => ["não foi possível verificar agora"])] as const;
  const targetBlockers = Object.fromEntries(await Promise.all([...waiting.pages.map((p) => blockersOf({ kind: "page", id: p.page.id })), ...waiting.models.map((m) => blockersOf({ kind: "customizer", id: m.model.id }))]));
  const gParts = globalParts(global.baseDoc, global.doc);
  const globalChanges = diffDocs(global.baseDoc, global.doc);
  const globalTracking = global.dirty ? await pendingTrackingChanges(publishDeps(), global.doc) : [];
  const globalErrors = global.dirty && isOwner ? await preflightDoc(global.doc).catch(() => []) : [];
  const liveBundle = (await platform().files.read()) ?? seedForEnv();
  const inheritors = REGION_SCOPES.filter((r) => (["meta", "ga4"] as const).some((t) => (liveBundle.docs[r]?.tracking[t]?.mode ?? (r === "sul" ? "legacy" : "disabled")) === "inherit"));
  const nothingWaiting = !regionPending && waiting.pages.length === 0 && waiting.models.length === 0 && !global.dirty;

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

      <section className="a-card p-5" aria-labelledby="esperando" data-testid="publish-summary">
        <h2 id="esperando" className="a-h2">Esperando publicação</h2>
        {nothingWaiting ? <p className="a-muted mt-2">Nada: a loja está igual aos rascunhos de {scopeName(scope)}{isOwner ? " e à configuração global" : ""}.</p> : (
          <ul className="mt-3 space-y-1 text-[0.9375rem]">
            {regionPending && <li><a href="#regiao" className="a-link">Rascunho de {scopeName(scope)}</a> <span className="a-muted">· {changes.length + (trackingLines.length > 0 ? 1 : 0)} alteração(ões)</span></li>}
            {waiting.pages.length > 0 && <li><a href="#paginas-modelos" className="a-link">{waiting.pages.length === 1 ? "1 página" : `${waiting.pages.length} páginas`}</a> <span className="a-muted">· {waiting.pages.map((p) => p.page.title).join(", ")}</span></li>}
            {waiting.models.length > 0 && <li><a href="#paginas-modelos" className="a-link">{waiting.models.length === 1 ? "1 modelo de personalização" : `${waiting.models.length} modelos de personalização`}</a> <span className="a-muted">· {waiting.models.map((m) => m.model.name).join(", ")}</span></li>}
            {global.dirty && <li><a href="#global" className="a-link">Configuração global (todas as regiões)</a> <span className="a-muted">· {gParts.join(", ") || "alterada"}{isOwner ? "" : " · só o owner publica"}</span></li>}
          </ul>
        )}
        <p className="a-muted mt-3 text-[0.8125rem]">Cada item é publicado sozinho: publicar a região não publica as páginas, os modelos nem a configuração global, e vice-versa.</p>
      </section>

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
        <div id="regiao" className="a-card scroll-mt-4 p-5">
          <p className="a-h2">Rascunho de {scopeName(scope)}</p>
          <p className="a-muted mt-1 text-[0.8125rem]">Home, menu, coleções, páginas de estado, aparência, cupons e tracking da região.</p>
          {changes.length === 0 ? <p className="a-muted mt-3">Nenhuma: o rascunho é igual ao que está publicado{head ? ` (release ${head.id})` : " (o seed atual)"}.</p> : (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-[0.9375rem]">{changes.map((c) => <li key={c.sectionId + c.kind + c.text}>{c.text}</li>)}</ul>
          )}
          {waiting.region.tracking && trackingLines.length === 0 && <p className="mt-2 text-[0.9375rem]">Tracking da região: configuração alterada (os IDs efetivos não mudam).</p>}
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
            <button type="submit" className="a-btn" disabled={errors.length > 0 || !regionPending}>{prod ? "Publicar" : "Publicar no sandbox local"}</button>
            {!regionPending && <span className="a-muted ml-3 text-[0.875rem]">Nada a publicar.</span>}
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

      <section id="paginas-modelos" className="a-card scroll-mt-4 overflow-x-auto" aria-labelledby="paginas-modelos-titulo" data-testid="publish-pages-models">
        <div className="p-5 pb-0">
          <h2 id="paginas-modelos-titulo" className="a-h2">Páginas e modelos de personalização</h2>
          <p className="a-muted mt-1 max-w-3xl text-[0.875rem]">Publicados um a um: publicar uma página nunca mexe na home nem nas outras páginas. Aqui aparecem os que nunca foram publicados ou têm alterações.</p>
        </div>
        {waiting.pages.length === 0 && waiting.models.length === 0 ? <p className="a-muted p-5">Nenhuma página nem modelo esperando publicação.</p> : (
          <table className="a-table a-stack mt-3">
            <caption className="sr-only">Páginas e modelos esperando publicação</caption>
            <thead><tr><th scope="col">Item</th><th scope="col">Tipo</th><th scope="col">Estado</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>
              {[
                ...waiting.pages.map(({ page: pg, state, stateLabel }) => ({ id: pg.id, target: "page", title: pg.title, detail: pageHref(scope, pg), kind: PAGE_KIND_LABEL[pg.kind], state, stateLabel, href: `/admin/paginas/${pg.id}`, verb: "Publicar página" })),
                ...waiting.models.map(({ model, state, stateLabel }) => ({ id: model.id, target: "customizer", title: model.name, detail: null, kind: "Modelo de personalização", state, stateLabel, href: `/admin/personalizacao/${model.id}`, verb: "Publicar modelo" })),
              ].map((item) => {
                const b = targetBlockers[item.id] ?? [];
                return (
                  <tr key={`${item.target}-${item.id}`} data-testid={`waiting-${item.target}-${item.id}`}>
                    <td data-label="Item">
                      <p className="font-bold">{item.title}</p>
                      {item.detail && <p className="a-muted text-[0.8125rem]"><code>{item.detail}</code></p>}
                      {b.length > 0 && <p className="mt-1 text-[0.8125rem]"><span className="a-badge bad">Ainda não dá para publicar</span> {b.join(" · ")}</p>}
                    </td>
                    <td data-label="Tipo">{item.kind}</td>
                    <td data-label="Estado"><span className={`a-badge ${item.state === "changed" ? "warn" : ""}`}>{item.stateLabel}</span></td>
                    <td>
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <Link href={item.href} className="a-btn sm ghost">Abrir</Link>
                        <form action={publishTargetAction}>
                          {scopeField}
                          <input type="hidden" name="target" value={item.target} />
                          <input type="hidden" name="id" value={item.id} />
                          <input type="hidden" name="from" value="publicar" />
                          <button type="submit" className="a-btn sm" disabled={b.length > 0} aria-label={`${item.verb}: ${item.title}`}>{item.verb}</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section id="global" className="a-card scroll-mt-4 p-5" aria-labelledby="global-titulo" data-testid="publish-global">
        <h2 id="global-titulo" className="a-h2">Configuração global · todas as regiões</h2>
        <p className="a-muted mt-1 max-w-3xl text-[0.875rem]">Um documento só, publicado inteiro: a paleta da Use Origens, as cores das páginas sem região, o botão nos cards e o Meu Pequeno Mundo (editados em <Link href="/admin/aparencia" className="a-link">Aparência</Link>) e o tracking global (em <Link href="/admin/tracking" className="a-link">Tracking</Link>). As regiões que herdam a paleta da Use Origens mudam juntas, sem republicar. A paleta das páginas sem região vale apenas para a entrada da loja e o catálogo geral.</p>
        {!global.dirty ? <p className="mt-3"><span className="a-badge ok">Igual ao publicado</span></p> : (
          <>
            <p className="mt-3 text-[0.9375rem]"><strong>Com alterações:</strong> {gParts.join(", ") || "configuração"}.</p>
            {globalChanges.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-[0.9375rem]">{globalChanges.map((c) => <li key={c.kind + c.text}>{c.text}</li>)}</ul>}
          </>
        )}
        {isOwner ? (
          <>
            {global.dirty && gParts.includes("tracking global") && inheritors.length > 0 && <p className="a-flash err mt-3">Hoje herdam o tracking global: <strong>{inheritors.map((r) => scopeName(r)).join(", ")}</strong>. Publicar um novo ID global muda o rastreamento dessas regiões.</p>}
            {globalErrors.length > 0 && (
              <div className="a-flash err mt-3">
                <p className="font-extrabold">Bloqueios para publicar</p>
                <ul className="mt-1 list-disc pl-5">{globalErrors.map((e) => <li key={e}>{e}</li>)}</ul>
              </div>
            )}
            <form action={publishGlobalAction} className="mt-4 space-y-3">
              {globalTracking.length > 0 && (
                <div className="a-flash err" role="group" aria-label="Confirmação do rastreamento global">
                  <p className="font-extrabold">Isto muda o rastreamento efetivo:</p>
                  <ul className="mt-1 list-disc pl-5">{globalTracking.map((l) => <li key={l}>{l}</li>)}</ul>
                  <label className="mt-3 flex items-start gap-2"><input type="checkbox" name="confirmTracking" className="mt-1" /> <span>Revisei os IDs efetivos acima e confirmo que eles podem ir para a loja.</span></label>
                </div>
              )}
              <button type="submit" className="a-btn" disabled={!global.dirty || globalErrors.length > 0} data-testid="publish-global-theme">Publicar configuração global</button>
              {!global.dirty && <span className="a-muted ml-3 text-[0.875rem]">Nada a publicar.</span>}
            </form>
            <form action={discardGlobalAction} className="mt-3"><button type="submit" className="a-btn ghost sm" disabled={!global.record}>Descartar rascunho do global</button></form>
          </>
        ) : <p className="a-muted mt-3 text-[0.875rem]">Só o owner publica a configuração global.</p>}
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
                  <td data-label="Regiões">{r.scopesChanged.map(changedLabel).join(", ") || "—"}</td>
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

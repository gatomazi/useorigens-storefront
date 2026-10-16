import Link from "next/link";
import { moveStateRowAction, resetStateRowsAction, setStateRowAction } from "@/app/admin/actions";
import { Flash } from "@/components/admin/Flash";
import { PodioCard } from "@/components/admin/PodioCard";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { platform } from "@/lib/admin/platform";
import { currentScope, scopeName, storeOf } from "@/lib/admin/scope";
import { loadWorkspace } from "@/lib/admin/workspace";
import { STATE_ROW_MIN_ITEMS, stateRowCollections, stateRowMatrix, stateRowsReach } from "@/lib/catalog/collection-source";
import { getCollections } from "@/lib/catalog/collections-file";
import { getCatalog } from "@/lib/catalog/repository";
import { siteUrl } from "@/lib/config/env";
import { REGIONS, STATE_NAMES, type CommerceStoreKey } from "@/lib/geo/regions";
import { normalizeText } from "@/lib/geo/text";
import { podioEnabledIn } from "@/lib/site-config/podio-schema";

/**
 * "Páginas de estado": everything the panel controls on the region's state pages (`/<região>/<uf>`), in one place. The rows by collection (each one cut
 * down to the products it shares with the state's own collection, "Paraná") and O Pódio. Per state, it says which collection is the parent and how many
 * products each row would show, so a row that "does not appear" comes with its reason.
 */
export default async function StatePagesScreen({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const actor = await requireAdmin();
  const scope = await currentScope(actor);
  const sp = await searchParams;
  const ws = await loadWorkspace(scope);
  const rev = ws.record?.rev ?? null;
  const store = storeOf(scope) as CommerceStoreKey;
  const synced = getCollections().stores[store];
  const catalog = getCatalog();
  const productsOf = (s: CommerceStoreKey) => catalog.productsOfStore(s);
  const stateRows = stateRowCollections(scope, ws.doc);
  const reach = stateRowsReach(scope, ws.doc, productsOf);
  const { states, counts } = stateRowMatrix(scope, ws.doc, productsOf);
  const ufs = REGIONS[scope].ufs;
  // Automatic: only what really shows somewhere (a public collection with no product of any state is noise). The owner's own list: exactly that list.
  const shownRows = stateRows.own ? stateRows.records : stateRows.records.filter((c) => (reach.get(c.id) ?? 0) > 0);
  const stateNameKeys = new Set(Object.values(STATE_NAMES).map(normalizeText));
  const addable = (synced?.collections ?? []).filter((c) => !shownRows.some((x) => x.id === c.id) && !stateNameKeys.has(normalizeText(c.name))).sort((a, b) => a.position - b.position);
  const nowhere = shownRows.filter((c) => (reach.get(c.id) ?? 0) === 0);
  const launched = scope === "sul" || ws.baseDoc.launched === true;
  const prod = platform().mode === "prod";
  const statePath = (uf: string) => `/${scope}/${uf.toLowerCase()}`;
  const stateHref = (uf: string) => (prod ? `${siteUrl().replace(/\/$/, "")}${statePath(uf)}` : statePath(uf));
  const hidden = (
    <>
      <input type="hidden" name="rev" value={rev ?? "null"} />
      <input type="hidden" name="scope" value={scope} />
    </>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="a-h1">Páginas de estado <span className="a-muted">· {scopeName(scope)}</span></h1>
        <p className="a-muted mt-2 max-w-3xl">Cada estado de {scopeName(scope)} tem uma página (ex.: <code>{statePath(ufs[0])}</code>). Aqui você decide os <strong>carrosséis por coleção</strong> e liga ou desliga <strong>O Pódio</strong>. A foto do topo, a vitrine de camisetas e os estilos vêm do catálogo e não são editados no painel. Tudo é rascunho até <Link href="/admin/publicar" className="a-link">Publicar</Link>.</p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      {!synced ? (
        <p className="a-flash err">As coleções desta loja ainda não foram sincronizadas, então não há como montar os carrosséis. Sincronize em <Link href="/admin/sincronizacao" className="a-link">Sincronização</Link>.</p>
      ) : (
        <>
          <section className="a-card overflow-x-auto" aria-label="Estados da região" data-testid="state-pages">
            <table className="a-table a-stack">
              <caption className="a-h2 p-4 text-left">Estados de {scopeName(scope)}</caption>
              <thead><tr><th scope="col">Estado</th><th scope="col">Coleção do estado (na INK)</th><th scope="col">Carrosséis que aparecem</th><th scope="col"><span className="sr-only">Página</span></th></tr></thead>
              <tbody>
                {states.map((st) => {
                  const showing = shownRows.filter((c) => (counts.get(c.id)?.[st.uf] ?? 0) >= STATE_ROW_MIN_ITEMS);
                  return (
                    <tr key={st.uf} data-testid={`state-page-${st.uf}`}>
                      <td data-label="Estado" className="font-bold">{st.name}</td>
                      <td data-label="Coleção do estado">
                        {st.parent ? <><span className="font-semibold">{st.parent.name}</span> <span className="a-muted text-[0.8125rem]">· {st.parent.products} produto(s) no catálogo</span></> : <span className="a-badge bad" title="Sem ela, a página do estado não tem carrosséis por coleção.">Não há coleção “{st.name}” na INK</span>}
                      </td>
                      <td data-label="Carrosséis que aparecem">{showing.length === 0 ? <span className="a-muted">nenhum</span> : showing.map((c) => c.name).join(", ")}</td>
                      <td className="text-right">{launched ? <a href={stateHref(st.uf)} target="_blank" rel="noreferrer" className="a-link text-[0.875rem]">Ver {statePath(st.uf)} ↗</a> : <span className="a-muted text-[0.8125rem]">região em prévia</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="a-muted p-4 text-[0.8125rem]">A coleção com o nome do estado é a que diz quais produtos são daquele estado. Um carrossel só aparece numa página de estado com pelo menos {STATE_ROW_MIN_ITEMS} produtos que estejam ao mesmo tempo nele e na coleção do estado.</p>
          </section>

          <section id="pagina-estado" className="a-card scroll-mt-4 p-5" aria-label="Carrosséis por coleção" data-testid="state-rows">
            <h2 className="a-h2">Carrosséis por coleção</h2>
            <p className="a-muted mt-2 max-w-3xl">Na página de cada estado entra um carrossel por coleção, só com os produtos que também estão na coleção do estado (“{STATE_NAMES[ufs[0]]}”). {stateRows.own ? <><strong>Lista escolhida por você</strong>, nesta ordem.</> : <><strong>Automático</strong>: toda coleção pública com produtos do estado, na ordem do menu da INK. Ao mexer aqui, a lista passa a ser sua.</>} Os números mostram quantos produtos cada carrossel teria em cada estado.</p>
            {shownRows.length === 0 ? <p className="a-muted mt-3 text-[0.875rem]">Nenhuma coleção aparece hoje nas páginas de estado desta região.</p> : (
              <ol className="mt-3 space-y-2">
                {shownRows.map((c, i) => {
                  const ref = `${store}:${c.id}`;
                  const n = reach.get(c.id) ?? 0;
                  const perState = counts.get(c.id) ?? {};
                  return (
                    <li key={c.id} className="flex flex-wrap items-center gap-2">
                      <span className="a-muted w-5 text-right">{i + 1}.</span>
                      <span className="font-semibold">{c.name}</span>
                      <span className={`a-badge ${n === 0 ? "warn" : ""}`} title={`Estados desta região em que a coleção tem pelo menos ${STATE_ROW_MIN_ITEMS} produtos do estado`}>{n === 0 ? "não aparece em nenhum estado" : `em ${n} de ${ufs.length} estados`}</span>
                      <span className="text-[0.8125rem]" data-testid={`state-row-counts-${c.id}`}>
                        {ufs.map((uf, j) => {
                          const count = perState[uf] ?? 0;
                          return <span key={uf} className={count >= STATE_ROW_MIN_ITEMS ? "font-bold" : "a-muted"} title={`${STATE_NAMES[uf]}: ${count} produto(s) desta coleção também estão em “${STATE_NAMES[uf]}”`}>{j > 0 ? " · " : ""}{uf} {count}</span>;
                        })}
                      </span>
                      <form action={moveStateRowAction} className="ml-auto flex gap-1">
                        {hidden}
                        <input type="hidden" name="ref" value={ref} />
                        <button type="submit" name="direction" value="up" className="a-btn sm ghost" disabled={i === 0} aria-label={`Subir ${c.name}`}>↑</button>
                        <button type="submit" name="direction" value="down" className="a-btn sm ghost" disabled={i === shownRows.length - 1} aria-label={`Descer ${c.name}`}>↓</button>
                      </form>
                      <form action={setStateRowAction}>
                        {hidden}
                        <input type="hidden" name="ref" value={ref} />
                        <input type="hidden" name="on" value="0" />
                        <button type="submit" className="a-btn sm ghost" aria-label={`Tirar ${c.name} da página do estado`}>Tirar</button>
                      </form>
                    </li>
                  );
                })}
              </ol>
            )}
            {nowhere.length > 0 && (
              <p className="a-flash mt-4 text-[0.875rem]" data-testid="state-rows-nowhere">
                <strong>{nowhere.map((c) => c.name).join(", ")}</strong> {nowhere.length === 1 ? "não aparece" : "não aparecem"} em nenhum estado: {nowhere.length === 1 ? "os produtos dela não estão" : "os produtos delas não estão"} também na coleção do estado, ou são menos de {STATE_ROW_MIN_ITEMS} por estado. Para {nowhere.length === 1 ? "ela aparecer" : "aparecerem"}, coloque os produtos na coleção do estado deles na INK (ex.: “{STATE_NAMES[ufs[0]]}”) e sincronize as coleções.
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-end gap-3">
              {addable.length > 0 && (
                <form action={setStateRowAction} className="flex flex-wrap items-end gap-2">
                  {hidden}
                  <input type="hidden" name="on" value="1" />
                  <div>
                    <label className="a-label" htmlFor="state-row-add">Incluir coleção</label>
                    <select id="state-row-add" name="ref" className="a-input">
                      {addable.map((c) => <option key={c.id} value={`${store}:${c.id}`}>{c.name}{c.isAvailable ? "" : " (interna)"}</option>)}
                    </select>
                  </div>
                  <button type="submit" className="a-btn sm">Incluir</button>
                </form>
              )}
              {stateRows.own && (
                <form action={resetStateRowsAction} className="ml-auto">
                  {hidden}
                  <button type="submit" className="a-btn sm ghost">Voltar ao automático</button>
                </form>
              )}
            </div>
          </section>
        </>
      )}

      <PodioCard scope={scope} rev={rev} draft={podioEnabledIn(ws.doc)} live={podioEnabledIn(ws.baseDoc)} />
    </div>
  );
}

import Link from "next/link";
import { Flash } from "@/components/admin/Flash";
import { PodioCard } from "@/components/admin/PodioCard";
import { StatePageCards } from "@/components/admin/StatePageCards";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { platform } from "@/lib/admin/platform";
import { currentScope, scopeName, storeOf } from "@/lib/admin/scope";
import { loadWorkspace } from "@/lib/admin/workspace";
import { STATE_ROW_MIN_ITEMS, stateCollectionRows, stateRowMatrix } from "@/lib/catalog/collection-source";
import { getCollections } from "@/lib/catalog/collections-file";
import { getCatalog } from "@/lib/catalog/repository";
import { siteUrl } from "@/lib/config/env";
import { REGIONS, type CommerceStoreKey } from "@/lib/geo/regions";
import { podioEnabledIn } from "@/lib/site-config/podio-schema";

/**
 * "Páginas de estado": everything the panel controls on the region's state pages (`/<região>/<uf>`), in one place. Per state, the collection named after
 * it (which products are of the state) and how many carousels its page shows; then the sections, the categories and subcategories (StatePageCards) and
 * O Pódio. A row that "does not appear" comes with its reason: no collection of the state, or too few of its products left for it.
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
  const { states } = stateRowMatrix(scope, ws.doc, productsOf);
  const ufs = REGIONS[scope].ufs;
  const launched = scope === "sul" || ws.baseDoc.launched === true;
  const prod = platform().mode === "prod";
  const statePath = (uf: string) => `/${scope}/${uf.toLowerCase()}`;
  const stateHref = (uf: string) => (prod ? `${siteUrl().replace(/\/$/, "")}${statePath(uf)}` : statePath(uf));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="a-h1">Páginas de estado <span className="a-muted">· {scopeName(scope)}</span></h1>
        <p className="a-muted mt-2 max-w-3xl">Cada estado de {scopeName(scope)} tem uma página (ex.: <code>{statePath(ufs[0])}</code>). Aqui você decide as <strong>seções</strong> da página, as <strong>categorias e subcategorias</strong> dos carrosséis e liga ou desliga <strong>O Pódio</strong>. A foto do topo vem do catálogo e não é editada no painel. Tudo é rascunho até <Link href="/admin/publicar" className="a-link">Publicar</Link>.</p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      {!synced ? (
        <p className="a-flash err">As coleções desta loja ainda não foram sincronizadas, então não há como montar os carrosséis. Sincronize em <Link href="/admin/sincronizacao" className="a-link">Sincronização</Link>.</p>
      ) : (
        <>
          <section className="a-card overflow-x-auto" aria-label="Estados da região" data-testid="state-pages">
            <table className="a-table a-stack">
              <caption className="a-h2 p-4 text-left">Estados de {scopeName(scope)}</caption>
              <thead><tr><th scope="col">Estado</th><th scope="col">Coleção do estado (na INK)</th><th scope="col">Carrosséis de categoria</th><th scope="col"><span className="sr-only">Página</span></th></tr></thead>
              <tbody>
                {states.map((st) => {
                  const rows = st.parent ? stateCollectionRows(scope, st.uf, ws.doc, productsOf) : [];
                  return (
                    <tr key={st.uf} data-testid={`state-page-${st.uf}`}>
                      <td data-label="Estado" className="font-bold">{st.name}</td>
                      <td data-label="Coleção do estado">
                        {st.parent ? <><span className="font-semibold">{st.parent.name}</span> <span className="a-muted text-[0.8125rem]">· {st.parent.products} produto(s) no catálogo</span></> : <span className="a-badge bad" title="Sem ela, a página do estado não tem carrosséis por coleção.">Não há coleção “{st.name}” na INK</span>}
                      </td>
                      <td data-label="Carrosséis de categoria">{rows.length === 0 ? <span className="a-muted">nenhum</span> : <a href="#estado-previa" className="a-link">{rows.length === 1 ? "1 carrossel" : `${rows.length} carrosséis`}</a>}</td>
                      <td className="text-right">{launched ? <a href={stateHref(st.uf)} target="_blank" rel="noreferrer" className="a-link text-[0.875rem]">Ver {statePath(st.uf)} ↗</a> : <span className="a-muted text-[0.8125rem]">região em prévia</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="a-muted p-4 text-[0.8125rem]">A coleção com o nome do estado é a que diz quais produtos são daquele estado. Um carrossel só aparece numa página de estado com pelo menos {STATE_ROW_MIN_ITEMS} produtos do estado que fiquem nele (veja “Como fica cada estado”, abaixo).</p>
          </section>

          <StatePageCards scope={scope} rev={rev} doc={ws.doc} baseDoc={ws.baseDoc} />
        </>
      )}

      <PodioCard scope={scope} rev={rev} draft={podioEnabledIn(ws.doc)} live={podioEnabledIn(ws.baseDoc)} />
    </div>
  );
}

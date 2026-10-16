import Link from "next/link";
import { linkCollectionPagesAction } from "@/app/admin/actions";
import { Flash } from "@/components/admin/Flash";
import { PreviewFrame } from "@/components/admin/PreviewFrame";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { listHistory } from "@/lib/admin/ops";
import { pendingPublishes } from "@/lib/admin/pending";
import { platform } from "@/lib/admin/platform";
import { currentScope, scopeName, storeOf } from "@/lib/admin/scope";
import { collectionsStaleReason } from "@/lib/admin/sync-status";
import { collectionProblems, readabilityProblems } from "@/lib/admin/validate-draft";
import { loadWorkspace } from "@/lib/admin/workspace";
import { collectionPageSlug, stateCategoryCollections, stateRowsReach, stateSubcategoryCollections } from "@/lib/catalog/collection-source";
import { getCollections } from "@/lib/catalog/collections-file";
import { getCatalog } from "@/lib/catalog/repository";
import { snapshotStatus } from "@/lib/catalog/snapshot-file";
import type { CommerceStoreKey } from "@/lib/geo/regions";
import { inkCollectionLinks } from "@/lib/site-config/collections-enabled";

const ago = (iso: string | null | undefined): string => {
  if (!iso) return "nunca";
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return `há ${min} min`;
  if (min < 60 * 48) return `há ${Math.round(min / 60)} h`;
  return `há ${Math.round(min / 1440)} dias`;
};

/**
 * "Visão geral": what asks for action in the region being edited, each item leading to where it is solved (the queue, Publicar, the home, the state
 * pages, Sincronização). The technical state of the catalog and of publishing lives in Sincronização.
 */
export default async function AdminOverview({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const actor = await requireAdmin();
  const scope = await currentScope(actor);
  const sp = await searchParams;
  const ws = await loadWorkspace(scope);
  const store = storeOf(scope) as CommerceStoreKey;
  const history = await listHistory();
  const head = history.find((r) => r.status === "live");
  const sections = ws.doc.home?.sections ?? [];
  const problems = [...collectionProblems(ws.doc), ...readabilityProblems(ws.doc)];
  const prod = platform().mode === "prod";
  const custom = sections.filter((s) => s.id.startsWith("custom-")).length;
  const openRequests = await platform().requests.countOpen([scope]).catch(() => 0);
  const waiting = await pendingPublishes(scope, actor, { ws });
  // Links still opening a collection on INK that can open its page on the site instead ("Levar para as páginas do site").
  const toSite = inkCollectionLinks(ws.doc).filter((r) => collectionPageSlug(ws.doc, r.store, r.collectionId) !== null).length;
  const syncedCollections = getCollections().stores[store];
  const catalogPresent = (snapshotStatus().stores.find((c) => c.storeKey === store)?.productCount ?? 0) > 0;
  const stale = collectionsStaleReason(store);
  // What the owner CHOSE for the state pages and shows in no state: the categories of an own list, the subcategories brought in by hand (or a legacy list).
  // Automatic ones that show nowhere are not a problem (a public collection with no product of any state).
  const categories = stateCategoryCollections(scope, ws.doc);
  const subcategories = stateSubcategoryCollections(scope, ws.doc);
  const addedByHand = new Set((ws.doc.collections?.stateSubcategories?.added ?? []).map((r) => r.collectionId));
  const chosen = [...(categories.own ? categories.records : []), ...subcategories.records.filter((c) => subcategories.legacy || addedByHand.has(c.id))];
  const catalog = getCatalog();
  const reach = stateRowsReach(scope, ws.doc, (s) => catalog.productsOfStore(s));
  const rowsNowhere = chosen.filter((c) => (reach.get(c.id) ?? 0) === 0);
  const preview = scope !== "sul" && ws.baseDoc.launched !== true;
  const waitingParts = [waiting.region.pending ? `rascunho de ${scopeName(scope)}` : null, waiting.pages.length ? `${waiting.pages.length} página(s)` : null, waiting.models.length ? `${waiting.models.length} modelo(s)` : null, waiting.global?.pending ? "configuração global" : null].filter(Boolean);
  const attention = openRequests > 0 || waiting.count > 0 || problems.length > 0 || toSite > 0 || !syncedCollections || !catalogPresent || stale !== null || rowsNowhere.length > 0 || preview;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="a-h1">Visão geral <span className="a-muted">· {scopeName(scope)}</span></h1>
        <p className="a-muted mt-2 max-w-2xl">O que pede atenção em {scopeName(scope)} agora (troque a região no topo). Cada item leva para onde ele se resolve. O estado técnico do catálogo e da publicação fica em <Link href="/admin/sincronizacao" className="a-link">Sincronização</Link>.</p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <section className="a-card p-5" aria-labelledby="atencao" data-testid="attention">
        <h2 id="atencao" className="a-h2">O que pede atenção</h2>
        {!attention ? <p className="mt-3"><span className="a-badge ok">Nada agora</span> <span className="a-muted ml-2">Sem solicitações abertas, nada esperando publicação e nenhuma seção com problema.</span></p> : (
          <ul className="mt-3 divide-y divide-black/10">
            {openRequests > 0 && (
              <li className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid="overview-pending-requests">
                <span><strong>{openRequests}</strong> solicitação(ões) de personalização de {scopeName(scope)} esperando a equipe (recebidas, em criação ou com a arte pronta e o cliente ainda sem contato).</span>
                <Link href="/admin/personalizacao/solicitacoes" className="a-btn sm">Abrir a fila</Link>
              </li>
            )}
            {waiting.count > 0 && (
              <li className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid="overview-waiting">
                <span><strong>{waiting.count}</strong> {waiting.count === 1 ? "item esperando" : "itens esperando"} publicação: {waitingParts.join(", ")}. A loja só muda depois de publicar.</span>
                <Link href="/admin/publicar" className="a-btn sm">Ver em Publicar</Link>
              </li>
            )}
            {problems.length > 0 && (
              <li className="flex flex-wrap items-start justify-between gap-3 py-3" data-testid="overview-problems">
                <div>
                  <p><strong>{problems.length}</strong> {problems.length === 1 ? "seção não aparece" : "seções não aparecem"} na loja até serem corrigidas:</p>
                  <ul className="mt-1 list-disc pl-5 text-[0.9375rem]">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
                </div>
                <Link href="/admin/home" className="a-btn sm ghost">Abrir a Home</Link>
              </li>
            )}
            {rowsNowhere.length > 0 && (
              <li className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid="overview-state-rows">
                <span>Páginas de estado: <strong>{rowsNowhere.map((c) => c.name).join(", ")}</strong> {rowsNowhere.length === 1 ? "foi escolhida mas não aparece" : "foram escolhidas mas não aparecem"} em nenhum estado (menos de 3 produtos do estado ficam no carrossel).</span>
                <Link href="/admin/estados" className="a-btn sm ghost">Ver por estado</Link>
              </li>
            )}
            {toSite > 0 && (
              <li className="py-3">
                <form action={linkCollectionPagesAction} className="flex flex-wrap items-center justify-between gap-3" data-testid="link-collection-pages">
                  <input type="hidden" name="rev" value={ws.record?.rev ?? "null"} />
                  <input type="hidden" name="scope" value={scope} />
                  <span className="max-w-3xl"><strong>{toSite === 1 ? "1 botão ou bloco ainda abre" : `${toSite} botões ou blocos ainda abrem`} a coleção na loja da INK.</strong> Eles podem levar à página da coleção aqui no site, com todos os produtos. A troca vai para o rascunho; depois publique a home e as páginas alteradas.</span>
                  <button type="submit" className="a-btn sm">Levar para as páginas do site</button>
                </form>
              </li>
            )}
            {(!catalogPresent || !syncedCollections || stale) && (
              <li className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid="overview-sync">
                <span>{!catalogPresent ? "O catálogo desta loja ainda não foi sincronizado." : !syncedCollections ? "As coleções desta loja ainda não foram sincronizadas." : `Coleções da INK: ${stale!.toLowerCase()}.`} Sem dados atualizados, seções, menu e páginas de estado podem ficar desatualizados.</span>
                <Link href="/admin/sincronizacao" className="a-btn sm ghost">Abrir Sincronização</Link>
              </li>
            )}
            {preview && (
              <li className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span>{scopeName(scope)} está em <strong>prévia</strong>: a loja pública e a navegação ainda não mostram esta região.</span>
                <Link href="/admin/publicar" className="a-btn sm ghost">Lançamento em Publicar</Link>
              </li>
            )}
          </ul>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-2" aria-label="Resumo">
        <div className="a-card p-5">
          <p className="a-h2">Rascunho × publicado</p>
          <p className="mt-3 flex flex-wrap items-center gap-2">
            {ws.dirty ? <span className="a-badge warn">Alterações não publicadas</span> : <span className="a-badge ok">Rascunho = publicado</span>}
          </p>
          <dl className="mt-3 space-y-1 text-[0.9375rem]">
            <div className="flex justify-between gap-3"><dt className="a-muted">Rascunho</dt><dd className="font-bold">{ws.record ? `rev ${ws.record.rev} · ${ago(ws.record.updatedAt)}` : "sem rascunho salvo"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="a-muted">{prod ? "Publicado" : "Publicado (sandbox)"}</dt><dd className="font-bold">{head ? `release ${head.id} · ${ago(head.promotedAt)}` : "nada publicado (loja usa o seed)"}</dd></div>
          </dl>
          <Link href="/admin/publicar" className="a-link mt-4 inline-block text-[0.9375rem]">Ver diferenças e publicar</Link>
        </div>

        <div className="a-card p-5">
          <p className="a-h2">Seções da home</p>
          <p className="mt-3 text-[2.25rem] font-extrabold leading-none [font-family:var(--font-display-stack)]">{sections.filter((s) => s.active && s.template !== "footer").length}<span className="a-muted text-[1rem]"> ativas de {sections.filter((s) => s.template !== "footer").length}</span></p>
          <p className="a-muted mt-2 text-[0.9375rem]">{custom} criada(s) no painel · {sections.filter((s) => s.source?.kind === "ink-category").length} ligada(s) a uma coleção INK</p>
          <p className="mt-3">{problems.length === 0 ? <span className="a-badge ok">Sem problemas</span> : <span className="a-badge bad">{problems.length} problema(s)</span>}</p>
          <Link href="/admin/home" className="a-link mt-4 inline-block text-[0.9375rem]">Editar seções</Link>
        </div>
      </section>

      <section className="a-card p-5" aria-label="Pré-visualização do rascunho">
        <PreviewFrame version={ws.record?.rev ?? 0} height={680} />
      </section>
    </div>
  );
}

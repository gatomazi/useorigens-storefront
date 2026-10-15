import Link from "next/link";
import { adoptCollectionMenuAction, createCollectionPageAction, linkCollectionPagesAction, moveCollectionMenuAction, moveStateRowAction, resetStateRowsAction, setCollectionEnabledAction, setCollectionMenuPositionAction, setStateRowAction, syncCatalogAction, syncCollectionsAction } from "@/app/admin/actions";
import { STATE_ROW_MIN_ITEMS, stateRowCollections, stateRowsReach } from "@/lib/catalog/collection-source";
import { getCatalog } from "@/lib/catalog/repository";
import { REGIONS, STATE_NAMES } from "@/lib/geo/regions";
import { normalizeText } from "@/lib/geo/text";
import { Flash } from "@/components/admin/Flash";
import { LibrarySearch } from "@/components/admin/LibrarySearch";
import { collectionMenuEntries, type MenuEntry } from "@/lib/catalog/collection-menu";
import { collectionPageSlug, libraryEntries, type LibraryEntry } from "@/lib/catalog/collection-source";
import { searchCoverage } from "@/lib/catalog/collections";
import { getCollections } from "@/lib/catalog/collections-file";
import { searchCollections } from "@/lib/admin/collection-search";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { platform } from "@/lib/admin/platform";
import { snapshotStatus } from "@/lib/catalog/snapshot-file";
import { currentSyncJob } from "@/lib/catalog/sync-job";
import { INK_STORES, tokenFor } from "@/lib/ink/config";
import { loadWorkspace } from "@/lib/admin/workspace";
import { currentScope, storeOf } from "@/lib/admin/scope";
import type { CommerceStoreKey } from "@/lib/geo/regions";
import { enabledInternalIds, inkCollectionLinks, sectionsUsing } from "@/lib/site-config/collections-enabled";
import { effectiveMenu, menuPositionOf, type MenuPosition } from "@/lib/site-config/collection-menu";
import { effectiveNavbarGroups } from "@/lib/site-config/navbar-groups";
import { numberPt } from "@/lib/format";

const STORES = [
  { key: "use-sul", name: "Sul", editable: true },
  { key: "use-norte", name: "Norte", editable: true },
  { key: "use-centro", name: "Centro-Oeste", editable: true },
] as const;

const daysSince = (iso: string): number => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

const FILTERS = new Set(["all", "public", "internal", "enabled", "empty"]);
const MAX_ROWS = 120;

function passes(e: LibraryEntry, f: string): boolean {
  if (f === "public") return e.visibility === "public";
  if (f === "internal") return e.visibility === "internal";
  if (f === "enabled") return e.enabled;
  if (f === "empty") return !e.eligible;
  return true;
}

const POSITION_LABEL: Record<MenuPosition, string> = { none: "Não exibir", top: "Topo", more: "Categorias" };

/** Where a collection of the menu can really show up: a page of ours (the site) and/or its INK page (the Worker's navbar). */
function reachBadge(e: MenuEntry | undefined) {
  if (!e || (!e.pagePath && !e.inkUrl)) return <span className="a-badge warn" title="Sem página no site nem na INK (interna não habilitada, poucos produtos ou fora do último sync). A escolha fica guardada.">não aparece</span>;
  if (!e.pagePath) return <span className="a-badge" title="Sem página no site: a página da coleção precisa de pelo menos 3 produtos. Aparece só na navbar da INK.">só na INK</span>;
  if (!e.inkUrl) return <span className="a-badge" title="Interna (oculta na INK): não tem página na INK, então aparece só no menu do site.">só no site</span>;
  return null;
}

const reasonText = (e: LibraryEntry): string =>
  e.reason === "too-few-products" ? `Só ${e.matchedCount} produto(s) no catálogo: o carrossel precisa de pelo menos 3.` : e.reason === "needs-resync" ? "Registro antigo, sem os produtos: rode npm run collections:sync." : "";

export default async function CollectionsLibrary({ searchParams }: { searchParams: Promise<{ q?: string; f?: string; store?: string; from?: string; ok?: string; err?: string }> }) {
  const actor = await requireAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 80);
  const f = FILTERS.has(sp.f ?? "") ? (sp.f as string) : "all";
  const scope = await currentScope(actor);
  const store = STORES.find((s) => s.key === storeOf(scope)) ?? STORES[0]; // the Library shows the INK store of the region being edited, never another one
  const from = sp.from?.startsWith("/admin/") ? sp.from : null;
  const ws = await loadWorkspace(scope);
  const enabled = enabledInternalIds(ws.doc, store.key);
  const { menu, own: ownMenu } = effectiveMenu(ws.doc);
  const menuEntries = collectionMenuEntries(scope, ws.doc);
  const reach = new Map([...menuEntries.top, ...menuEntries.more].map((e) => [e.record.id, e]));
  // Categorias as the owner reads it: what really shows up, plus anything brought in by hand (so a choice that stopped working stays visible).
  const categories = menuEntries.more.filter((e) => e.pagePath || e.inkUrl || menu.added.some((r) => r.collectionId === e.record.id));
  const inkBefore = effectiveNavbarGroups(ws.doc).groups;
  const file = getCollections();
  const synced = file.stores[store.key];
  const all = libraryEntries(store.key as CommerceStoreKey, enabled);
  const legacy = all.some((e) => e.needsResync);
  const coverage = searchCoverage(synced?.collections ?? []);
  // "Página do estado": the rows the region's state pages show, and in how many of its states each one really appears (≥ STATE_ROW_MIN_ITEMS products).
  const stateRows = stateRowCollections(scope, ws.doc);
  const catalogNow = getCatalog();
  const rowReach = stateRowsReach(scope, ws.doc, (s) => catalogNow.productsOfStore(s));
  const stateCount = REGIONS[scope].ufs.length;
  const shownRows = stateRows.own ? stateRows.records : stateRows.records.filter((c) => (rowReach.get(c.id) ?? 0) > 0);
  const stateNameKeys = new Set(Object.values(STATE_NAMES).map(normalizeText));
  const addable = (synced?.collections ?? []).filter((c) => !shownRows.some((x) => x.id === c.id) && !stateNameKeys.has(normalizeText(c.name))).sort((a, b) => a.position - b.position);
  const ageDays = synced ? daysSince(synced.syncedAt) : 0;
  const catalogInfo = snapshotStatus().stores.find((c) => c.storeKey === store.key);
  const currentCatalog = catalogInfo?.syncedAt;
  const job = currentSyncJob();
  const tokenEnv = INK_STORES[store.key as CommerceStoreKey]?.tokenEnv ?? "INK_TOKEN_*";
  const hasToken = Boolean(tokenFor(store.key as CommerceStoreKey));
  const jobRunning = job.status === "running";
  const staleReason = !synced ? null : ageDays >= 7 ? "Desatualizada (7+ dias)" : currentCatalog && new Date(currentCatalog) > new Date(synced.catalogSyncedAt) ? "O catálogo é mais novo que as coleções" : null;
  const { syncs } = platform();
  const lastRun = actor.role === "owner" ? await syncs.last("collections") : null;
  // Links still opening a collection on INK that can open its page on the site instead ("Levar para as páginas do site").
  const toSite = inkCollectionLinks(ws.doc).filter((r) => collectionPageSlug(ws.doc, r.store, r.collectionId) !== null).length;
  const filtered = searchCollections(all.filter((e) => passes(e, f)), q).sort((a, b) => (q ? 0 : a.position - b.position));
  const shown = filtered.slice(0, MAX_ROWS);
  const counts = {
    public: all.filter((e) => e.visibility === "public" && e.selectable).length,
    internal: all.filter((e) => e.visibility === "internal" && e.selectable).length,
    internalEnabled: all.filter((e) => e.visibility === "internal" && e.enabled).length,
    internalTotal: all.filter((e) => e.visibility === "internal").length,
  };
  const carry = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (f !== "all") p.set("f", f);
    if (from) p.set("from", from);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return `/admin/colecoes?${p}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="a-h1">Coleções da INK</h1>
        <p className="a-muted mt-2 max-w-3xl">Biblioteca das coleções sincronizadas, inclusive as internas (ocultas na INK). Aqui você decide quais podem alimentar seções da home e o que aparece no menu do topo. Cada coleção que a região pode usar tem uma página no site com todos os produtos, em páginas, que é para onde o “Ver todos” e o menu levam. Nada é alterado na INK.</p>
      </div>
      {from && <p><Link href={from} className="a-btn ghost sm">← Voltar ao que eu estava fazendo</Link></p>}
      <Flash ok={sp.ok} err={sp.err} />

      <div className="a-card grid gap-4 p-5 md:grid-cols-2">
        <div>
          <p className="a-h2">O que cada status significa</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-[0.9375rem]">
            <li><span className="a-badge ok">Pública</span> aparece na loja da INK e já pode ser usada aqui.</li>
            <li><span className="a-badge">Interna</span> está <strong>oculta na INK</strong> (é uma segmentação interna). Isso <strong>não</strong> significa que os produtos estejam indisponíveis: eles continuam publicados.</li>
            <li><span className="a-badge ok">Habilitada no CMS</span> é uma permissão <strong>nossa</strong>, individual e reversível. Não muda nada no cadastro da INK.</li>
          </ul>
        </div>
        <div className="text-[0.9375rem]">
          <p className="a-h2">{store.name}</p>
          {synced ? (
            <ul className="mt-3 space-y-1">
              <li>{synced.collections.length} coleções sincronizadas ({counts.public} públicas utilizáveis)</li>
              <li>{counts.internalTotal} internas · <strong>{counts.internalEnabled} habilitadas</strong> · {counts.internal} utilizáveis agora</li>
              <li data-testid="search-coverage">Busca do site por nome de coleção: <strong>{coverage.complete} coleção(ões) públicas completas</strong>{coverage.partial.length > 0 && <span className="a-badge warn ml-2" title={coverage.partial.join(", ")}>{coverage.partial.length} parcial(is): sincronize as coleções</span>}</li>
              <li className="a-muted">Catálogo de referência: {new Date(synced.catalogSyncedAt).toLocaleDateString("pt-BR")}. Contagens = produtos publicados desta loja, não o total bruto da INK.</li>
              <li>Última sincronização: <strong>{new Date(synced.syncedAt).toLocaleString("pt-BR")}</strong> ({ageDays === 0 ? "hoje" : `há ${ageDays} dia(s)`}){staleReason && <span className="a-badge warn ml-2">{staleReason}</span>}</li>
            </ul>
          ) : <p className="a-flash err mt-3">Ainda não há coleções sincronizadas para esta loja. Sincronize primeiro o catálogo (botão abaixo); as coleções são atualizadas ao final.</p>}
          {legacy && <p className="a-flash err mt-3">Este arquivo é de uma versão antiga e não guarda os produtos das coleções internas. Sincronize de novo.</p>}
          <div className="mt-4 border-t border-black/15 pt-4" aria-label={`Catálogo de ${store.name}`}>
            <p className="font-bold">Catálogo da loja {store.name}</p>
            {catalogInfo && catalogInfo.productCount > 0 ? (
              <p className="a-muted mt-1 text-[0.875rem]">{numberPt.format(catalogInfo.productCount)} produtos · sincronizado em {new Date(catalogInfo.syncedAt).toLocaleString("pt-BR")}</p>
            ) : (
              <p className="a-flash err mt-1">O catálogo desta loja ainda não foi sincronizado. Sem ele não há como casar as coleções nem lançar a região.</p>
            )}
            {!hasToken && <p className="a-flash err mt-2">A variável <code>{tokenEnv}</code> não está configurada neste ambiente. Crie-a no Railway e espere o serviço reiniciar.</p>}
            {job.status === "running" && <p className="a-flash ok mt-2">Sincronização em andamento desde {new Date(job.startedAt).toLocaleTimeString("pt-BR")} ({job.storeKeys.join(", ") || "todas as lojas"}). Recarregue a página para acompanhar.</p>}
            {job.status === "succeeded" && (
              <p className="a-muted mt-2 text-[0.8125rem]">
                Última sincronização de catálogo: {new Date(job.finishedAt).toLocaleString("pt-BR")} ·{" "}
                {job.result.outcomes.map((o) => (o.ok ? `${o.storeKey}: ${o.productCount} produtos` : `${o.storeKey}: falhou (${o.error})`)).join("; ")}
                {job.collections && ("error" in job.collections ? ` · coleções: falhou (${job.collections.error})` : ` · coleções: ${job.collections.outcomes.map((o) => (o.ok ? `${o.storeKey} ${o.collections}` : `${o.storeKey} falhou (${o.error})`)).join("; ")}`)}
              </p>
            )}
            {job.status === "failed" && <p className="a-flash err mt-2">A última sincronização de catálogo falhou: {job.error}. Os dados anteriores foram mantidos.</p>}
            {actor.role === "owner" && (
              <form action={syncCatalogAction} className="mt-3">
                <input type="hidden" name="scope" value={scope} />
                <button type="submit" className="a-btn ghost sm" disabled={jobRunning || !hasToken}>Sincronizar catálogo de {store.name}</button>
                <p className="a-muted mt-2 text-[0.8125rem]">Só leitura na INK. Leva alguns minutos (requisições espaçadas) e roda em segundo plano; ao terminar, as coleções desta loja também são atualizadas. Se falhar, os dados atuais são mantidos.</p>
              </form>
            )}
          </div>
          {actor.role === "owner" && (
            <form action={syncCollectionsAction} className="mt-4">
              <button type="submit" className="a-btn ghost sm">Sincronizar coleções agora</button>
              <p className="a-muted mt-2 text-[0.8125rem]">Somente leitura na INK (cerca de 4 requisições). Se a INK falhar, os dados atuais são mantidos.{lastRun ? ` Última execução: ${lastRun.status === "succeeded" ? "ok" : lastRun.status === "running" ? "em andamento" : "falhou"} · ${new Date(lastRun.startedAt).toLocaleString("pt-BR")}.` : ""}</p>
            </form>
          )}
        </div>
      </div>

      {toSite > 0 && (
        <form action={linkCollectionPagesAction} className="a-card flex flex-wrap items-center justify-between gap-3 p-5" data-testid="link-collection-pages">
          <input type="hidden" name="rev" value={ws.record?.rev ?? "null"} />
          <input type="hidden" name="scope" value={scope} />
          <p className="max-w-3xl text-[0.9375rem]"><strong>{toSite === 1 ? "1 botão ou bloco ainda abre" : `${toSite} botões ou blocos ainda abrem`} a coleção na loja da INK.</strong> Eles podem levar à página da coleção aqui no site, com todos os produtos. A troca vai para o rascunho; depois publique a home e as páginas alteradas.</p>
          <button type="submit" className="a-btn sm">Levar para as páginas do site</button>
        </form>
      )}

      <p className="a-muted">Coleções da loja INK de <strong>{store.name}</strong> (a região em edição). Para ver outra loja, troque a região no topo.</p>

      <div className="a-card p-5"><LibrarySearch q={q} f={f} /></div>

      {synced && (
        <section id="menu-colecoes" className="a-card scroll-mt-4 p-5" aria-label="Menu de coleções" data-testid="collection-menu">
          <p className="a-h2">Menu de coleções (site e INK)</p>
          <p className="a-muted mt-2 max-w-3xl">Um menu só para o topo do site e para a navbar das páginas de produto da INK. <strong>Topo</strong>: direto na barra, na ordem abaixo. <strong>Categorias</strong>: o menu “Categorias” do site, com todas (as do topo primeiro), e “Demais categorias” na INK. Toda coleção <strong>pública</strong> entra sozinha em Categorias, na ordem do menu da INK; use <strong>Não exibir</strong> para tirar uma. Coleção interna só aparece no site, e só se você colocar. No site, cada uma abre a página da coleção. Vale depois de <strong>Publicar</strong>.</p>
          {!ownMenu && (
            <div className="a-flash mt-3 flex flex-wrap items-center justify-between gap-3" data-testid="menu-adopt">
              <p className="max-w-3xl">A navbar da INK ainda mostra a escolha antiga ({inkBefore.top.length} no topo, {inkBefore.more.length} em Demais categorias). Ela passa a seguir este menu na primeira mudança aqui, ou com o botão ao lado, depois de publicar. O site já mostra este menu.</p>
              <form action={adoptCollectionMenuAction}>
                <input type="hidden" name="rev" value={ws.record?.rev ?? "null"} />
                <input type="hidden" name="scope" value={scope} />
                <button type="submit" className="a-btn sm">Usar este menu também na INK</button>
              </form>
            </div>
          )}
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <div data-testid="menu-top">
              <p className="font-bold">Topo <span className="a-muted font-normal">({menu.top.length})</span></p>
              {menu.top.length === 0 ? <p className="a-muted mt-2 text-[0.875rem]">Nenhuma coleção no topo: a barra mostra só Regiões, Categorias e os links da home.</p> : (
                <ol className="mt-2 space-y-1">
                  {menu.top.map((ref, i) => {
                    const entry = all.find((x) => x.id === ref.collectionId && x.store === ref.store);
                    return (
                      <li key={`${ref.store}:${ref.collectionId}`} className="flex flex-wrap items-center gap-2">
                        <span className="a-muted w-5 text-right">{i + 1}.</span>
                        <span className="font-semibold">{entry?.name ?? `coleção #${ref.collectionId}`}</span>
                        {reachBadge(reach.get(ref.collectionId))}
                        <form action={moveCollectionMenuAction} className="ml-auto flex gap-1">
                          <input type="hidden" name="ref" value={`${ref.store}:${ref.collectionId}`} />
                          <input type="hidden" name="rev" value={ws.record?.rev ?? "null"} />
                          <input type="hidden" name="scope" value={scope} />
                          <button type="submit" name="direction" value="up" className="a-btn sm ghost" disabled={i === 0} aria-label={`Subir ${entry?.name ?? ref.collectionId}`}>↑</button>
                          <button type="submit" name="direction" value="down" className="a-btn sm ghost" disabled={i === menu.top.length - 1} aria-label={`Descer ${entry?.name ?? ref.collectionId}`}>↓</button>
                        </form>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
            <div data-testid="menu-categories">
              <p className="font-bold">Categorias <span className="a-muted font-normal">({categories.length} além das do topo)</span></p>
              {categories.length === 0 ? <p className="a-muted mt-2 text-[0.875rem]">Nenhuma outra coleção: Categorias mostra só as do topo.</p> : (
                <ul className="mt-2 space-y-1">
                  {categories.map((e) => (
                    <li key={e.record.id} className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{e.record.name}</span>
                      {reachBadge(e)}
                    </li>
                  ))}
                </ul>
              )}
              <p className="a-muted mt-2 text-[0.8125rem]">Na ordem do menu da INK. Para mudar, use a coluna “Menu” da tabela.</p>
            </div>
          </div>
        </section>
      )}

      {synced && (
        <section id="pagina-estado" className="a-card scroll-mt-4 p-5" aria-label="Página do estado" data-testid="state-rows">
          <p className="a-h2">Página do estado</p>
          <p className="a-muted mt-2 max-w-3xl">Na página de cada estado (ex.: <code>/{scope}/{REGIONS[scope].ufs[0].toLowerCase()}</code>) entra um carrossel por coleção, só com os produtos que também estão na coleção com o nome do estado (“{STATE_NAMES[REGIONS[scope].ufs[0]]}”). Um carrossel precisa de pelo menos {STATE_ROW_MIN_ITEMS} produtos daquele estado. {stateRows.own ? <><strong>Lista escolhida por você</strong>, nesta ordem.</> : <><strong>Automático</strong>: toda coleção pública com produtos do estado, na ordem do menu da INK. Ao mexer aqui, a lista passa a ser sua.</>} Vale depois de <strong>Publicar</strong>.</p>
          {shownRows.length === 0 ? <p className="a-muted mt-3 text-[0.875rem]">Nenhuma coleção aparece hoje nas páginas de estado desta região.</p> : (
            <ol className="mt-3 space-y-1">
              {shownRows.map((c, i) => {
                const ref = `${store.key}:${c.id}`;
                const n = rowReach.get(c.id) ?? 0;
                return (
                  <li key={c.id} className="flex flex-wrap items-center gap-2">
                    <span className="a-muted w-5 text-right">{i + 1}.</span>
                    <span className="font-semibold">{c.name}</span>
                    <span className="a-badge" title={`Estados desta região em que a coleção tem pelo menos ${STATE_ROW_MIN_ITEMS} produtos do estado`}>{n === 0 ? "não aparece em nenhum estado" : `em ${n} de ${stateCount} estados`}</span>
                    <form action={moveStateRowAction} className="ml-auto flex gap-1">
                      <input type="hidden" name="ref" value={ref} />
                      <input type="hidden" name="rev" value={ws.record?.rev ?? "null"} />
                      <input type="hidden" name="scope" value={scope} />
                      <button type="submit" name="direction" value="up" className="a-btn sm ghost" disabled={i === 0} aria-label={`Subir ${c.name}`}>↑</button>
                      <button type="submit" name="direction" value="down" className="a-btn sm ghost" disabled={i === shownRows.length - 1} aria-label={`Descer ${c.name}`}>↓</button>
                    </form>
                    <form action={setStateRowAction}>
                      <input type="hidden" name="ref" value={ref} />
                      <input type="hidden" name="on" value="0" />
                      <input type="hidden" name="rev" value={ws.record?.rev ?? "null"} />
                      <input type="hidden" name="scope" value={scope} />
                      <button type="submit" className="a-btn sm ghost" aria-label={`Tirar ${c.name} da página do estado`}>Tirar</button>
                    </form>
                  </li>
                );
              })}
            </ol>
          )}
          <div className="mt-4 flex flex-wrap items-end gap-3">
            {addable.length > 0 && (
              <form action={setStateRowAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="on" value="1" />
                <input type="hidden" name="rev" value={ws.record?.rev ?? "null"} />
                <input type="hidden" name="scope" value={scope} />
                <div>
                  <label className="a-label" htmlFor="state-row-add">Incluir coleção</label>
                  <select id="state-row-add" name="ref" className="a-input">
                    {addable.map((c) => <option key={c.id} value={`${store.key}:${c.id}`}>{c.name}{c.isAvailable ? "" : " (interna)"}</option>)}
                  </select>
                </div>
                <button type="submit" className="a-btn sm">Incluir</button>
              </form>
            )}
            {stateRows.own && (
              <form action={resetStateRowsAction} className="ml-auto">
                <input type="hidden" name="rev" value={ws.record?.rev ?? "null"} />
                <input type="hidden" name="scope" value={scope} />
                <button type="submit" className="a-btn sm ghost">Voltar ao automático</button>
              </form>
            )}
          </div>
        </section>
      )}

      {!synced ? null : (
        <section className="a-card overflow-x-auto" aria-label="Coleções">
          <table className="a-table a-stack">
            <caption className="sr-only">Coleções de {store.name}</caption>
            <thead><tr><th scope="col">Coleção</th><th scope="col">Na INK</th><th scope="col">Produtos no catálogo</th><th scope="col">No CMS</th><th scope="col">Página no site</th><th scope="col">Menu</th><th scope="col"><span className="sr-only">Ação</span></th></tr></thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={7} className="a-muted">Nenhuma coleção corresponde à busca e ao filtro.{" "}<Link className="a-link" href={carry({ q: "", f: "all" }).replace(/q=&?|f=all&?/g, "")}>Limpar</Link></td></tr>}
              {shown.map((e) => {
                const users = e.visibility === "internal" ? sectionsUsing(ws.doc, e.store, e.id) : [];
                // The collection's page on the storefront: drawn on its own for every collection the region can use; a landing at the same address replaces it.
                const landing = ws.doc.pages?.find((p) => p.kind === "categoryLanding" && p.slug === e.slug);
                return (
                  <tr key={e.id}>
                    <td>
                      <p className="font-bold">{e.name}</p>
                      <p className="a-muted text-[0.8125rem]">{e.slug} · #{e.id}</p>
                    </td>
                    <td data-label="Na INK">{e.visibility === "public" ? <span className="a-badge ok">Pública</span> : <span className="a-badge" title="Oculta na INK: segmentação interna. Os produtos seguem publicados.">Interna (oculta na INK)</span>}</td>
                    <td data-label="Produtos no catálogo">
                      <p className="font-bold">{numberPt.format(e.matchedCount)}</p>
                      <p className="a-muted text-[0.8125rem]">{e.merchCount} avulsos · {numberPt.format(e.cityDesignCount)} de cidade</p>
                      {!e.eligible && <p className="mt-1 text-[0.8125rem]"><span className="a-badge warn">Sem produtos elegíveis</span> {reasonText(e)}</p>}
                    </td>
                    <td data-label="No CMS">
                      {e.visibility === "public" ? <span className="a-muted">Habilitada (pública)</span> : e.enabled ? <span className="a-badge ok">Habilitada no CMS</span> : <span className="a-badge">Desabilitada</span>}
                      {users.length > 0 && <p className="a-muted mt-1 text-[0.8125rem]">Usada em: {users.map((s) => s.title ?? s.id).join(", ")}</p>}
                    </td>
                    <td data-label="Página no site">
                      {landing ? (
                        <>
                          <Link className="a-link font-semibold" href={`/admin/paginas/${landing.id}`}>Editar página</Link>
                          <p className="a-muted mt-1 text-[0.8125rem]">Categoria-pai “{landing.title}”{landing.archived ? " (arquivada: a automática vale)" : ws.baseDoc.pages?.some((p) => p.id === landing.id) ? "" : " (rascunho: até publicar, vale a automática)"}</p>
                        </>
                      ) : e.selectable ? (
                        <form action={createCollectionPageAction} className="space-y-1">
                          <input type="hidden" name="ref" value={`${e.store}:${e.id}`} />
                          <input type="hidden" name="rev" value={ws.record?.rev ?? "null"} />
                          <input type="hidden" name="scope" value={scope} />
                          <p className="text-[0.8125rem]"><code>/{scope}/colecoes/{e.slug}</code></p>
                          <button type="submit" className="a-btn ghost sm" title="Cria no rascunho uma categoria-pai com este endereço, com o título e a grade da coleção, para você trocar textos e imagem">Personalizar página</button>
                        </form>
                      ) : <span className="a-muted" title="Só coleções que a região pode usar (públicas, ou internas habilitadas, com ao menos 3 produtos) têm página.">Sem página</span>}
                    </td>
                    <td data-label="Menu">
                      {(() => {
                        const isPublic = e.visibility === "public";
                        const reachable = collectionPageSlug(ws.doc, e.store, e.id) !== null || (isPublic && e.matchedCount >= 1);
                        const current = menuPositionOf(menu, { store: e.store, collectionId: e.id }, isPublic);
                        return (
                          <form action={setCollectionMenuPositionAction} role="group" aria-label={`Posição de ${e.name} no menu`} className="flex flex-wrap gap-1">
                            <input type="hidden" name="ref" value={`${e.store}:${e.id}`} />
                            <input type="hidden" name="rev" value={ws.record?.rev ?? "null"} />
                            <input type="hidden" name="scope" value={scope} />
                            <input type="hidden" name="q" value={q} />
                            <input type="hidden" name="f" value={f === "all" ? "" : f} />
                            <input type="hidden" name="from" value={from ?? ""} />
                            {(["none", "top", "more"] as MenuPosition[]).map((pos) => {
                              const blocked = pos !== "none" && current !== pos && !reachable;
                              return (
                                <button key={pos} type="submit" name="position" value={pos} aria-pressed={current === pos} className={`a-btn sm ${current === pos ? "" : "ghost"}`} disabled={blocked} title={blocked ? (isPublic ? "Sem produtos no catálogo local." : "Interna: habilite no CMS (e ela precisa de 3 produtos) para ter página no site.") : undefined}>
                                  {POSITION_LABEL[pos]}
                                </button>
                              );
                            })}
                          </form>
                        );
                      })()}
                    </td>
                    <td className="text-right">
                      {e.visibility === "internal" && (
                        <form action={setCollectionEnabledAction}>
                          <input type="hidden" name="ref" value={`${e.store}:${e.id}`} />
                          <input type="hidden" name="rev" value={ws.record?.rev ?? "null"} />
                          <input type="hidden" name="scope" value={scope} />
                          <input type="hidden" name="q" value={q} />
                          <input type="hidden" name="f" value={f === "all" ? "" : f} />
                          <input type="hidden" name="from" value={from ?? ""} />
                          {e.enabled ? (
                            <button type="submit" name="enabled" value="false" className="a-btn sm ghost" disabled={users.length > 0} title={users.length > 0 ? "Remova ou troque as seções que usam esta coleção antes de desabilitar." : undefined}>Desabilitar</button>
                          ) : (
                            <button type="submit" name="enabled" value="true" className="a-btn sm" disabled={!e.eligible}>Habilitar</button>
                          )}
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length > shown.length && <p className="a-muted p-4 text-[0.875rem]">Mostrando {shown.length} de {filtered.length}. Refine a busca para ver as demais.</p>}
        </section>
      )}
    </div>
  );
}

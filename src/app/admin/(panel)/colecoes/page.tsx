import Link from "next/link";
import { FollowCard } from "@/components/admin/FollowCard";
import { createCollectionPageAction, setCollectionEnabledAction } from "@/app/admin/actions";
import { Flash } from "@/components/admin/Flash";
import { RegionCopyPanel } from "@/components/admin/RegionCopyPanel";
import { LibrarySearch } from "@/components/admin/LibrarySearch";
import { libraryEntries, type LibraryEntry } from "@/lib/catalog/collection-source";
import { searchCoverage } from "@/lib/catalog/collections";
import { getCollections } from "@/lib/catalog/collections-file";
import { searchCollections } from "@/lib/admin/collection-search";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { collectionsStaleReason, daysSince } from "@/lib/admin/sync-status";
import { loadWorkspace } from "@/lib/admin/workspace";
import { currentScope, storeOf } from "@/lib/admin/scope";
import type { CommerceStoreKey } from "@/lib/geo/regions";
import { enabledInternalIds, sectionsUsing } from "@/lib/site-config/collections-enabled";
import { effectiveMenu, menuPositionOf, type MenuPosition } from "@/lib/site-config/collection-menu";
import { numberPt } from "@/lib/format";

const STORES = [
  { key: "use-sul", name: "Sul", editable: true },
  { key: "use-norte", name: "Norte", editable: true },
  { key: "use-centro", name: "Centro-Oeste", editable: true },
] as const;

const FILTERS = new Set(["all", "public", "internal", "enabled", "empty"]);
const MAX_ROWS = 120;

function passes(e: LibraryEntry, f: string): boolean {
  if (f === "public") return e.visibility === "public";
  if (f === "internal") return e.visibility === "internal";
  if (f === "enabled") return e.enabled;
  if (f === "empty") return !e.eligible;
  return true;
}

const POSITION_LABEL: Record<MenuPosition, string> = { none: "Fora do menu", top: "Topo", more: "Categorias" };

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
  const { menu } = effectiveMenu(ws.doc);
  const file = getCollections();
  const synced = file.stores[store.key];
  const all = libraryEntries(store.key as CommerceStoreKey, enabled);
  const legacy = all.some((e) => e.needsResync);
  const coverage = searchCoverage(synced?.collections ?? []);
  const ageDays = synced ? daysSince(synced.syncedAt) : 0;
  const staleReason = collectionsStaleReason(store.key);
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
        <p className="a-muted mt-2 max-w-3xl">Biblioteca das coleções sincronizadas, inclusive as internas (ocultas na INK). Aqui você habilita uma interna para usar no painel e personaliza a página de uma coleção no site (para onde o “Ver todos” e o menu levam). Onde cada coleção aparece se decide em <Link href="/admin/navegacao#menu-colecoes" className="a-link">Menu</Link>, nas seções da <Link href="/admin/home" className="a-link">Home</Link> e das <Link href="/admin/paginas" className="a-link">Páginas</Link> e em <Link href="/admin/estados" className="a-link">Páginas de estado</Link>. Nada é alterado na INK.</p>
      </div>
      {from && <p><Link href={from} className="a-btn ghost sm">← Voltar ao que eu estava fazendo</Link></p>}
      <Flash ok={sp.ok} err={sp.err} />
      <FollowCard actor={actor} scope={scope} part="menu" doc={ws.doc} baseDoc={ws.baseDoc} rev={ws.record?.rev ?? null} to="/admin/colecoes" />
      <RegionCopyPanel actor={actor} scope={scope} part="collection-menu" rev={ws.record?.rev ?? null} />

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
          ) : <p className="a-flash err mt-3">Ainda não há coleções sincronizadas para esta loja. Sincronize primeiro o catálogo em Sincronização; as coleções são atualizadas ao final.</p>}
          {legacy && <p className="a-flash err mt-3">Este arquivo é de uma versão antiga e não guarda os produtos das coleções internas. Sincronize de novo.</p>}
          <p className="mt-4"><Link href="/admin/sincronizacao" className="a-link text-[0.875rem]">{actor.role === "owner" ? "Sincronizar catálogo e coleções em Sincronização" : "Ver o estado da sincronização"}</Link></p>
        </div>
      </div>

      <p className="a-muted">Coleções da loja INK de <strong>{store.name}</strong> (a região em edição). Para ver outra loja, troque a região no topo.</p>

      <div className="a-card p-5"><LibrarySearch q={q} f={f} /></div>

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
                        const position = menuPositionOf(menu, { store: e.store, collectionId: e.id }, e.visibility === "public");
                        return <Link href="/admin/navegacao#menu-colecoes" className={position === "none" ? "a-muted text-[0.875rem]" : "a-badge"} title="Mudar no Menu">{POSITION_LABEL[position]}</Link>;
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

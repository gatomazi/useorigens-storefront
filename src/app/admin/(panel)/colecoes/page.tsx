import Link from "next/link";
import { moveCollectionNavbarAction, setCollectionEnabledAction, setCollectionNavbarPositionAction, syncCatalogAction, syncCollectionsAction } from "@/app/admin/actions";
import { Flash } from "@/components/admin/Flash";
import { LibrarySearch } from "@/components/admin/LibrarySearch";
import { libraryEntries, type LibraryEntry } from "@/lib/catalog/collection-source";
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
import { enabledInternalIds, sectionsUsing } from "@/lib/site-config/collections-enabled";
import { effectiveNavbarGroups, navbarPositionOf, type NavbarPosition } from "@/lib/site-config/navbar-groups";
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
  const { groups: navGroups, legacy: navLegacy } = effectiveNavbarGroups(ws.doc);
  const file = getCollections();
  const synced = file.stores[store.key];
  const all = libraryEntries(store.key as CommerceStoreKey, enabled);
  const legacy = all.some((e) => e.needsResync);
  const coverage = searchCoverage(synced?.collections ?? []);
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
        <p className="a-muted mt-2 max-w-3xl">Biblioteca das coleções sincronizadas, inclusive as internas (ocultas na INK). Aqui você decide quais podem alimentar seções da home. Nada é alterado na INK.</p>
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

      <p className="a-muted">Coleções da loja INK de <strong>{store.name}</strong> (a região em edição). Para ver outra loja, troque a região no topo.</p>

      <div className="a-card p-5"><LibrarySearch q={q} f={f} /></div>

      {synced && (
        <section className="a-card p-5" aria-label="Navbar da INK" data-testid="navbar-groups">
          <p className="a-h2">Navbar da INK</p>
          <p className="a-muted mt-2 max-w-3xl">Duas posições livres: <strong>Topo</strong> (direto na barra) e <strong>Demais categorias</strong> (menu suspenso). Qualquer quantidade em cada uma, na ordem abaixo; uma coleção fica em no máximo uma delas. Nenhuma coleção é especial: “Novidades” é só o nome de uma coleção. Vale depois de <strong>Publicar</strong>. Regiões e Cidades são fixos.</p>
          {navLegacy && <p className="a-flash mt-3">Seleção antiga (lista única): todas contam como <strong>Topo</strong> até você redistribuí-las; a primeira alteração aqui a converte.</p>}
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            {(["top", "more"] as const).map((group) => (
              <div key={group}>
                <p className="font-bold">{group === "top" ? "Topo" : "Demais categorias"} <span className="a-muted font-normal">({navGroups[group].length})</span></p>
                {navGroups[group].length === 0 ? <p className="a-muted mt-2 text-[0.875rem]">{group === "more" ? "Vazio: o botão “Demais categorias” não aparece." : "Nenhuma coleção no topo."}</p> : (
                  <ol className="mt-2 space-y-1">
                    {navGroups[group].map((ref, i) => {
                      const entry = all.find((x) => x.id === ref.collectionId && x.store === ref.store);
                      const eligible = !!entry && entry.visibility === "public" && entry.matchedCount >= 1;
                      return (
                        <li key={`${ref.store}:${ref.collectionId}`} className="flex flex-wrap items-center gap-2">
                          <span className="a-muted w-5 text-right">{i + 1}.</span>
                          <span className="font-semibold">{entry?.name ?? `coleção #${ref.collectionId}`}</span>
                          {!eligible && <span className="a-badge warn" title="Interna, sem produtos ou fora do último sync: não aparece publicamente até regularizar. A escolha fica guardada.">não será publicada</span>}
                          <form action={moveCollectionNavbarAction} className="ml-auto flex gap-1">
                            <input type="hidden" name="ref" value={`${ref.store}:${ref.collectionId}`} />
                            <input type="hidden" name="rev" value={ws.record?.rev ?? "null"} />
                            <input type="hidden" name="scope" value={scope} />
                            <button type="submit" name="direction" value="up" className="a-btn sm ghost" disabled={i === 0} aria-label={`Subir ${entry?.name ?? ref.collectionId}`}>↑</button>
                            <button type="submit" name="direction" value="down" className="a-btn sm ghost" disabled={i === navGroups[group].length - 1} aria-label={`Descer ${entry?.name ?? ref.collectionId}`}>↓</button>
                          </form>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {!synced ? null : (
        <section className="a-card overflow-x-auto" aria-label="Coleções">
          <table className="a-table a-stack">
            <caption className="sr-only">Coleções de {store.name}</caption>
            <thead><tr><th scope="col">Coleção</th><th scope="col">Na INK</th><th scope="col">Produtos no catálogo</th><th scope="col">No CMS</th><th scope="col">Navbar da INK</th><th scope="col"><span className="sr-only">Ação</span></th></tr></thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={6} className="a-muted">Nenhuma coleção corresponde à busca e ao filtro.{" "}<Link className="a-link" href={carry({ q: "", f: "all" }).replace(/q=&?|f=all&?/g, "")}>Limpar</Link></td></tr>}
              {shown.map((e) => {
                const users = e.visibility === "internal" ? sectionsUsing(ws.doc, e.store, e.id) : [];
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
                    <td data-label="Navbar da INK">
                      {e.visibility === "public" ? (
                        <form action={setCollectionNavbarPositionAction} role="group" aria-label={`Posição de ${e.name} na navbar da INK`} className="flex flex-wrap gap-1">
                          <input type="hidden" name="ref" value={`${e.store}:${e.id}`} />
                          <input type="hidden" name="rev" value={ws.record?.rev ?? "null"} />
                          <input type="hidden" name="scope" value={scope} />
                          <input type="hidden" name="q" value={q} />
                          <input type="hidden" name="f" value={f === "all" ? "" : f} />
                          <input type="hidden" name="from" value={from ?? ""} />
                          {(["none", "top", "more"] as NavbarPosition[]).map((pos) => {
                            const current = navbarPositionOf(navGroups, { store: e.store, collectionId: e.id }) === pos;
                            return (
                              <button key={pos} type="submit" name="position" value={pos} aria-pressed={current} className={`a-btn sm ${current ? "" : "ghost"}`} disabled={pos !== "none" && e.matchedCount < 1} title={pos !== "none" && e.matchedCount < 1 ? "Sem produtos no catálogo local." : undefined}>
                                {pos === "none" ? "Não exibir" : pos === "top" ? "Topo" : "Demais categorias"}
                              </button>
                            );
                          })}
                        </form>
                      ) : <span className="a-muted" title="Coleção interna: não tem página pública na INK.">Indisponível</span>}
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

import Link from "next/link";
import { setCollectionEnabledAction, setCollectionNavbarAction, syncCatalogAction, syncCollectionsAction } from "@/app/admin/actions";
import { Flash } from "@/components/admin/Flash";
import { LibrarySearch } from "@/components/admin/LibrarySearch";
import { libraryEntries, type LibraryEntry } from "@/lib/catalog/collection-source";
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
import { MAX_NAVBAR_COLLECTIONS } from "@/lib/site-config/schema";
import { enabledInternalIds, navbarCollectionIds, sectionsUsing } from "@/lib/site-config/collections-enabled";
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
  const inNavbar = navbarCollectionIds(ws.doc, store.key);
  const file = getCollections();
  const synced = file.stores[store.key];
  const all = libraryEntries(store.key as CommerceStoreKey, enabled);
  const legacy = all.some((e) => e.needsResync);
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
                        <form action={setCollectionNavbarAction}>
                          <input type="hidden" name="ref" value={`${e.store}:${e.id}`} />
                          <input type="hidden" name="rev" value={ws.record?.rev ?? "null"} />
                          <input type="hidden" name="scope" value={scope} />
                          <input type="hidden" name="q" value={q} />
                          <input type="hidden" name="f" value={f === "all" ? "" : f} />
                          <input type="hidden" name="from" value={from ?? ""} />
                          {inNavbar.has(e.id) ? (
                            <>
                              <span className="a-badge ok">Na navbar</span>{" "}
                              <button type="submit" name="shown" value="false" className="a-btn sm ghost">Tirar</button>
                            </>
                          ) : (
                            <button type="submit" name="shown" value="true" className="a-btn sm ghost" disabled={e.matchedCount < 1 || inNavbar.size >= MAX_NAVBAR_COLLECTIONS} title={e.matchedCount < 1 ? "Sem produtos no catálogo local." : inNavbar.size >= MAX_NAVBAR_COLLECTIONS ? `A navbar comporta no máximo ${MAX_NAVBAR_COLLECTIONS} coleções.` : undefined}>Mostrar</button>
                          )}
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

import Link from "next/link";
import { syncCatalogAction, syncCollectionsAction, syncLojaUnicaAction } from "@/app/admin/actions";
import { Flash } from "@/components/admin/Flash";
import { SyncProgress } from "@/components/admin/SyncProgress";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { inspectPublishing } from "@/lib/admin/ops";
import { platform } from "@/lib/admin/platform";
import { currentScope, scopeName, storeOf } from "@/lib/admin/scope";
import { loadWorkspace } from "@/lib/admin/workspace";
import { libraryEntries, MIN_USABLE_PRODUCTS, type LibraryEntry } from "@/lib/catalog/collection-source";
import { searchCoverage, type StoreCollections } from "@/lib/catalog/collections";
import { collectionsPath, getCollections } from "@/lib/catalog/collections-file";
import { commercePlan, singleStoreDataDir } from "@/lib/catalog/commerce-mode";
import { snapshotPath, snapshotStatus } from "@/lib/catalog/snapshot-file";
import { currentSyncJob } from "@/lib/catalog/sync-job";
import { currentLojaUnicaJob, lojaUnicaJobPercent } from "@/lib/catalog/unificado/sync-loja-unica-job";
import { numberPt } from "@/lib/format";
import { SINGLE_STORE_KEY, type CommerceStoreKey } from "@/lib/geo/regions";
import { INK_STORES, tokenFor } from "@/lib/ink/config";
import { enabledInternalIds } from "@/lib/site-config/collections-enabled";
import { siteConfigHomeEnabled } from "@/lib/site-config/flag";
import { publishedFilePath, readPublished } from "@/lib/site-config/published";
import { collectionsStaleReason, daysSince } from "@/lib/admin/sync-status";

const STORE_NAME: Record<CommerceStoreKey, string> = { "use-sul": "Sul", "use-norte": "Norte", "use-centro": "Centro-Oeste", "use-origens": "Use Origens" };

const ago = (iso: string | null | undefined): string => {
  if (!iso) return "nunca";
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return `há ${min} min`;
  if (min < 60 * 48) return `há ${Math.round(min / 60)} h`;
  return `há ${Math.round(min / 1440)} dias`;
};

/** One store's collections as the panel reads them: how many, how many usable, search coverage, when they were synced. */
function CollectionsSummary({ synced, all, staleReason }: { synced: StoreCollections; all: LibraryEntry[]; staleReason?: string | null }) {
  const coverage = searchCoverage(synced.collections);
  const internal = all.filter((e) => e.visibility === "internal");
  return (
    <ul className="mt-3 space-y-1">
      <li>{synced.collections.length} coleções sincronizadas ({all.filter((e) => e.visibility === "public" && e.selectable).length} públicas utilizáveis)</li>
      <li>{internal.length} internas · <strong>{internal.filter((e) => e.enabled).length} habilitadas</strong> · {internal.filter((e) => e.selectable).length} utilizáveis agora</li>
      <li>Busca do site por nome de coleção: <strong>{coverage.complete} coleção(ões) públicas completas</strong>{coverage.partial.length > 0 && <span className="a-badge warn ml-2" title={coverage.partial.join(", ")}>{coverage.partial.length} parcial(is): sincronize as coleções</span>}</li>
      <li className="a-muted">Catálogo de referência: {new Date(synced.catalogSyncedAt).toLocaleDateString("pt-BR")}. Contagens = produtos publicados desta loja, não o total bruto da INK.</li>
      <li>Última sincronização: <strong>{new Date(synced.syncedAt).toLocaleString("pt-BR")}</strong> ({daysSince(synced.syncedAt) === 0 ? "hoje" : `há ${daysSince(synced.syncedAt)} dia(s)`}){staleReason && <span className="a-badge warn ml-2">{staleReason}</span>}</li>
    </ul>
  );
}

/**
 * "Sincronização": the data the panel and the storefront read from INK (catalog and collections, read-only) and the technical state of publishing
 * on this machine. Owner-only buttons; everyone may read it. In single-store mode the site serves the single store's own files (loja-unica/), so
 * that store comes first, with its own catalog button and progress bar; the regional files stay below, folded, since nothing serves them then.
 */
export default async function SyncScreen({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const actor = await requireAdmin();
  const sp = await searchParams;
  const scope = await currentScope(actor);
  const store = storeOf(scope) as CommerceStoreKey;
  const owner = actor.role === "owner";
  const prod = platform().mode === "prod";
  const lojaUnica = commercePlan().effective === "single-store";
  const ws = await loadWorkspace(scope);
  // The regional files (what `catalog:sync` / `collections:sync` keep); in multi-store mode they are also what the site serves.
  const regionalPath = collectionsPath();
  const file = getCollections(regionalPath);
  const synced = file.stores[store];
  const all = libraryEntries(store, enabledInternalIds(ws.doc, store), regionalPath);
  const legacy = all.some((e) => e.needsResync);
  const catalog = snapshotStatus();
  const catalogInfo = catalog.stores.find((c) => c.storeKey === store);
  const job = currentSyncJob();
  const tokenEnv = INK_STORES[store]?.tokenEnv ?? "INK_TOKEN_*";
  const hasToken = Boolean(tokenFor(store));
  const jobRunning = job.status === "running";
  const staleReason = collectionsStaleReason(store);
  const lastRun = owner ? await platform().syncs.last("collections") : null;
  const pending = await inspectPublishing();
  const reading = readPublished();
  const sandboxLive = process.env.SITE_CONFIG_DIR ? publishedFilePath() : null;

  const collectionsButton = (requests: string) =>
    owner && (
      <form action={syncCollectionsAction} className="mt-4">
        <button type="submit" className="a-btn ghost sm">Sincronizar coleções agora</button>
        <p className="a-muted mt-2 text-[0.8125rem]">Somente leitura na INK ({requests}). Se a INK falhar, os dados atuais são mantidos.{lastRun ? ` Última execução: ${lastRun.status === "succeeded" ? "ok" : lastRun.status === "running" ? "em andamento" : "falhou"} · ${new Date(lastRun.startedAt).toLocaleString("pt-BR")}.` : ""}</p>
      </form>
    );

  const regional = (
    <>
      <section id="sincronizar-loja" className="a-card scroll-mt-4 grid gap-6 p-5 lg:grid-cols-2" aria-label={`Loja INK de ${scopeName(scope)}`} data-testid="sync-store">
        <div className="text-[0.9375rem]">
          <p className="a-h2">Coleções da loja {STORE_NAME[store]}</p>
          {synced ? <CollectionsSummary synced={synced} all={all} staleReason={staleReason} /> : <p className="a-flash err mt-3">Ainda não há coleções sincronizadas para esta loja. Sincronize primeiro o catálogo (ao lado); as coleções são atualizadas ao final.</p>}
          {legacy && <p className="a-flash err mt-3">Este arquivo é de uma versão antiga e não guarda os produtos das coleções internas. Sincronize de novo.</p>}
          {lojaUnica ? <p className="a-muted mt-4 text-[0.8125rem]">O botão “Sincronizar coleções agora”, acima, atualiza também estas.</p> : collectionsButton("cerca de 4 requisições")}
        </div>
        <div className="text-[0.9375rem]" aria-label={`Catálogo de ${STORE_NAME[store]}`}>
          <p className="a-h2">Catálogo da loja {STORE_NAME[store]}</p>
          {catalogInfo && catalogInfo.productCount > 0 ? (
            <p className="mt-3">{numberPt.format(catalogInfo.productCount)} produtos · sincronizado em {new Date(catalogInfo.syncedAt).toLocaleString("pt-BR")}</p>
          ) : (
            <p className="a-flash err mt-3">O catálogo desta loja ainda não foi sincronizado. Sem ele não há como casar as coleções nem lançar a região.</p>
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
          {owner && (
            <form action={syncCatalogAction} className="mt-4">
              <input type="hidden" name="scope" value={scope} />
              <button type="submit" className="a-btn ghost sm" disabled={jobRunning || !hasToken}>Sincronizar catálogo de {STORE_NAME[store]}</button>
              <p className="a-muted mt-2 text-[0.8125rem]">Só leitura na INK. Leva alguns minutos (requisições espaçadas) e roda em segundo plano; ao terminar, as coleções desta loja também são atualizadas. Se falhar, os dados atuais são mantidos.</p>
            </form>
          )}
          {!owner && <p className="a-muted mt-4 text-[0.8125rem]">Só o owner sincroniza.</p>}
        </div>
        <p className="a-muted text-[0.8125rem] lg:col-span-2">Esta é a loja INK de {scopeName(scope)} (a região em edição). Para outra loja, troque a região no topo.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2" aria-label="Todas as lojas">
        <div className="a-card p-5">
          <p className="a-h2">Catálogo INK (snapshot local)</p>
          {catalog.present ? (
            <ul className="mt-3 space-y-1 text-[0.9375rem]">
              {catalog.stores.map((s) => (
                <li key={s.storeKey} className="flex justify-between gap-3"><span className="a-muted">{STORE_NAME[s.storeKey as CommerceStoreKey] ?? s.storeKey}</span><span className="font-bold">{numberPt.format(s.productCount)} produtos · {ago(s.syncedAt)}</span></li>
              ))}
            </ul>
          ) : (
            <p className="a-flash err mt-3">Sem snapshot do catálogo. Rode <code>npm run catalog:sync</code>.</p>
          )}
        </div>
        <div className="a-card p-5">
          <p className="a-h2">Coleções INK sincronizadas</p>
          {Object.keys(file.stores).length === 0 ? (
            <p className="a-flash err mt-3">Ainda não sincronizadas. Rode <code>npm run collections:sync</code> (só leitura, ~4 requisições).</p>
          ) : (
            <ul className="mt-3 space-y-1 text-[0.9375rem]">
              {(Object.keys(file.stores) as CommerceStoreKey[]).map((key) => {
                const rows = libraryEntries(key, key === store ? enabledInternalIds(ws.doc, key) : new Set(), regionalPath);
                const internal = rows.filter((e) => e.visibility === "internal");
                return (
                  <li key={key} className="flex justify-between gap-3"><span className="a-muted">{STORE_NAME[key] ?? key}</span><span className="text-right font-bold">{rows.filter((e) => e.visibility === "public" && e.selectable).length} públicas utilizáveis · {internal.filter((e) => e.eligible).length} internas elegíveis ({internal.filter((e) => e.enabled).length} habilitadas) · {rows.length} no total</span></li>
                );
              })}
            </ul>
          )}
          <p className="a-muted mt-3 text-[0.8125rem]">Elegível = pelo menos {MIN_USABLE_PRODUCTS} produtos publicados no catálogo local da mesma loja. O total bruto da INK inclui produtos ocultos. Internas precisam ser habilitadas em <Link href="/admin/colecoes" className="a-link">Coleções</Link>.</p>
        </div>
      </section>
    </>
  );

  // The single store, as the site serves it in single-store mode: its own catalog file and the served collections file.
  const lu = lojaUnica
    ? {
        catalog: snapshotStatus(snapshotPath(singleStoreDataDir())).stores.find((s) => s.storeKey === SINGLE_STORE_KEY),
        synced: getCollections().stores[SINGLE_STORE_KEY],
        all: libraryEntries(SINGLE_STORE_KEY, enabledInternalIds(ws.doc, SINGLE_STORE_KEY)),
        job: currentLojaUnicaJob(),
        hasToken: Boolean(tokenFor(SINGLE_STORE_KEY)),
        tokenEnv: INK_STORES[SINGLE_STORE_KEY]?.tokenEnv ?? "INK_TOKEN_*",
      }
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="a-h1">Sincronização</h1>
        <p className="a-muted mt-2 max-w-3xl">
          {lojaUnica ? (
            <>O site está em <strong>loja única</strong>: catálogo e coleções vêm todos da loja INK Use Origens. Sincronizar é sempre <strong>só leitura</strong> na INK; se falhar, os dados anteriores continuam valendo. Embaixo, o estado técnico da publicação.</>
          ) : (
            <>O que o painel e a loja leem da INK: o catálogo de produtos e as coleções de cada loja. Sincronizar é sempre <strong>só leitura</strong> na INK; se falhar, os dados anteriores continuam valendo. Embaixo, o estado técnico da publicação.</>
          )}
        </p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      {lu ? (
        <>
          <section id="sincronizar-loja-unica" className="a-card scroll-mt-4 grid gap-6 p-5 lg:grid-cols-2" aria-label="Loja única Use Origens" data-testid="sync-loja-unica">
            <div className="text-[0.9375rem]" aria-label="Catálogo da loja única">
              <p className="a-h2">Catálogo da loja única</p>
              {lu.catalog && lu.catalog.productCount > 0 ? (
                <p className="mt-3">{numberPt.format(lu.catalog.productCount)} produtos · sincronizado em <strong>{new Date(lu.catalog.syncedAt).toLocaleString("pt-BR")}</strong> ({ago(lu.catalog.syncedAt)})</p>
              ) : (
                <p className="a-flash err mt-3">A loja única ainda não tem catálogo sincronizado neste ambiente.</p>
              )}
              <p className="a-muted mt-2 text-[0.8125rem]">Atualiza sozinho todo dia às 03:30 (Brasília), junto com as peças.</p>
              {!lu.hasToken && <p className="a-flash err mt-2">A variável <code>{lu.tokenEnv}</code> não está configurada neste ambiente.</p>}
              {lu.job.status === "running" && <SyncProgress percent={lojaUnicaJobPercent(lu.job)} label={lu.job.totalPages ? `Lendo produtos: página ${lu.job.page} de ${lu.job.totalPages}` : "Começando a leitura dos produtos"} />}
              {lu.job.status === "succeeded" && (
                <p className="a-flash ok mt-3 text-[0.875rem]">
                  Concluída {ago(lu.job.finishedAt)}: {numberPt.format(lu.job.result.productCount)} produtos ({numberPt.format(lu.job.result.bindingCount)} estampas de cidade, {numberPt.format(lu.job.result.merchCount)} outros){lu.job.result.changed ? "" : ", sem mudança no catálogo"} · {lu.job.result.collections === null ? "coleções mantidas (leitura recusada)" : `${lu.job.result.collections} coleções`}.
                </p>
              )}
              {lu.job.status === "failed" && <p className="a-flash err mt-3 text-[0.875rem]">A última sincronização da loja única falhou: {lu.job.error}. Os dados anteriores foram mantidos.</p>}
              {owner ? (
                <form action={syncLojaUnicaAction} className="mt-4">
                  <button type="submit" className="a-btn ghost sm" disabled={lu.job.status === "running" || !lu.hasToken}>Sincronizar catálogo da loja única</button>
                  <p className="a-muted mt-2 text-[0.8125rem]">Só leitura na INK. Lê os produtos visíveis e as coleções; leva alguns minutos e roda em segundo plano. Nunca roda junto com o sync das 03:30.</p>
                </form>
              ) : <p className="a-muted mt-4 text-[0.8125rem]">Só o owner sincroniza.</p>}
            </div>
            <div className="text-[0.9375rem]">
              <p className="a-h2">Coleções da loja única</p>
              {lu.synced ? <CollectionsSummary synced={lu.synced} all={lu.all} /> : <p className="a-flash err mt-3">Ainda não há coleções da loja única. Sincronize o catálogo da loja única (ao lado); as coleções vêm junto.</p>}
              {collectionsButton("poucas requisições; atualiza também as lojas regionais")}
            </div>
          </section>

          <details className="a-card p-5" data-testid="sync-regional">
            <summary className="cursor-pointer font-bold">Lojas regionais (em loja única o site não usa estes dados)</summary>
            <div className="mt-4 space-y-6">{regional}</div>
          </details>
        </>
      ) : regional}

      <section className="a-card p-5" aria-label="Publicação">
        <p className="a-h2">{prod ? "Publicação" : "Sandbox de publicação"}</p>
        <ul className="mt-3 space-y-2 text-[0.9375rem]">
          <li className="flex flex-wrap items-center justify-between gap-3"><span>Consistência (registro × arquivo × cache)</span>{pending.length === 0 ? <span className="a-badge ok">Coerente</span> : <span className="a-badge warn">Pendente: {pending.join(", ")}</span>}</li>
          <li className="flex flex-wrap items-center justify-between gap-3"><span>Leitor da loja (esta máquina)</span>{reading.source === "published" ? <span className="a-badge ok">Lendo release {reading.bundle.releaseId}</span> : <span className="a-badge">Seed · {reading.reason}</span>}</li>
          <li className="flex flex-wrap items-center justify-between gap-3"><span>Loja lê o sandbox? (<code>SITE_CONFIG_HOME</code> + <code>SITE_CONFIG_DIR</code>)</span>{siteConfigHomeEnabled() && sandboxLive ? <span className="a-badge ok">Sim</span> : <span className="a-badge warn">Não neste processo</span>}</li>
        </ul>
        {reading.diagnostics.length > 0 && <p className="a-flash err mt-3 text-[0.875rem]">{reading.diagnostics.join(" · ")}</p>}
        {!(siteConfigHomeEnabled() && sandboxLive) && <p className="a-muted mt-3 text-[0.8125rem]">Para ver a publicação na loja local, inicie com <code>npm run cms:dev</code> (ele liga a flag e aponta a loja para o sandbox).</p>}
        <p className="a-muted mt-3 text-[0.8125rem]">Se a consistência ficar pendente, use “Reconciliar agora” em <Link href="/admin/publicar" className="a-link">Publicar</Link>.</p>
      </section>
    </div>
  );
}

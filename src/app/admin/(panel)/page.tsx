import Link from "next/link";
import { Flash } from "@/components/admin/Flash";
import { PreviewFrame } from "@/components/admin/PreviewFrame";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { platform } from "@/lib/admin/platform";
import { collectionProblems, readabilityProblems } from "@/lib/admin/validate-draft";
import { inspectPublishing, listHistory } from "@/lib/admin/ops";
import { loadWorkspace } from "@/lib/admin/workspace";
import { currentScope, REGION_SCOPES, scopeName, storeOf } from "@/lib/admin/scope";
import { effectiveTable, seedForEnv } from "@/lib/admin/publishing";
import { snapshotStatus } from "@/lib/catalog/snapshot-file";
import { getCollections } from "@/lib/catalog/collections-file";
import { libraryEntries, MIN_USABLE_PRODUCTS } from "@/lib/catalog/collection-source";
import { enabledInternalIds } from "@/lib/site-config/collections-enabled";
import { siteConfigHomeEnabled } from "@/lib/site-config/flag";
import { publishedFilePath, readPublished } from "@/lib/site-config/published";
import { numberPt } from "@/lib/format";

const STORE_NAME = { "use-sul": "Sul", "use-norte": "Norte", "use-centro": "Centro-Oeste" } as const;

const ago = (iso: string | null | undefined): string => {
  if (!iso) return "nunca";
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return `há ${min} min`;
  if (min < 60 * 48) return `há ${Math.round(min / 60)} h`;
  return `há ${Math.round(min / 1440)} dias`;
};

export default async function AdminOverview({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const actor = await requireAdmin();
  const scope = await currentScope(actor);
  const sp = await searchParams;
  const ws = await loadWorkspace(scope);
  const published = await platform().files.read();
  const effective = effectiveTable(published ?? seedForEnv());
  const history = await listHistory();
  const head = history.find((r) => r.status === "live");
  const catalog = snapshotStatus();
  const collections = getCollections();
  const sections = ws.doc.home?.sections ?? [];
  const problems = [...collectionProblems(ws.doc), ...readabilityProblems(ws.doc)];
  const pending = await inspectPublishing();
  const prod = platform().mode === "prod";
  const reading = readPublished();
  const custom = sections.filter((s) => s.id.startsWith("custom-")).length;
  const sandboxLive = process.env.SITE_CONFIG_DIR ? publishedFilePath() : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="a-h1">Visão geral</h1>
        <p className="a-muted mt-2 max-w-2xl">Home de {scopeName(scope)} (troque a região no topo). Tudo abaixo vem do estado real: rascunho, publicação, catálogo e coleções da INK sincronizados.</p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Resumo">
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

        <div className="a-card p-5">
          <p className="a-h2">Catálogo INK (snapshot local)</p>
          {catalog.present ? (
            <ul className="mt-3 space-y-1 text-[0.9375rem]">
              {catalog.stores.map((s) => (
                <li key={s.storeKey} className="flex justify-between gap-3"><span className="a-muted">{STORE_NAME[s.storeKey as keyof typeof STORE_NAME] ?? s.storeKey}</span><span className="font-bold">{numberPt.format(s.productCount)} produtos · {ago(s.syncedAt)}</span></li>
              ))}
            </ul>
          ) : (
            <p className="a-flash err mt-3">Sem snapshot do catálogo. Rode <code>npm run catalog:sync</code>.</p>
          )}
        </div>

        <div className="a-card p-5">
          <p className="a-h2">Coleções INK sincronizadas</p>
          {Object.keys(collections.stores).length === 0 ? (
            <p className="a-flash err mt-3">Ainda não sincronizadas. Rode <code>npm run collections:sync</code> (só leitura, ~4 requisições).</p>
          ) : (
            <ul className="mt-3 space-y-1 text-[0.9375rem]">
              {(Object.entries(collections.stores) as [keyof typeof STORE_NAME, unknown][]).map(([key]) => {
                const rows = libraryEntries(key, key === storeOf(scope) ? enabledInternalIds(ws.doc, key) : new Set());
                const publicUsable = rows.filter((e) => e.visibility === "public" && e.selectable).length;
                const internal = rows.filter((e) => e.visibility === "internal");
                const internalEligible = internal.filter((e) => e.eligible).length;
                const internalEnabled = internal.filter((e) => e.enabled).length;
                return (
                  <li key={key} className="flex justify-between gap-3"><span className="a-muted">{STORE_NAME[key] ?? key}</span><span className="text-right font-bold">{publicUsable} públicas utilizáveis · {internalEligible} internas elegíveis ({internalEnabled} habilitadas) · {rows.length} no total</span></li>
                );
              })}
            </ul>
          )}
          <p className="a-muted mt-3 text-[0.8125rem]">Elegível = pelo menos {MIN_USABLE_PRODUCTS} produtos publicados no catálogo local da mesma loja. O total bruto da INK inclui produtos ocultos. Internas precisam ser habilitadas na <Link href="/admin/colecoes" className="a-link">Biblioteca</Link>.</p>
        </div>
      </section>

      <section className="a-card overflow-x-auto" aria-label="Regiões e tracking efetivo">
        <table className="a-table a-stack">
          <caption className="a-h2 p-4 text-left">Regiões e tracking efetivo (o que está publicado)</caption>
          <thead><tr><th scope="col">Região</th><th scope="col">Estado</th><th scope="col">Meta Pixel</th><th scope="col">GA4</th></tr></thead>
          <tbody>
            {REGION_SCOPES.map((r) => {
              const meta = effective.find((x) => x.scope === r && x.tool === "meta")!;
              const ga = effective.find((x) => x.scope === r && x.tool === "ga4")!;
              const isLaunched = r === "sul" || published?.docs[r]?.launched === true;
              return (
                <tr key={r}>
                  <td data-label="Região" className="font-bold">{scopeName(r)}</td>
                  <td data-label="Estado">{isLaunched ? <span className="a-badge ok">Pública</span> : <span className="a-badge">Prévia</span>}</td>
                  <td data-label="Meta Pixel">{meta.id ? <code>{meta.id}</code> : <span className="a-muted">nenhum</span>} <span className="a-muted text-[0.8125rem]">({meta.origin})</span></td>
                  <td data-label="GA4">{ga.id ? <code>{ga.id}</code> : <span className="a-muted">nenhum</span>} <span className="a-muted text-[0.8125rem]">({ga.origin})</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="a-muted p-4 text-[0.8125rem]">Edite em <Link href="/admin/tracking" className="a-link">Tracking</Link>. “legacy” = os IDs de sempre do Sul, lidos da configuração do build até uma configuração explícita ser publicada.</p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2" aria-label="Ambiente">
        <div className="a-card p-5">
          <p className="a-h2">{prod ? "Publicação" : "Sandbox de publicação"}</p>
          <ul className="mt-3 space-y-2 text-[0.9375rem]">
            <li className="flex items-center justify-between gap-3"><span>Consistência (registro × arquivo × cache)</span>{pending.length === 0 ? <span className="a-badge ok">Coerente</span> : <span className="a-badge warn">Pendente: {pending.join(", ")}</span>}</li>
            <li className="flex items-center justify-between gap-3"><span>Leitor da loja (esta máquina)</span>{reading.source === "published" ? <span className="a-badge ok">Lendo release {reading.bundle.releaseId}</span> : <span className="a-badge">Seed · {reading.reason}</span>}</li>
            <li className="flex items-center justify-between gap-3"><span>Loja lê o sandbox? (<code>SITE_CONFIG_HOME</code> + <code>SITE_CONFIG_DIR</code>)</span>{siteConfigHomeEnabled() && sandboxLive ? <span className="a-badge ok">Sim</span> : <span className="a-badge warn">Não neste processo</span>}</li>
          </ul>
          {reading.diagnostics.length > 0 && <p className="a-flash err mt-3 text-[0.875rem]">{reading.diagnostics.join(" · ")}</p>}
          {!(siteConfigHomeEnabled() && sandboxLive) && <p className="a-muted mt-3 text-[0.8125rem]">Para ver a publicação na loja local, inicie com <code>npm run cms:dev</code> (ele liga a flag e aponta a loja para o sandbox).</p>}
        </div>
        <div className="a-card p-5">
          <p className="a-h2">Seções com problema</p>
          {problems.length === 0 ? <p className="a-muted mt-3">Nenhuma. Toda seção ativa tem fonte real e texto legível.</p> : <ul className="mt-3 list-disc space-y-1 pl-5 text-[0.9375rem]">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        </div>
      </section>

      <section className="a-card p-5" aria-label="Pré-visualização do rascunho">
        <PreviewFrame version={ws.record?.rev ?? 0} height={680} />
      </section>
    </div>
  );
}

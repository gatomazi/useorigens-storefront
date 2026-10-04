import Link from "next/link";
import { createCustomizerAction, duplicateCustomizerAction } from "@/app/admin/actions";
import { CollectionCombobox } from "@/components/admin/CollectionCombobox";
import { Flash } from "@/components/admin/Flash";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { toComboEntries } from "@/lib/admin/combo";
import { MODEL_STATE_LABEL, modelState, type ModelState } from "@/lib/admin/pages-view";
import { platform } from "@/lib/admin/platform";
import { currentScope, scopeName, storeOf } from "@/lib/admin/scope";
import { loadWorkspace } from "@/lib/admin/workspace";
import { libraryEntries } from "@/lib/catalog/collection-source";
import { findCollection } from "@/lib/catalog/collections-file";
import { enabledInternalIds } from "@/lib/site-config/collections-enabled";
import { customizerHref } from "@/lib/site-config/pages";
import { isUmaPencaSource } from "@/lib/site-config/schema";
import { ARTICLE_KIND_LABELS } from "@/lib/umapenca/types";
import { OriginSelect } from "@/components/admin/OriginSelect";

export default async function CustomizationScreen({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const actor = await requireAdmin();
  const scope = await currentScope(actor);
  const sp = await searchParams;
  const ws = await loadWorkspace(scope);
  const published = (await platform().files.read())?.docs[scope] ?? ws.baseDoc;
  const store = storeOf(scope);
  const entries = toComboEntries(libraryEntries(store, enabledInternalIds(ws.doc, store)));
  const models = ws.doc.customizers ?? [];
  const rev = ws.record?.rev ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="a-h1">Personalização <span className="a-muted">· {scopeName(scope)}</span></h1>
        <p className="mt-2 flex gap-2"><Link href="/admin/personalizacao" aria-current="page" className="a-btn sm">Modelos</Link><Link href="/admin/personalizacao/solicitacoes" className="a-btn sm ghost">Solicitações</Link></p>
        <p className="a-muted mt-3 max-w-3xl">Modelos são o que o cliente pode personalizar (linhas de texto, cidade, legenda…). Cada modelo é de uma coleção da INK desta região (camisetas) ou da Uma Penca (canecas e ecobags: o modelo aparece como “Crie a sua” em Outros artigos). <strong>Publicar a página de personalização abre o formulário de solicitação (com nome e contato do cliente) e cada envio cai na fila. Não há checkout: a equipe cria a estampa, fala com o cliente e o orienta a comprar na loja.</strong></p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <section className="a-card p-5" aria-labelledby="novo">
        <h2 id="novo" className="a-h2">Novo modelo</h2>
        <form action={createCustomizerAction} className="mt-3 grid gap-4 md:grid-cols-[2fr_1.5fr_3fr_1fr_auto] md:items-start">
          <input type="hidden" name="rev" value={rev ?? "null"} />
          <input type="hidden" name="scope" value={scope} />
          <div><label className="a-label" htmlFor="name">Nome</label><input id="name" name="name" className="a-input" maxLength={80} required placeholder="Pai Paranaense" /></div>
          <OriginSelect id="origin" name="origin" />
          <CollectionCombobox name="collection" label="Coleção da INK (só para camisetas)" entries={entries} libraryFrom="/admin/personalizacao" hint="Públicas e internas habilitadas. Ignorada quando a origem é a Uma Penca." />
          <div><label className="a-label" htmlFor="slug">Endereço (opcional)</label><input id="slug" name="slug" className="a-input" maxLength={60} placeholder="pai-paranaense" /></div>
          <button type="submit" className="a-btn md:mt-[1.65rem]">Criar rascunho</button>
        </form>
      </section>

      <section className="a-card overflow-x-auto" aria-label="Modelos">
        <table className="a-table a-stack">
          <caption className="sr-only">Modelos de personalização de {scopeName(scope)}</caption>
          <thead><tr><th scope="col">Modelo</th><th scope="col">Origem</th><th scope="col">Campos</th><th scope="col">Mockup</th><th scope="col">Estado</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>
            {models.length === 0 && <tr><td colSpan={6} className="a-muted">Nenhum modelo ainda.</td></tr>}
            {models.map((m) => {
              const live = published.customizers?.find((x) => x.id === m.id);
              const state: ModelState = modelState(m as never, live as never);
              const source = m.source;
              const collection = isUmaPencaSource(source) ? null : findCollection(source.store, source.collectionId);
              return (
                <tr key={m.id} data-testid={`model-row-${m.slug}`}>
                  <td data-label="Modelo"><p className="font-bold">{m.name}</p><p className="a-muted text-[0.8125rem]">{live && live.active ? <code>{customizerHref(scope, m)}</code> : "sem página pública"} · v{live?.version ?? m.version}</p></td>
                  <td data-label="Origem">{isUmaPencaSource(source) ? <>Uma Penca <span className="a-muted">· {ARTICLE_KIND_LABELS[source.articleKind].singular}</span></> : <>{collection?.name ?? "—"} <span className="a-muted">· INK #{source.collectionId}</span></>}</td>
                  <td data-label="Campos">{m.fields.length} campo(s){m.lineGroup ? ` + ${m.lineGroup.initial} a ${m.lineGroup.max} linhas` : ""}</td>
                  <td data-label="Mockup">{m.pageMockup ? <span className="a-badge ok">Enviado</span> : <span className="a-badge bad">Falta</span>}</td>
                  <td data-label="Estado"><span className={`a-badge ${state === "published" ? "ok" : state === "changed" ? "warn" : ""}`}>{MODEL_STATE_LABEL[state]}</span></td>
                  <td>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <Link href={`/admin/personalizacao/${m.id}`} className="a-btn sm">Editar</Link>
                      <form action={duplicateCustomizerAction}><input type="hidden" name="rev" value={rev ?? "null"} /><input type="hidden" name="scope" value={scope} /><input type="hidden" name="id" value={m.id} /><button type="submit" className="a-btn sm ghost" aria-label={`Duplicar ${m.name}`}>Duplicar</button></form>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

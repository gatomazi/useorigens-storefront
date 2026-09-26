import Link from "next/link";
import { notFound } from "next/navigation";
import { publishTargetAction, removeCustomizerAction, restoreTargetAction, saveCustomizerAction } from "@/app/admin/actions";
import { CollectionCombobox } from "@/components/admin/CollectionCombobox";
import { CustomFieldsEditor } from "@/components/admin/CustomFieldsEditor";
import { Flash } from "@/components/admin/Flash";
import { PreviewFrame } from "@/components/admin/PreviewFrame";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { toComboEntries } from "@/lib/admin/combo";
import { collectionProducts } from "@/lib/admin/customizer-view";
import { listMedia } from "@/lib/admin/media";
import { listHistory, preflightDoc } from "@/lib/admin/ops";
import { MODEL_STATE_LABEL, modelState } from "@/lib/admin/pages-view";
import { platform } from "@/lib/admin/platform";
import { currentScope, storeOf } from "@/lib/admin/scope";
import { loadWorkspace } from "@/lib/admin/workspace";
import { libraryEntries } from "@/lib/catalog/collection-source";
import { findCollection } from "@/lib/catalog/collections-file";
import { enabledInternalIds } from "@/lib/site-config/collections-enabled";
import { customizerHref } from "@/lib/site-config/pages";
import { MAX_CUSTOM_FIELDS } from "@/lib/site-config/schema";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "—");

export default async function CustomizerEditor({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const actor = await requireAdmin();
  const scope = await currentScope(actor);
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const ws = await loadWorkspace(scope);
  const model = ws.doc.customizers?.find((m) => m.id === id);
  if (!model) notFound();
  const published = (await platform().files.read())?.docs[scope] ?? ws.baseDoc;
  const live = published.customizers?.find((m) => m.id === id);
  const state = modelState(model as never, live as never);
  const rev = ws.record?.rev ?? null;
  const store = storeOf(scope);
  const entries = toComboEntries(libraryEntries(store, enabledInternalIds(ws.doc, store)));
  const media = await listMedia();
  const blockers = await preflightDoc(ws.doc, { kind: "customizer", id });
  const history = (await listHistory()).filter((r) => r.status === "live" && r.scopesChanged.includes(`customizer:${live?.slug ?? model.slug}`));
  const collection = findCollection(model.source.store, model.source.collectionId);
  const products = collectionProducts(model.source.store, model.source.collectionId);
  const g = model.lineGroup;
  const hidden = <><input type="hidden" name="rev" value={rev ?? "null"} /><input type="hidden" name="scope" value={scope} /></>;
  const currentRef = `${model.source.store}:${model.source.collectionId}`;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/personalizacao" className="a-link text-[0.875rem]">← Modelos</Link>
        <h1 className="a-h1 mt-2">{model.name}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-2">
          <span className={`a-badge ${state === "published" ? "ok" : state === "changed" ? "warn" : ""}`}>{MODEL_STATE_LABEL[state]}</span>
          {live?.active && <code>{customizerHref(scope, live)}</code>}
          <span className="a-muted">v{live?.version ?? model.version}</span>
        </p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,44rem)_1fr]">
        <section className="a-card p-5" aria-label="Editor do modelo">
          <form action={saveCustomizerAction} className="space-y-8">
            {hidden}
            <input type="hidden" name="id" value={model.id} />
            <fieldset className="space-y-4">
              <legend className="a-h2 mb-3">Identificação</legend>
              <div><label className="a-label" htmlFor="name">Nome</label><input id="name" name="name" defaultValue={model.name} className="a-input" maxLength={80} required /></div>
              <div>
                <label className="a-label" htmlFor="slug">Endereço</label>
                <input id="slug" name="slug" defaultValue={model.slug} className="a-input" maxLength={60} readOnly={Boolean(live)} />
                <p className="a-muted mt-1 text-[0.8125rem]">A página fica em <code>/{scope}/personalizar/{model.slug}</code>. {live ? "Já publicado: o endereço não muda." : "Trava depois da primeira publicação."}</p>
              </div>
              <div><label className="a-label" htmlFor="description">Descrição (aparece na página)</label><textarea id="description" name="description" defaultValue={model.description ?? ""} className="a-textarea" maxLength={300} /></div>
            </fieldset>

            <fieldset className="space-y-4">
              <legend className="a-h2 mb-3">Coleção e produto da INK</legend>
              <CollectionCombobox name="source_collection" label="Coleção da INK (desta loja)" entries={entries} defaultValue={currentRef} libraryFrom={`/admin/personalizacao/${model.id}`} hint="Pública, ou interna habilitada na Biblioteca. Isto não altera a coleção na INK." />
              {!collection && <p className="a-flash err">Esta coleção não existe no snapshot sincronizado.</p>}
              <div>
                <label className="a-label" htmlFor="ink_product_id">Produto exato de destino (opcional)</label>
                <select id="ink_product_id" name="ink_product_id" className="a-select" defaultValue={model.inkProductId ?? ""}>
                  <option value="">Nenhum: personalização sem checkout vinculado</option>
                  {products.items.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  {model.inkProductId && !products.items.some((p) => p.id === model.inkProductId) && <option value={model.inkProductId}>#{model.inkProductId} (fora da lista mostrada)</option>}
                </select>
                <p className="a-muted mt-1 text-[0.8125rem]">Só produtos desta coleção que existem no catálogo da mesma loja ({products.total}{products.total > products.items.length ? `; mostrando ${products.items.length}` : ""}). Nunca escolhemos um produto sozinhos. O produto vira só um link separado, com aviso de que a personalização <strong>não</strong> vai junto.</p>
              </div>
            </fieldset>

            <fieldset className="space-y-4">
              <legend className="a-h2 mb-3">Imagens</legend>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="a-label" htmlFor="mockup_image">Mockup da página (obrigatório para ativar)</label>
                  <select id="mockup_image" name="mockup_image" className="a-select" defaultValue={model.pageMockup?.assetId ?? ""}>
                    <option value="">Sem imagem</option>
                    {media.filter((m) => m.kind === "upload").map((m) => <option key={m.assetId} value={m.assetId}>{m.label} ({m.width}×{m.height})</option>)}
                    <optgroup label="Banners do projeto">{media.filter((m) => m.kind === "banner").map((m) => <option key={m.assetId} value={m.assetId}>{m.label}</option>)}</optgroup>
                  </select>
                  <label className="a-label mt-2" htmlFor="mockup_alt">Descrição do mockup (acessibilidade)</label>
                  <input id="mockup_alt" name="mockup_alt" defaultValue={model.pageMockup?.alt ?? ""} className="a-input" maxLength={200} placeholder={`Camiseta ${model.name}`} />
                </div>
                <div>
                  <label className="a-label" htmlFor="card_image">Imagem do card (opcional; usa o mockup se vazia)</label>
                  <select id="card_image" name="card_image" className="a-select" defaultValue={model.cardImage?.assetId ?? ""}>
                    <option value="">Usar o mockup da página</option>
                    {media.filter((m) => m.kind === "upload").map((m) => <option key={m.assetId} value={m.assetId}>{m.label} ({m.width}×{m.height})</option>)}
                  </select>
                  <label className="a-label mt-2" htmlFor="card_alt">Descrição da imagem do card</label>
                  <input id="card_alt" name="card_alt" defaultValue={model.cardImage?.alt ?? ""} className="a-input" maxLength={200} />
                </div>
              </div>
              <p className="a-muted text-[0.8125rem]">A imagem da camiseta enviada já tem texto impresso: a página mostra o <strong>mockup fixo + o resumo do que o cliente digitou</strong>. Nenhum texto é desenhado por cima da imagem, e o aviso “Imagem ilustrativa” fica visível. Envie novas imagens em Mídia.</p>
            </fieldset>

            <CustomFieldsEditor
              max={MAX_CUSTOM_FIELDS}
              initial={[...model.fields].sort((a, b) => a.position - b.position).map((f) => ({ key: f.key, label: f.label, placeholder: f.placeholder, helperText: f.helperText, required: f.required, maxLength: f.maxLength, defaultValue: f.defaultValue }))}
            />

            <fieldset className="space-y-4">
              <legend className="a-h2 mb-3">Grupo de linhas repetíveis</legend>
              <label className="flex items-center gap-2 font-bold"><input type="checkbox" name="lg_show" defaultChecked={Boolean(g)} /> O cliente escreve várias linhas (adiciona e remove dentro do intervalo)</label>
              <div className="grid gap-4 md:grid-cols-2">
                <div><label className="a-label" htmlFor="lg_label">Título do grupo</label><input id="lg_label" name="lg_label" defaultValue={g?.label ?? "Linhas da camiseta"} className="a-input" maxLength={60} /></div>
                <div><label className="a-label" htmlFor="lg_line_label">Rótulo de cada linha ({"{n}"} = número)</label><input id="lg_line_label" name="lg_line_label" defaultValue={g?.lineLabel ?? "Linha {n}"} className="a-input" maxLength={40} /></div>
                <div><label className="a-label" htmlFor="lg_min">Mínimo de linhas</label><input id="lg_min" name="lg_min" type="number" min={0} max={10} defaultValue={g?.min ?? 1} className="a-input" /></div>
                <div><label className="a-label" htmlFor="lg_initial">Linhas mostradas no início</label><input id="lg_initial" name="lg_initial" type="number" min={0} max={10} defaultValue={g?.initial ?? 4} className="a-input" /></div>
                <div><label className="a-label" htmlFor="lg_max">Máximo de linhas</label><input id="lg_max" name="lg_max" type="number" min={1} max={10} defaultValue={g?.max ?? 6} className="a-input" /></div>
                <div><label className="a-label" htmlFor="lg_maxlength">Máximo de caracteres por linha</label><input id="lg_maxlength" name="lg_maxlength" type="number" min={1} max={200} defaultValue={g?.maxLength ?? 18} className="a-input" /></div>
                <div><label className="a-label" htmlFor="lg_placeholder">Exemplo (placeholder)</label><input id="lg_placeholder" name="lg_placeholder" defaultValue={g?.placeholder ?? ""} className="a-input" maxLength={80} /></div>
                <div><label className="a-label" htmlFor="lg_helper">Ajuda (opcional)</label><input id="lg_helper" name="lg_helper" defaultValue={g?.helperText ?? ""} className="a-input" maxLength={200} /></div>
              </div>
              <div><label className="a-label" htmlFor="lg_defaults">Valores iniciais das linhas (um por linha, opcional)</label><textarea id="lg_defaults" name="lg_defaults" defaultValue={(g?.defaults ?? []).join("\n")} className="a-textarea" rows={4} /></div>
              <p className="a-muted text-[0.8125rem]">O limite de caracteres não garante que o texto caiba na estampa: a validação de largura tipográfica fica para a etapa da arte final.</p>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="a-h2 mb-3">Estado</legend>
              <label className="flex items-center gap-2 font-bold"><input type="checkbox" name="active" defaultChecked={model.active} /> Modelo ativo (página de personalização disponível quando publicado)</label>
              <p className="a-muted text-[0.8125rem]">Ativar exige o mockup. Desativar e publicar tira a página do ar; as solicitações já feitas continuam com os dados originais.</p>
            </fieldset>

            <div className="flex flex-wrap items-center gap-3 border-t border-black/15 pt-5"><button type="submit" className="a-btn">Salvar rascunho</button><span className="a-muted text-[0.875rem]">Salvar atualiza a prévia. Nada vai para a loja até publicar.</span></div>
          </form>
        </section>

        <div className="space-y-6">
          <section className="a-card p-5" aria-label="Pré-visualização"><PreviewFrame version={ws.record?.rev ?? 0} customizer={model.id} height={760} /></section>
          <section className="a-card p-5" aria-labelledby="publicar-modelo">
            <h2 id="publicar-modelo" className="a-h2">Publicar este modelo</h2>
            <p className="a-muted mt-1 text-[0.875rem]">Publica só este modelo. É a <strong>página de solicitação</strong>: não é “checkout automático” e não envia nada à INK.</p>
            {blockers.length > 0 && <div className="a-flash err mt-3"><p className="font-extrabold">Ainda não dá para publicar:</p><ul className="mt-1 list-disc pl-5">{blockers.map((b) => <li key={b}>{b}</li>)}</ul></div>}
            <form action={publishTargetAction} className="mt-3 flex flex-wrap items-end gap-3">
              {hidden}<input type="hidden" name="target" value="customizer" /><input type="hidden" name="id" value={model.id} />
              <div className="grow"><label className="a-label" htmlFor="note">Nota (opcional)</label><input id="note" name="note" className="a-input" maxLength={200} /></div>
              <button type="submit" className="a-btn" disabled={blockers.length > 0 || state === "published"}>{platform().mode === "prod" ? "Publicar página de personalização" : "Publicar página no sandbox local"}</button>
            </form>
            {!live && <form action={removeCustomizerAction} className="mt-3">{hidden}<input type="hidden" name="id" value={model.id} /><button type="submit" className="a-btn danger">Apagar rascunho</button></form>}
            {history.length > 0 && (
              <div className="mt-5 overflow-x-auto">
                <table className="a-table a-stack">
                  <caption className="a-h2 text-left">Versões deste modelo</caption>
                  <thead><tr><th scope="col">Release</th><th scope="col">Quando</th><th scope="col"><span className="sr-only">Ação</span></th></tr></thead>
                  <tbody>{history.slice(0, 10).map((r) => (
                    <tr key={r.id}><td data-label="Release" className="font-bold">#{r.id}</td><td data-label="Quando">{when(r.promotedAt ?? null)}</td><td>{r.id === history[0].id ? <span className="a-badge ok">No ar</span> : <form action={restoreTargetAction}>{hidden}<input type="hidden" name="target" value="customizer" /><input type="hidden" name="id" value={model.id} /><input type="hidden" name="release" value={r.id} /><button type="submit" className="a-btn sm ghost">Restaurar esta versão</button></form>}</td></tr>
                  ))}</tbody>
                </table>
                <p className="a-muted mt-2 text-[0.8125rem]">Restaurar um modelo não altera solicitações já feitas: cada uma guarda os rótulos e a versão do momento do envio.</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

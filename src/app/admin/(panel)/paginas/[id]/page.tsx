import Link from "next/link";
import { notFound } from "next/navigation";
import { addCollectionSection, addStructuredSection, archivePageAction, duplicateSection, moveSection, publishTargetAction, removePageAction, removeSection, restoreTargetAction, setSectionActive, updatePageAction } from "@/app/admin/actions";
import { CollectionCombobox } from "@/components/admin/CollectionCombobox";
import { Flash } from "@/components/admin/Flash";
import { PreviewFrame } from "@/components/admin/PreviewFrame";
import { RowForm } from "@/components/admin/RowForm";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { toComboEntries } from "@/lib/admin/combo";
import { listMedia } from "@/lib/admin/media";
import { listHistory, preflightDoc } from "@/lib/admin/ops";
import { PAGE_STATE_LABEL, pageState } from "@/lib/admin/pages-view";
import { platform } from "@/lib/admin/platform";
import { currentScope, scopeName, storeOf } from "@/lib/admin/scope";
import { collectionProblems, sectionReadability, sourceStatus } from "@/lib/admin/validate-draft";
import { loadWorkspace } from "@/lib/admin/workspace";
import { libraryEntries } from "@/lib/catalog/collection-source";
import { enabledInternalIds } from "@/lib/site-config/collections-enabled";
import { PAGE_KIND_LABEL, pageAsHomeDoc, pageHref } from "@/lib/site-config/pages";
import { STRUCTURED_MODELS } from "@/lib/site-config/structured";

const TYPE_LABEL: Record<string, string> = { "page-hero": "Topo da página", "city-styles": "Estilos da cidade", "product-carousel": "Carrossel de produtos", states: "Estados", campaign: "Campanha" };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "—");

export default async function PageEditor({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const actor = await requireAdmin();
  const scope = await currentScope(actor);
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const ws = await loadWorkspace(scope);
  const page = ws.doc.pages?.find((p) => p.id === id);
  if (!page) notFound();
  const published = (await platform().files.read())?.docs[scope] ?? ws.baseDoc;
  const live = published.pages?.find((p) => p.id === id);
  const state = pageState(page, live);
  const rev = ws.record?.rev ?? null;
  const store = storeOf(scope);
  const entries = toComboEntries(libraryEntries(store, enabledInternalIds(ws.doc, store)));
  const media = await listMedia();
  const asHome = pageAsHomeDoc(ws.doc, page);
  const blockers = await preflightDoc(ws.doc, { kind: "page", id });
  const history = (await listHistory()).filter((r) => r.status === "live" && r.scopesChanged.includes(`page:${page.kind}/${live?.slug ?? page.slug}`));
  const owner = actor.role === "owner";
  const problems = collectionProblems(asHome);
  const hidden = (
    <>
      <input type="hidden" name="rev" value={rev ?? "null"} />
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="page" value={page.id} />
    </>
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/paginas" className="a-link text-[0.875rem]">← Páginas</Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="a-h1">{page.title}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-2">
              <span className="a-badge">{PAGE_KIND_LABEL[page.kind]}</span>
              <span className={`a-badge ${state === "published" ? "ok" : state === "changed" ? "warn" : ""}`}>{PAGE_STATE_LABEL[state]}</span>
              <code>{pageHref(scope, page)}</code>
              {live && !live.archived && <span className="a-muted">v{live.version} no ar</span>}
            </p>
          </div>
        </div>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      {problems.length > 0 && <div className="a-flash err"><p className="font-extrabold">Estas seções não aparecerão até serem corrigidas:</p><ul className="mt-1 list-disc pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul></div>}

      <section className="a-card p-5" aria-labelledby="identidade">
        <h2 id="identidade" className="a-h2">Identidade e SEO</h2>
        <form action={updatePageAction} className="mt-3 grid gap-4 md:grid-cols-2">
          {hidden}
          <input type="hidden" name="id" value={page.id} />
          <div><label className="a-label" htmlFor="title">Título (nome editorial)</label><input id="title" name="title" defaultValue={page.title} className="a-input" maxLength={120} required /></div>
          <div>
            <label className="a-label" htmlFor="slug">Endereço</label>
            <input id="slug" name="slug" defaultValue={page.slug} className="a-input" maxLength={60} readOnly={Boolean(live)} aria-describedby="slug-help" />
            <p id="slug-help" className="a-muted mt-1 text-[0.8125rem]">{live ? "Já é público: o endereço não muda. Para outro endereço, duplique a página." : "Letras minúsculas, números e hífens. Trava depois da primeira publicação."}</p>
          </div>
          <div><label className="a-label" htmlFor="seo_title">Título para buscadores (opcional, até 70)</label><input id="seo_title" name="seo_title" defaultValue={page.seo.title ?? ""} className="a-input" maxLength={70} /></div>
          <div><label className="a-label" htmlFor="seo_description">Descrição para buscadores (opcional, até 200)</label><input id="seo_description" name="seo_description" defaultValue={page.seo.description ?? ""} className="a-input" maxLength={200} /></div>
          <div>
            <label className="a-label" htmlFor="seo_og">Imagem de compartilhamento (opcional)</label>
            <select id="seo_og" name="seo_og" className="a-select" defaultValue={page.seo.ogImage?.assetId ?? ""}>
              <option value="">Sem imagem</option>
              {media.filter((m) => m.kind === "upload").map((m) => <option key={m.assetId} value={m.assetId}>{m.label} ({m.width}×{m.height})</option>)}
              <optgroup label="Banners do projeto">{media.filter((m) => m.kind === "banner").map((m) => <option key={m.assetId} value={m.assetId}>{m.label}</option>)}</optgroup>
            </select>
          </div>
          <div><label className="a-label" htmlFor="seo_og_alt">Descrição da imagem (opcional)</label><input id="seo_og_alt" name="seo_og_alt" defaultValue={page.seo.ogImage?.alt ?? ""} className="a-input" maxLength={200} /></div>
          <div className="md:col-span-2">
            <label className="flex items-center gap-2 font-bold"><input type="checkbox" name="indexable" defaultChecked={page.seo.indexable} disabled={!owner} /> Permitir que buscadores indexem esta página</label>
            <p className="a-muted mt-1 text-[0.8125rem]">Sem isto a página publicada usa <code>noindex</code>. A prévia e os rascunhos são sempre <code>noindex</code>. Só o owner liga; a página só é acessível em regiões lançadas.</p>
          </div>
          <div className="md:col-span-2"><button type="submit" className="a-btn">Salvar rascunho</button></div>
        </form>
      </section>

      <section className="a-card overflow-x-auto" aria-label="Seções da página">
        <table className="a-table">
          <caption className="sr-only">Seções da página, em ordem</caption>
          <thead><tr><th scope="col">#</th><th scope="col">Seção</th><th scope="col">Fonte dos produtos</th><th scope="col">Estado</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>
            {page.sections.map((s, i) => {
              const status = sourceStatus(s, ws.doc);
              const locked = s.template === "page-hero";
              const custom = s.id.startsWith("custom-") && !locked;
              const readable = sectionReadability(s);
              const label = s.title?.replace(/\n/g, " ") ?? s.anchor;
              return (
                <tr key={s.id} className={s.active ? "" : "opacity-60"}>
                  <td className="a-muted w-8 font-bold">{i + 1}</td>
                  <td>
                    <p className="font-bold">{label}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[0.8125rem]">
                      <span className="a-badge">{TYPE_LABEL[s.template] ?? s.template}</span>
                      {s.customizerCard && <span className="a-badge ok">1º card personalizável</span>}
                      {readable.some((r) => r.level === "blocking") && <span className="a-badge bad">Texto ilegível</span>}
                    </p>
                  </td>
                  <td>{status ? (status.problem ? <span className="a-badge bad">{status.problem}</span> : <span className="a-muted">{status.label} · {status.products} produto(s)</span>) : <span className="a-muted">—</span>}</td>
                  <td>{locked ? <span className="a-badge">Fixa</span> : s.active ? <span className="a-badge ok">Ativa</span> : <span className="a-badge">Oculta</span>}</td>
                  <td>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {!locked && (
                        <>
                          <RowForm action={moveSection} rev={rev} scope={scope} id={s.id} page={page.id} extra={{ direction: "up" }} label={`Mover “${label}” para cima`}>↑</RowForm>
                          <RowForm action={moveSection} rev={rev} scope={scope} id={s.id} page={page.id} extra={{ direction: "down" }} label={`Mover “${label}” para baixo`}>↓</RowForm>
                          <RowForm action={setSectionActive} rev={rev} scope={scope} id={s.id} page={page.id} extra={{ active: String(!s.active) }} label={s.active ? `Ocultar “${label}”` : `Ativar “${label}”`}>{s.active ? "Ocultar" : "Ativar"}</RowForm>
                        </>
                      )}
                      <Link href={`/admin/paginas/${page.id}/secoes/${s.id}`} className="a-btn sm">Editar</Link>
                      {s.template === "product-carousel" && <RowForm action={duplicateSection} rev={rev} scope={scope} id={s.id} page={page.id} label={`Duplicar “${label}”`}>Duplicar</RowForm>}
                      {custom && <RowForm action={removeSection} rev={rev} scope={scope} id={s.id} page={page.id} label={`Remover “${label}”`} danger>Remover</RowForm>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="a-card p-5" aria-labelledby="add">
        <h2 id="add" className="a-h2">Adicionar seção</h2>
        <h3 className="mt-4 font-extrabold">Produtos: a partir de uma coleção da INK ({scopeName(scope)})</h3>
        <form action={addCollectionSection} className="mt-3 grid gap-4 md:grid-cols-[3fr_2fr_1fr_auto] md:items-start">
          {hidden}
          <CollectionCombobox name="collection" label="Coleção (busque pelo nome)" entries={entries} libraryFrom={`/admin/paginas/${page.id}`} hint="Coleções públicas e as internas habilitadas na Biblioteca." />
          <div><label className="a-label" htmlFor="ctitle">Título (opcional)</label><input id="ctitle" name="title" className="a-input" maxLength={120} placeholder="Usa o nome da coleção" /></div>
          <div><label className="a-label" htmlFor="climit">Cards</label><input id="climit" name="limit" type="number" min={3} max={24} defaultValue={6} className="a-input" /></div>
          <button type="submit" className="a-btn md:mt-[1.65rem]">Criar seção</button>
        </form>
        <p className="a-muted mt-2 text-[0.8125rem]">Cada seção usa uma coleção diferente: é assim que uma categoria-pai organiza subtemas. O total de cards é o número acima; a ordem dos produtos é a da INK (não é “mais vendidos”). O botão “Ver todos” só existe quando a coleção tem página pública verificada.</p>
        <h3 className="mt-6 font-extrabold">Componentes</h3>
        <div className="mt-3 flex flex-wrap gap-3">
          {STRUCTURED_MODELS.map((m) => (
            <form key={m.template} action={addStructuredSection}>
              {hidden}<input type="hidden" name="template" value={m.template} />
              <button type="submit" className="a-btn ghost" aria-label={`Adicionar ${m.name}`}>Adicionar {m.name}</button>
            </form>
          ))}
        </div>
      </section>

      <section className="a-card p-5" aria-labelledby="publicar">
        <h2 id="publicar" className="a-h2">Publicar esta página</h2>
        <p className="a-muted mt-1 max-w-3xl text-[0.875rem]">Publica só esta página (e as habilitações de coleções interna que ela usa). A home, as outras páginas, o tracking e o catálogo não mudam. Publicar não liga o checkout automático de personalização: isso é outro passo, fora do CMS.</p>
        {blockers.length > 0 && <div className="a-flash err mt-3"><p className="font-extrabold">Ainda não dá para publicar:</p><ul className="mt-1 list-disc pl-5">{blockers.map((b) => <li key={b}>{b}</li>)}</ul></div>}
        <form action={publishTargetAction} className="mt-3 flex flex-wrap items-end gap-3">
          {hidden}<input type="hidden" name="target" value="page" /><input type="hidden" name="id" value={page.id} />
          <div className="grow"><label className="a-label" htmlFor="note">Nota (opcional)</label><input id="note" name="note" className="a-input" maxLength={200} /></div>
          <button type="submit" className="a-btn" disabled={blockers.length > 0 || state === "published"}>{platform().mode === "prod" ? "Publicar página" : "Publicar página no sandbox local"}</button>
        </form>
        <div className="mt-3 flex flex-wrap gap-3">
          {(live || page.archived) && (
            <form action={archivePageAction}>{hidden}<input type="hidden" name="id" value={page.id} /><input type="hidden" name="archive" value={state === "archived" ? "false" : "true"} /><button type="submit" className="a-btn ghost">{state === "archived" ? "Reativar página" : "Arquivar (sai do ar)"}</button></form>
          )}
          {!live && <form action={removePageAction}>{hidden}<input type="hidden" name="id" value={page.id} /><button type="submit" className="a-btn danger">Apagar rascunho</button></form>}
        </div>
        {history.length > 0 && (
          <div className="mt-5 overflow-x-auto">
            <table className="a-table a-stack">
              <caption className="a-h2 text-left">Versões desta página</caption>
              <thead><tr><th scope="col">Release</th><th scope="col">Quando</th><th scope="col">Nota</th><th scope="col"><span className="sr-only">Ação</span></th></tr></thead>
              <tbody>
                {history.slice(0, 10).map((r) => (
                  <tr key={r.id}>
                    <td data-label="Release" className="font-bold">#{r.id}</td>
                    <td data-label="Quando">{when(r.promotedAt ?? null)}</td>
                    <td data-label="Nota" className="a-muted">{r.note ?? "—"}</td>
                    <td>{r.id === history[0].id ? <span className="a-badge ok">No ar</span> : <form action={restoreTargetAction}>{hidden}<input type="hidden" name="target" value="page" /><input type="hidden" name="id" value={page.id} /><input type="hidden" name="release" value={r.id} /><button type="submit" className="a-btn sm ghost" aria-label={`Restaurar a versão ${r.id} desta página`}>Restaurar esta versão</button></form>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="a-muted mt-2 text-[0.8125rem]">Restaurar cria uma nova release só com esta página; a home e o resto ficam como estão.</p>
          </div>
        )}
      </section>

      <section className="a-card p-5" aria-label="Pré-visualização do rascunho"><PreviewFrame version={ws.record?.rev ?? 0} page={page.id} height={700} /></section>
    </div>
  );
}

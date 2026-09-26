import Link from "next/link";
import { archivePageAction, createPageAction, duplicatePageAction } from "@/app/admin/actions";
import { Flash } from "@/components/admin/Flash";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { listHistory } from "@/lib/admin/ops";
import { PAGE_STATE_LABEL, pageRows, type PageState } from "@/lib/admin/pages-view";
import { currentScope, scopeName } from "@/lib/admin/scope";
import { loadWorkspace } from "@/lib/admin/workspace";
import { platform } from "@/lib/admin/platform";
import { PAGE_KIND_LABEL } from "@/lib/site-config/pages";
import type { PageKind } from "@/lib/site-config/schema";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "—");

export default async function PagesScreen({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; tipo?: string; estado?: string; q?: string }> }) {
  const actor = await requireAdmin();
  const scope = await currentScope(actor);
  const sp = await searchParams;
  const ws = await loadWorkspace(scope);
  const published = (await platform().files.read())?.docs[scope] ?? ws.baseDoc;
  const rows = pageRows(ws.doc, published, await listHistory());
  const tipo = sp.tipo === "hotpage" || sp.tipo === "categoryLanding" ? (sp.tipo as PageKind) : null;
  const estado = ["draft", "published", "changed", "archived"].includes(sp.estado ?? "") ? (sp.estado as PageState) : null;
  const q = (sp.q ?? "").trim().toLowerCase().slice(0, 80);
  const shown = rows.filter((r) => (!tipo || r.page.kind === tipo) && (!estado || r.state === estado) && (!q || `${r.page.title} ${r.page.slug}`.toLowerCase().includes(q)));
  const rev = ws.record?.rev ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="a-h1">Páginas <span className="a-muted">· {scopeName(scope)}</span></h1>
        <p className="a-muted mt-2 max-w-3xl">Hotpages (editoriais, como “Dia dos Pais”) e categorias-pai (páginas temáticas que organizam subcoleções). As duas usam as mesmas seções da home. Cada página é publicada sozinha: publicar uma página nunca mexe na home nem em outra página, e criar uma página não a torna pública.</p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <section className="a-card p-5" aria-labelledby="nova-pagina">
        <h2 id="nova-pagina" className="a-h2">Nova página</h2>
        <form action={createPageAction} className="mt-3 grid gap-4 md:grid-cols-[1fr_2fr_1fr_auto] md:items-end">
          <input type="hidden" name="rev" value={rev ?? "null"} />
          <input type="hidden" name="scope" value={scope} />
          <div><label className="a-label" htmlFor="kind">Tipo</label><select id="kind" name="kind" className="a-select"><option value="hotpage">Hotpage (editorial / campanha)</option><option value="categoryLanding">Categoria-pai (temas e subcoleções)</option></select></div>
          <div><label className="a-label" htmlFor="title">Título</label><input id="title" name="title" className="a-input" maxLength={120} required placeholder="Ex.: Dia dos Pais" /></div>
          <div><label className="a-label" htmlFor="slug">Endereço (opcional)</label><input id="slug" name="slug" className="a-input" maxLength={60} placeholder="dia-dos-pais" /></div>
          <button type="submit" className="a-btn">Criar rascunho</button>
        </form>
        <p className="a-muted mt-3 text-[0.8125rem]">Endereços públicos: <code>/{scope}/h/&lt;endereço&gt;</code> (hotpage) e <code>/{scope}/colecoes/&lt;endereço&gt;</code> (categoria-pai). O endereço não muda depois de publicado.</p>
      </section>

      <form method="get" className="a-card flex flex-wrap items-end gap-4 p-5" aria-label="Filtros">
        <div><label className="a-label" htmlFor="f-tipo">Tipo</label><select id="f-tipo" name="tipo" className="a-select" defaultValue={tipo ?? ""}><option value="">Todos</option><option value="hotpage">Hotpages</option><option value="categoryLanding">Categorias-pai</option></select></div>
        <div><label className="a-label" htmlFor="f-estado">Estado</label><select id="f-estado" name="estado" className="a-select" defaultValue={estado ?? ""}><option value="">Todos</option>{(Object.keys(PAGE_STATE_LABEL) as PageState[]).map((k) => <option key={k} value={k}>{PAGE_STATE_LABEL[k]}</option>)}</select></div>
        <div className="grow"><label className="a-label" htmlFor="f-q">Buscar</label><input id="f-q" name="q" defaultValue={sp.q ?? ""} className="a-input" placeholder="título ou endereço" /></div>
        <button type="submit" className="a-btn ghost">Filtrar</button>
      </form>

      <section className="a-card overflow-x-auto" aria-label="Páginas">
        <table className="a-table a-stack">
          <caption className="sr-only">Páginas de {scopeName(scope)}</caption>
          <thead><tr><th scope="col">Título</th><th scope="col">Tipo</th><th scope="col">Endereço</th><th scope="col">Versão</th><th scope="col">Última publicação</th><th scope="col">Estado</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={7} className="a-muted">Nenhuma página {rows.length === 0 ? "ainda" : "com esses filtros"}.</td></tr>}
            {shown.map(({ page, state, href, kindLabel, live, lastPublishedAt }) => (
              <tr key={page.id} data-testid={`page-row-${page.slug}`}>
                <td data-label="Título" className="font-bold">{page.title}</td>
                <td data-label="Tipo">{kindLabel}</td>
                <td data-label="Endereço"><code>{href}</code></td>
                <td data-label="Versão">{live ? `v${live.version}` : "—"}</td>
                <td data-label="Última publicação" className="a-muted">{when(lastPublishedAt)}</td>
                <td data-label="Estado"><span className={`a-badge ${state === "published" ? "ok" : state === "changed" ? "warn" : ""}`}>{PAGE_STATE_LABEL[state]}</span></td>
                <td>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <Link href={`/admin/paginas/${page.id}`} className="a-btn sm">Editar</Link>
                    <form action={duplicatePageAction}><input type="hidden" name="rev" value={rev ?? "null"} /><input type="hidden" name="scope" value={scope} /><input type="hidden" name="id" value={page.id} /><button type="submit" className="a-btn sm ghost" aria-label={`Duplicar ${page.title}`}>Duplicar</button></form>
                    {(live || page.archived) && (
                      <form action={archivePageAction}><input type="hidden" name="rev" value={rev ?? "null"} /><input type="hidden" name="scope" value={scope} /><input type="hidden" name="id" value={page.id} /><input type="hidden" name="archive" value={state === "archived" ? "false" : "true"} /><button type="submit" className="a-btn sm ghost" aria-label={`${state === "archived" ? "Reativar" : "Arquivar"} ${page.title}`}>{state === "archived" ? "Reativar" : "Arquivar"}</button></form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="a-muted text-[0.8125rem]">{PAGE_KIND_LABEL.hotpage}s e {PAGE_KIND_LABEL.categoryLanding.toLowerCase()}s de regiões ainda não lançadas continuam em 404 na loja; você as vê aqui e na prévia.</p>
    </div>
  );
}

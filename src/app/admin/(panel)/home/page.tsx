import Link from "next/link";
import { addCollectionSection, addStructuredSection, duplicateSection, initRegionHomeAction, moveSection, removeSection, setSectionActive } from "@/app/admin/actions";
import { StructuredModelCard } from "@/components/admin/StructuredModelCard";
import { campaignStatus, cityStylesStatus, statesStatus } from "@/lib/admin/structured-status";
import { SINGLETON_TEMPLATES, STRUCTURED_MODELS } from "@/lib/site-config/structured";
import { Flash } from "@/components/admin/Flash";
import { PreviewFrame } from "@/components/admin/PreviewFrame";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { collectionProblems, sectionReadability, sourceStatus } from "@/lib/admin/validate-draft";
import { loadWorkspace } from "@/lib/admin/workspace";
import { currentScope, scopeName, storeOf } from "@/lib/admin/scope";
import { CollectionCombobox } from "@/components/admin/CollectionCombobox";
import { toComboEntries } from "@/lib/admin/combo";
import { libraryEntries } from "@/lib/catalog/collection-source";
import { enabledInternalIds } from "@/lib/site-config/collections-enabled";
import type { Section } from "@/lib/site-config/schema";

const TYPE_LABEL: Record<string, string> = { hero: "Hero", "city-styles": "Estilos da cidade", "product-carousel": "Carrossel de produtos", states: "Estados", campaign: "Campanha", footer: "Rodapé" };

function RowForm({ action, rev, scope, id, extra, children, danger = false, label }: { action: (fd: FormData) => Promise<void>; rev: number | null; scope: string; id: string; extra?: Record<string, string>; children: React.ReactNode; danger?: boolean; label: string }) {
  return (
    <form action={action}>
      <input type="hidden" name="rev" value={rev ?? "null"} />
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="id" value={id} />
      {Object.entries(extra ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <button type="submit" aria-label={label} title={label} className={`a-btn sm ${danger ? "danger" : "ghost"}`}>{children}</button>
    </form>
  );
}

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const actor = await requireAdmin();
  const scope = await currentScope(actor);
  const store = storeOf(scope);
  const sp = await searchParams;
  const ws = await loadWorkspace(scope);
  const rev = ws.record?.rev ?? null;
  const sections = ws.doc.home?.sections ?? [];
  const entries = toComboEntries(libraryEntries(store, enabledInternalIds(ws.doc, store)));
  const anySelectable = entries.some((e) => e.selectable);
  const problems = collectionProblems(ws.doc);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="a-h1">Home · Seções <span className="a-muted">· {scopeName(scope)}</span></h1>
          <p className="a-muted mt-2 max-w-2xl">A ordem abaixo é a ordem da home. O hero fica sempre no topo e o rodapé no fim. As seções originais podem ser editadas, movidas e ocultadas; só as criadas aqui podem ser removidas.</p>
        </div>
        <div className="flex items-center gap-2">
          {ws.dirty ? <span className="a-badge warn">Alterações não publicadas</span> : <span className="a-badge ok">Igual ao publicado</span>}
          <Link href="/admin/publicar" className="a-btn">Publicar</Link>
        </div>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      {problems.length > 0 && (
        <div className="a-flash err">
          <p className="font-extrabold">Estas seções não aparecerão na loja até serem corrigidas:</p>
          <ul className="mt-1 list-disc pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}

      {!ws.doc.home && (
        <section className="a-card p-5" aria-labelledby="criar-home">
          <h2 id="criar-home" className="a-h2">Esta região ainda não tem home</h2>
          <p className="a-muted mt-2 max-w-2xl">A home inicial é montada só com o que existe de verdade na loja da INK de {scopeName(scope)}: um topo, o seletor de estados (se houver páginas de estado reais) e até 3 carrosséis das coleções <strong>públicas</strong> com produtos suficientes no catálogo. Nada é copiado do Sul. Tudo pode ser editado, reordenado, ocultado ou removido depois.</p>
          <form action={initRegionHomeAction} className="mt-4">
            <input type="hidden" name="rev" value={rev ?? "null"} />
            <input type="hidden" name="scope" value={scope} />
            <button type="submit" className="a-btn">Criar home inicial</button>
          </form>
        </section>
      )}

      {ws.doc.home && (
      <div className="a-card overflow-x-auto">
        <table className="a-table">
          <caption className="sr-only">Seções da home de {scopeName(scope)}, em ordem</caption>
          <thead>
            <tr><th scope="col">#</th><th scope="col">Seção</th><th scope="col">Fonte dos produtos</th><th scope="col">Estado</th><th scope="col"><span className="sr-only">Ações</span></th></tr>
          </thead>
          <tbody>
            {sections.map((s: Section, i) => {
              const status = sourceStatus(s, ws.doc);
              const locked = s.template === "hero" || s.template === "footer";
              const readable = sectionReadability(s);
              const custom = s.id.startsWith("custom-");
              return (
                <tr key={s.id} className={s.active ? "" : "opacity-60"}>
                  <td className="a-muted w-8 font-bold">{i + 1}</td>
                  <td>
                    <p className="font-bold">{s.title?.replace(/\n/g, " ") ?? TYPE_LABEL[s.template]}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[0.8125rem]">
                      <span className="a-badge">{TYPE_LABEL[s.template]}</span>
                      {custom && <span className="a-badge ok">Criada aqui</span>}
                      {s.nav && <span className="a-badge ok" title="Aparece no menu do topo da loja">Menu: {s.nav.label}</span>}
                      {s.appearance.image && <span className="a-badge">Com imagem</span>}
                      {!s.appearance.image && s.appearance.fill.kind !== "none" && <span className="a-badge">Cor de fundo</span>}
                      {readable.some((r) => r.level === "blocking") && <span className="a-badge bad">Texto ilegível</span>}
                    </p>
                  </td>
                  <td>
                    {status ? (
                      <>
                        <p className="text-[0.9375rem]">{status.label}</p>
                        <p className="mt-0.5 text-[0.8125rem]">{status.problem ? <span className="a-badge bad">{status.problem}</span> : <span className="a-muted">{status.products} produto(s) na vitrine</span>}</p>
                      </>
                    ) : <span className="a-muted">—</span>}
                  </td>
                  <td>{locked ? <span className="a-badge">Fixa</span> : s.active ? <span className="a-badge ok">Ativa</span> : <span className="a-badge">Oculta</span>}</td>
                  <td>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {!locked && (
                        <>
                          <RowForm action={moveSection} rev={rev} scope={scope} id={s.id} extra={{ direction: "up" }} label={`Mover “${s.title ?? s.anchor}” para cima`}>↑</RowForm>
                          <RowForm action={moveSection} rev={rev} scope={scope} id={s.id} extra={{ direction: "down" }} label={`Mover “${s.title ?? s.anchor}” para baixo`}>↓</RowForm>
                          <RowForm action={setSectionActive} rev={rev} scope={scope} id={s.id} extra={{ active: String(!s.active) }} label={s.active ? `Ocultar “${s.title ?? s.anchor}”` : `Ativar “${s.title ?? s.anchor}”`}>{s.active ? "Ocultar" : "Ativar"}</RowForm>
                        </>
                      )}
                      <Link href={`/admin/home/${s.id}`} className="a-btn sm">Editar</Link>
                      {s.template === "product-carousel" && <RowForm action={duplicateSection} rev={rev} scope={scope} id={s.id} label={`Duplicar “${s.title ?? s.anchor}”`}>Duplicar</RowForm>}
                      {custom && <RowForm action={removeSection} rev={rev} scope={scope} id={s.id} label={`Remover “${s.title ?? s.anchor}”`} danger>Remover</RowForm>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      {ws.doc.home && (
      <section className="a-card p-5" aria-labelledby="nova-secao">
        <h2 id="nova-secao" className="a-h2">Adicionar seção</h2>
        <p className="a-muted mt-1 max-w-3xl text-[0.875rem]">A seção entra só no rascunho de <strong>{scopeName(scope)}</strong>, com valores iniciais desta região. Nada vai para a loja até publicar.</p>
        <h3 className="mt-5 font-extrabold">Produtos: a partir de uma coleção da INK</h3>
        {entries.length === 0 ? (
          <p className="a-flash err mt-3">Nenhuma coleção sincronizada: rode <code>npm run collections:sync</code> (só leitura) depois de um catálogo sincronizado.</p>
        ) : (
          <form action={addCollectionSection} className="mt-3 grid gap-4 md:grid-cols-[3fr_2fr_1fr_auto] md:items-start">
            <input type="hidden" name="rev" value={rev ?? "null"} />
            <input type="hidden" name="scope" value={scope} />
            <CollectionCombobox name="collection" label="Coleção (busque pelo nome)" entries={entries} libraryFrom="/admin/home" hint={anySelectable ? "Inclui as coleções internas que você habilitou na Biblioteca." : "Nenhuma coleção utilizável ainda."} />
            <div>
              <label className="a-label" htmlFor="title">Título (opcional)</label>
              <input id="title" name="title" className="a-input" maxLength={120} placeholder="Usa o nome da coleção" />
            </div>
            <div>
              <label className="a-label" htmlFor="limit">Cards</label>
              <input id="limit" name="limit" type="number" min={3} max={24} defaultValue={6} className="a-input" />
            </div>
            <button type="submit" className="a-btn md:mt-[1.65rem]">Criar seção</button>
          </form>
        )}
        <p className="a-muted mt-3 text-[0.8125rem]">Precisa de uma coleção interna? <Link className="a-link" href="/admin/colecoes?from=/admin/home">Habilite-a na Biblioteca</Link>.</p>
        <p className="a-muted mt-3 text-[0.8125rem]">A contagem é a de produtos que existem no catálogo local (não o total bruto da INK). A ordem dos cards é a devolvida pela INK; não é “mais vendidos” nem “mais recentes”. A seção nova entra só no rascunho, antes da campanha.</p>

        <h3 className="mt-8 font-extrabold">Componentes da home</h3>
        <ul className="mt-3 grid gap-4 md:grid-cols-3" aria-label="Componentes da home">
          {STRUCTURED_MODELS.map((model) => {
            const existing = sections.find((x) => x.template === model.template) ?? null;
            const single = SINGLETON_TEMPLATES.includes(model.template);
            const status = model.template === "city-styles" ? cityStylesStatus(scope, existing ?? undefined) : model.template === "states" ? statesStatus(scope) : campaignStatus(scope);
            const addForm = single && existing ? null : (
              <form action={addStructuredSection}>
                <input type="hidden" name="rev" value={rev ?? "null"} />
                <input type="hidden" name="scope" value={scope} />
                <input type="hidden" name="template" value={model.template} />
                <button type="submit" className="a-btn sm" aria-label={`Adicionar ${model.name}`}>{existing ? "Adicionar outra" : "Adicionar"}</button>
              </form>
            );
            return <StructuredModelCard key={model.template} model={model} status={status} existing={existing ? { id: existing.id, title: existing.title } : null} addForm={addForm} />;
          })}
        </ul>
      </section>
      )}

      <section className="a-card p-5" aria-label="Pré-visualização do rascunho">
        <PreviewFrame version={ws.record?.rev ?? 0} height={700} />
      </section>
    </div>
  );
}

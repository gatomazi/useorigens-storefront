import Link from "next/link";
import { HomeThemeCard } from "@/components/admin/HomeThemeCard";
import { canEdit } from "@/lib/admin/store/ports";
import { HOME_THEME_LABEL } from "@/lib/site-config/home-themes";
import { addCollectionSection, addCustomizerSection, addStructuredSection, addUmaPencaSection, duplicateSection, initRegionHomeAction, removeSection, reorderSections, saveHomeBackdropAction, setSectionActive } from "@/app/admin/actions";
import { PageBackdropEditor } from "@/components/admin/PageBackdropEditor";
import { listMedia } from "@/lib/admin/media";
import { SectionOrderTable } from "@/components/admin/SectionOrderTable";
import { StructuredModelCard } from "@/components/admin/StructuredModelCard";
import { campaignStatus, imageGridStatus, cityStylesStatus, statesStatus } from "@/lib/admin/structured-status";
import { SINGLETON_TEMPLATES, STRUCTURED_MODELS } from "@/lib/site-config/structured";
import { Flash } from "@/components/admin/Flash";
import { RegionCopyPanel } from "@/components/admin/RegionCopyPanel";
import { FollowCard, FollowFold, RegionalSectionsList } from "@/components/admin/FollowCard";
import { followsPart } from "@/lib/site-config/follow-schema";
import { PreviewFrame } from "@/components/admin/PreviewFrame";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { collectionProblems, sectionReadability, sourceStatus } from "@/lib/admin/validate-draft";
import { loadEditorWorkspace } from "@/lib/admin/workspace";
import { currentScope, scopeName, storeOf } from "@/lib/admin/scope";
import { CollectionCombobox } from "@/components/admin/CollectionCombobox";
import { toComboEntries } from "@/lib/admin/combo";
import { libraryEntries } from "@/lib/catalog/collection-source";
import { enabledInternalIds } from "@/lib/site-config/collections-enabled";
import { podioEnabledIn } from "@/lib/site-config/podio-schema";
import type { Section } from "@/lib/site-config/schema";
import { isArticleOfRegion } from "@/lib/umapenca/region";
import { readUmaPencaSnapshot } from "@/lib/umapenca/snapshot";
import { ARTICLE_KIND_LABELS, ARTICLE_KINDS } from "@/lib/umapenca/types";

const TYPE_LABEL: Record<string, string> = { hero: "Hero", "city-styles": "Estilos da cidade", "product-carousel": "Carrossel de produtos", states: "Estados", campaign: "Campanha", "image-grid": "Grade de imagens", footer: "Rodapé" };
const typeLabel = (s: Section) => (s.template === "product-carousel" && s.layout?.display === "grid" ? "Grade de produtos" : TYPE_LABEL[s.template]);
/** "Exibição" of a new product section (the same choice the section editor offers). */
function DisplaySelect({ id }: { id: string }) {
  return (
    <div>
      <label className="a-label" htmlFor={id}>Exibição</label>
      <select id={id} name="display" className="a-select" defaultValue="carousel">
        <option value="carousel">Carrossel</option>
        <option value="grid">Grade (4 por linha)</option>
      </select>
    </div>
  );
}

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

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; "tema-sul"?: string }> }) {
  const actor = await requireAdmin();
  const scope = await currentScope(actor);
  const store = storeOf(scope);
  const sp = await searchParams;
  const ws = await loadEditorWorkspace(scope);
  const rev = ws.record?.rev ?? null;
  const sections = ws.doc.home?.sections ?? [];
  const entries = toComboEntries(libraryEntries(store, enabledInternalIds(ws.doc, store)));
  const umaPenca = readUmaPencaSnapshot();
  const umaPencaSyncedAt = umaPenca?.syncedAt ?? null;
  const umaPencaCounts = Object.fromEntries(ARTICLE_KINDS.map((k) => [k, umaPenca?.articles.filter((a) => a.kind === k && isArticleOfRegion(a, scope)).length ?? 0])) as Record<(typeof ARTICLE_KINDS)[number], number>;
  const anySelectable = entries.some((e) => e.selectable);
  const problems = collectionProblems(ws.doc);
  const media = await listMedia();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="a-h1">Home · Seções <span className="a-muted">· {scopeName(scope)} · tema {HOME_THEME_LABEL[ws.editingTheme]}</span></h1>

          <p className="a-muted mt-2 max-w-2xl">A ordem abaixo é a ordem da home: arraste uma seção pela alça para mudá-la de lugar (a ordem é salva no rascunho ao soltar). O hero fica sempre no topo e o rodapé no fim. As seções originais podem ser editadas, movidas e ocultadas; só as criadas aqui podem ser removidas.</p>
        </div>
        <div className="flex items-center gap-2">
          {ws.dirty ? <span className="a-badge warn">Alterações não publicadas</span> : <span className="a-badge ok">Igual ao publicado</span>}
          <Link href="/admin/publicar" className="a-btn">Publicar</Link>
        </div>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <FollowCard actor={actor} scope={scope} part="home" doc={ws.doc} baseDoc={ws.baseDoc} rev={rev} to="/admin/home" />
      <RegionalSectionsList scope={scope} doc={ws.doc} asked={sp["tema-sul"]} />
      <FollowFold following={followsPart(ws.doc, "home")} scope={scope}>
      {/* Only the sections of the theme being edited: each theme has its own (add, edit and order them here, for that theme alone). */}
      <HomeThemeCard region={scope} doc={ws.doc} editing={ws.editingTheme} active={ws.activeTheme} live={ws.liveTheme} rev={ws.record?.rev ?? null} readOnly={!canEdit(actor, scope)} to="/admin/home" />
      <RegionCopyPanel actor={actor} scope={scope} part="home" rev={rev} />
      {problems.length > 0 && (
        <div className="a-flash err">
          <p className="font-extrabold">Estas seções não aparecerão na loja até serem corrigidas:</p>
          <ul className="mt-1 list-disc pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}

      {!ws.doc.home && (
        <section className="a-card p-5" aria-labelledby="criar-home">
          <h2 id="criar-home" className="a-h2">Esta região ainda não tem home</h2>
          <p className="a-muted mt-2 max-w-2xl">Crie uma home inicial com um topo, o seletor de estados e até 3 carrosséis das coleções <strong>públicas</strong> com produtos suficientes na loja da INK de {scopeName(scope)}. Você também pode usar <strong>Copiar de outra região</strong>, acima, para começar com uma estrutura pronta. Depois, edite as seções no rascunho.</p>
          <form action={initRegionHomeAction} className="mt-4">
            <input type="hidden" name="rev" value={rev ?? "null"} />
            <input type="hidden" name="scope" value={scope} />
            <button type="submit" className="a-btn">Criar home inicial</button>
          </form>
        </section>
      )}

      {ws.doc.home && (
      <div className="a-card overflow-x-auto">
        <SectionOrderTable
          caption={`Seções da home de ${scopeName(scope)}, em ordem`}
          action={reorderSections}
          rev={rev}
          scope={scope}
          rows={sections.map((s: Section) => {
              const status = sourceStatus(s, ws.doc);
              const locked = s.template === "hero" || s.template === "footer";
              const readable = sectionReadability(s, ws.doc.home?.backdrop?.color);
              const custom = s.id.startsWith("custom-");
              return { id: s.id, label: s.title?.replace(/\n/g, " ") ?? typeLabel(s), movable: !locked, dimmed: !s.active, cells: (
                <>
                  <td>
                    <p className="font-bold">{s.title?.replace(/\n/g, " ") ?? typeLabel(s)}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[0.8125rem]">
                      <span className="a-badge">{typeLabel(s)}</span>
                      {custom && <span className="a-badge ok">Criada aqui</span>}
                      {s.regions && <span className="a-badge warn" title="Só aparece nessas regiões (vale para as que seguem a Sul)">Só {s.regions.map((r) => scopeName(r)).join(" e ")}</span>}
                      {s.nav && <span className="a-badge ok" title="Aparece no menu do topo da loja">Menu: {s.nav.label}</span>}
                      {s.layout?.buyLabel && <span className="a-badge ok">{s.layout.buyStyle === "fab" ? "Carrinho" : s.layout.buyStyle === "link" ? "Chamada" : "Botão"} “{s.layout.buyLabel}”</span>}
                      {s.layout?.tags && <span className="a-badge ok">Etiquetas: {[s.layout.tags.discount ? "% OFF" : null, s.layout.tags.text ? `“${s.layout.tags.text}”${s.layout.tags.onSale ? " (só em promoção)" : ""}` : null].filter(Boolean).join(" + ")}</span>}
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
                      {!locked && <RowForm action={setSectionActive} rev={rev} scope={scope} id={s.id} extra={{ active: String(!s.active) }} label={s.active ? `Ocultar “${s.title ?? s.anchor}”` : `Ativar “${s.title ?? s.anchor}”`}>{s.active ? "Ocultar" : "Ativar"}</RowForm>}
                      <Link href={`/admin/home/${s.id}`} className="a-btn sm">Editar</Link>
                      {s.template === "product-carousel" && <RowForm action={duplicateSection} rev={rev} scope={scope} id={s.id} label={`Duplicar “${s.title ?? s.anchor}”`}>Duplicar</RowForm>}
                      {custom && <RowForm action={removeSection} rev={rev} scope={scope} id={s.id} label={`Remover “${s.title ?? s.anchor}”`} danger>Remover</RowForm>}
                    </div>
                  </td>
                </>
              ) };
            })}
        />
      </div>
      )}

      {ws.doc.home && (
      <section className="a-card p-5" aria-labelledby="fundo-home">
        <h2 id="fundo-home" className="a-h2">Fundo da home · tema {HOME_THEME_LABEL[ws.editingTheme]}</h2>
        <p className="a-muted mt-1 max-w-3xl text-[0.875rem]">Uma cor para a home inteira e, se quiser, uma imagem repetida por cima como pattern, como no fundo das páginas. Vale só para este tema: ao trocar de tema em “Usar na loja”, a home passa a usar o fundo do outro tema. As seções com fundo próprio (foto, cor, papel) continuam com o delas.</p>
        <PageBackdropEditor target="home" backdrop={ws.doc.home.backdrop} media={media} action={saveHomeBackdropAction} hidden={<><input type="hidden" name="rev" value={rev ?? "null"} /><input type="hidden" name="scope" value={scope} /></>} />
      </section>
      )}

      <p className="a-card flex flex-wrap items-center justify-between gap-3 p-4 text-[0.9375rem]" data-testid="home-podio-note">
        <span><strong>O Pódio</strong> (“Quem está no pódio?”, logo depois de Estados) não é uma seção: ele se liga junto com o pódio das páginas de estado. Na loja: {podioEnabledIn(ws.baseDoc) ? <span className="a-badge ok">Ligado</span> : <span className="a-badge">Desligado</span>}{podioEnabledIn(ws.doc) !== podioEnabledIn(ws.baseDoc) && <span className="a-badge warn ml-2">No rascunho: {podioEnabledIn(ws.doc) ? "ligado" : "desligado"}</span>}</span>
        <Link href="/admin/estados#podio" className="a-btn sm ghost">Ligar ou desligar em Páginas de estado</Link>
      </p>

      {ws.doc.home && (
      <section className="a-card p-5" aria-labelledby="nova-secao">
        <h2 id="nova-secao" className="a-h2">Adicionar seção</h2>
        <p className="a-muted mt-1 max-w-3xl text-[0.875rem]">A seção entra só no rascunho de <strong>{scopeName(scope)}</strong>, com valores iniciais desta região. Nada vai para a loja até publicar.</p>
        <h3 className="mt-5 font-extrabold">Produtos: a partir de uma coleção da INK</h3>
        {entries.length === 0 ? (
          <p className="a-flash err mt-3">Nenhuma coleção sincronizada: rode <code>npm run collections:sync</code> (só leitura) depois de um catálogo sincronizado.</p>
        ) : (
          <form action={addCollectionSection} aria-label="Nova seção a partir de uma coleção da INK" className="mt-3 grid gap-4 md:grid-cols-[3fr_2fr_1.2fr_1fr_auto] md:items-start">
            <input type="hidden" name="rev" value={rev ?? "null"} />
            <input type="hidden" name="scope" value={scope} />
            <CollectionCombobox name="collection" label="Coleção (busque pelo nome)" entries={entries} libraryFrom="/admin/home" hint={anySelectable ? "Inclui as coleções internas que você habilitou na Biblioteca." : "Nenhuma coleção utilizável ainda."} />
            <div>
              <label className="a-label" htmlFor="title">Título (opcional)</label>
              <input id="title" name="title" className="a-input" maxLength={120} placeholder="Usa o nome da coleção" />
            </div>
            <DisplaySelect id="display" />
            <div>
              <label className="a-label" htmlFor="limit">Cards</label>
              <input id="limit" name="limit" type="number" min={3} max={48} defaultValue={6} className="a-input" />
            </div>
            <button type="submit" className="a-btn md:mt-[1.65rem]">Criar seção</button>
          </form>
        )}
        <p className="a-muted mt-3 text-[0.8125rem]">Precisa de uma coleção interna? <Link className="a-link" href="/admin/colecoes?from=/admin/home">Habilite-a na Biblioteca</Link>.</p>
        <p className="a-muted mt-3 text-[0.8125rem]">Carrossel: uma fileira que a pessoa arrasta (até 24 cards). Grade: 4 produtos por linha no desktop e 2 no celular (até 48). No editor da seção, escolha a ordenação padrão: Novidades, Mais vendidas, preço ou ordem da coleção. Você também pode ordenar manualmente e esconder produtos; a ordem manual tem prioridade. A seção nova entra só no rascunho, antes da campanha.</p>

        <h3 className="mt-8 font-extrabold">Produtos: canecas e ecobags da Uma Penca</h3>
        <p className="a-muted mt-1 max-w-3xl text-[0.875rem]">Os produtos vêm do feed da loja da Uma Penca (sincronizado a cada 6 horas), sem coleção da INK. Cada região recebe os produtos cujo nome diz um lugar dela (“Caneca Lá de Guarapuava” só no Sul); nome repetido em outra região precisa da UF no fim (“Caneca Lá de Palmas | TO”). O botão “Ver todos” já leva para <code>/{scope}/outros-artigos</code>. Para pôr o seu modelo “Crie a sua” como primeiro card, edite a seção depois de criada e marque “Destacar um produto personalizável”.</p>
        <p className="a-muted mt-1 text-[0.8125rem]" data-testid="umapenca-feed-count">No feed agora, para esta região: {ARTICLE_KINDS.map((k) => `${umaPencaCounts[k]} ${umaPencaCounts[k] === 1 ? ARTICLE_KIND_LABELS[k].singular.toLowerCase() : ARTICLE_KIND_LABELS[k].plural.toLowerCase()}`).join(" · ")}{umaPencaSyncedAt ? "" : " (o feed ainda não foi sincronizado)"}</p>
        <form action={addUmaPencaSection} aria-label="Nova seção de canecas e ecobags da Uma Penca" className="mt-3 grid gap-4 md:grid-cols-[2fr_2fr_1.2fr_1fr_auto] md:items-start">
          <input type="hidden" name="rev" value={rev ?? "null"} />
          <input type="hidden" name="scope" value={scope} />
          <fieldset>
            <legend className="a-label">Tipos</legend>
            <div className="mt-2 flex flex-wrap gap-4">
              {ARTICLE_KINDS.map((k) => (
                <label key={k} className="flex items-center gap-2 font-bold"><input type="checkbox" name={`kind_${k}`} defaultChecked={k === "caneca"} /> {ARTICLE_KIND_LABELS[k].plural}</label>
              ))}
            </div>
          </fieldset>
          <div>
            <label className="a-label" htmlFor="up_title">Título (opcional)</label>
            <input id="up_title" name="title" className="a-input" maxLength={120} placeholder="Canecas, Ecobags ou Outros artigos" />
          </div>
          <DisplaySelect id="up_display" />
          <div>
            <label className="a-label" htmlFor="up_limit">Cards</label>
            <input id="up_limit" name="limit" type="number" min={3} max={48} defaultValue={8} className="a-input" />
          </div>
          <button type="submit" className="a-btn md:mt-[1.65rem]">Criar seção</button>
        </form>

        <h3 id="nova-secao-personalizacao" className="mt-8 font-extrabold">Personalização: chamada para um modelo (ex.: Localidade)</h3>
        <p className="a-muted mt-1 max-w-3xl text-[0.875rem]">Um bloco dividido com o nome e o texto do modelo, a foto dele ao lado e o botão “Personalizar a minha” para a página de personalização. Depois de criada, ajuste o título, o texto e a cor no editor da seção (ou ponha uma imagem própria).</p>
        {(ws.doc.customizers ?? []).length === 0 ? (
          <p className="a-flash err mt-3">Esta região ainda não tem modelos. <Link className="a-link" href="/admin/personalizacao">Cadastre em Personalização</Link>.</p>
        ) : (
          <form action={addCustomizerSection} aria-label="Nova seção de personalização" className="mt-3 grid gap-4 md:grid-cols-[minmax(0,22rem)_auto] md:items-end">
            <input type="hidden" name="rev" value={rev ?? "null"} />
            <input type="hidden" name="scope" value={scope} />
            <div>
              <label className="a-label" htmlFor="customizer">Modelo</label>
              <select id="customizer" name="customizer" className="a-select" defaultValue="" required>
                <option value="" disabled>Escolha…</option>
                {(ws.doc.customizers ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}{m.active ? "" : " (desativado)"}</option>)}
              </select>
            </div>
            <button type="submit" className="a-btn">Criar seção</button>
          </form>
        )}

        <h3 className="mt-8 font-extrabold">Componentes da home</h3>
        <ul className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Componentes da home">
          {STRUCTURED_MODELS.map((model) => {
            const existing = sections.find((x) => x.template === model.template) ?? null;
            const single = SINGLETON_TEMPLATES.includes(model.template);
            const status = model.template === "city-styles" ? cityStylesStatus(scope, existing ?? undefined) : model.template === "states" ? statesStatus(scope) : model.template === "image-grid" ? imageGridStatus() : campaignStatus(scope);
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
      </FollowFold>

      <section className="a-card p-5" aria-label="Pré-visualização do rascunho">
        <PreviewFrame version={ws.record?.rev ?? 0} height={700} />
      </section>
    </div>
  );
}

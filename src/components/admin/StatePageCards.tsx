import { moveStateCategoryAction, resetStateCategoriesAction, resetStateSubcategoriesAction, setStateCategoryAction, setStatePageSectionAction, setStateSubcategoryAction } from "@/app/admin/actions";
import { STATE_ROW_MIN_ITEMS, stateCategoryCollections, stateCollectionRows, stateParentCollection, stateSubcategoryCollections, type StateCollectionRow } from "@/lib/catalog/collection-source";
import type { CollectionRecord } from "@/lib/catalog/collections";
import { getStoreCollections } from "@/lib/catalog/collections-file";
import { getCatalog } from "@/lib/catalog/repository";
import { storeForRegion } from "@/lib/catalog/commerce-mode";
import { REGIONS, STATE_NAMES, type RegionSlug } from "@/lib/geo/regions";
import { normalizeText } from "@/lib/geo/text";
import { stateOfUf } from "@/lib/seo/state-copy";
import type { ScopeDoc } from "@/lib/site-config/schema";
import { STATE_PAGE_SECTIONS, STATE_PAGE_SECTION_LABELS, statePageShows, type StatePageSection } from "@/lib/site-config/state-page-schema";

/**
 * Everything the panel controls on the region's state pages (`/<region>/<uf>`) besides O Pódio: the sections that are not built from collections (on or
 * off as a whole) and the hierarchy the collection rows follow, state > categories > subcategories (state-hierarchy.ts), with what each state shows.
 */
type Props = { scope: RegionSlug; rev: number | null; doc: ScopeDoc; baseDoc: ScopeDoc };

const SECTION_HELP: Record<StatePageSection, string> = {
  showcase: "Uma camiseta real por lugar do estado, pela venda na INK. Não é uma categoria.",
  styles: "As camisetas das cidades do estado por estilo (Origem, Território, Legado…).",
  places: "A lista de lugares do estado, por região e de A a Z, no fim da página.",
};

/** One state's rows in the order the page shows them (a subcategory under its category, the state's own row last). */
export function StateRowsList({ uf, rows }: { uf: string; rows: StateCollectionRow[] }) {
  if (rows.length === 0) return <span className="a-muted">nenhum carrossel</span>;
  return (
    <ol className="space-y-0.5 text-[0.875rem]" data-testid={`state-tree-${uf}`}>
      {rows.map((row) => (
        <li key={row.collection.id} className={row.level === "subcategory" && row.category ? "pl-4" : ""}>
          {row.level === "subcategory" && row.category && <span aria-hidden="true" className="a-muted">↳ </span>}
          <span className={row.level === "category" ? "font-semibold" : ""}>{row.level === "state" ? `Mais ${stateOfUf(uf)}` : row.collection.name}</span>
          <span className="a-muted"> · {row.items.length}</span>
          {row.level === "subcategory" && <span className="a-muted">{row.category ? ` (em ${row.category.name})` : " (fora das categorias)"}</span>}
          {row.level === "state" && <span className="a-muted"> (sem categoria)</span>}
        </li>
      ))}
    </ol>
  );
}

export function StatePageCards({ scope, rev, doc, baseDoc }: Props) {
  const store = storeForRegion(scope);
  const ufs = REGIONS[scope].ufs;
  const catalog = getCatalog();
  const rowsByUf = new Map(ufs.map((uf) => [uf, stateCollectionRows(scope, uf, doc, (s) => catalog.productsOfStore(s))]));
  /** What a collection shows in each state (0 = no row there) and the category a subcategory falls under, from the page's own rows. */
  const shownIn = (id: number) => ufs.map((uf) => ({ uf, count: rowsByUf.get(uf)?.find((r) => r.collection.id === id)?.items.length ?? 0 }));
  const homeOf = (id: number) => ufs.map((uf) => rowsByUf.get(uf)?.find((r) => r.collection.id === id)?.category?.name).find(Boolean);
  const categories = stateCategoryCollections(scope, doc);
  const subcategories = stateSubcategoryCollections(scope, doc);
  // Automatic subcategories: only those that show in some state (every other public collection of the store would be noise) and those brought in by
  // hand, so a choice that stopped working stays visible. A legacy list: all of it.
  const chosenByHand = new Set((doc.collections?.stateSubcategories?.added ?? []).map((r) => r.collectionId));
  const shownSubs = subcategories.records.filter((c) => subcategories.legacy || chosenByHand.has(c.id) || shownIn(c.id).some((s) => s.count > 0));
  const stateNameKeys = new Set(Object.values(STATE_NAMES).map(normalizeText));
  const synced = (getStoreCollections(store)?.collections ?? []).filter((c) => !c.needsResync && !stateNameKeys.has(normalizeText(c.name))).sort((a, b) => a.position - b.position);
  const inCategories = new Set(categories.records.map((c) => c.id));
  const inSubs = new Set(subcategories.records.map((c) => c.id));
  const subsCustomized = subcategories.legacy || doc.collections?.stateSubcategories !== undefined;
  const hidden = (
    <>
      <input type="hidden" name="rev" value={rev ?? "null"} />
      <input type="hidden" name="scope" value={scope} />
    </>
  );
  const perStateCounts = (c: CollectionRecord) => (
    <span className="text-[0.8125rem]" title="Produtos que o carrossel mostra em cada estado (0 = não aparece lá)">
      {shownIn(c.id).map(({ uf, count }, j) => <span key={uf} className={count > 0 ? "font-bold" : "a-muted"}>{j > 0 ? " · " : ""}{uf} {count}</span>)}
    </span>
  );
  const subcategoryForm = (c: CollectionRecord, on: boolean, label: string) => (
    <form action={setStateSubcategoryAction}>
      {hidden}
      <input type="hidden" name="ref" value={`${store}:${c.id}`} />
      <input type="hidden" name="on" value={on ? "1" : "0"} />
      <button type="submit" className="a-btn sm ghost" aria-label={`${label} ${c.name}`}>{label}</button>
    </form>
  );

  return (
    <>
      <section id="estado-secoes" className="a-card scroll-mt-4 p-5" aria-labelledby="estado-secoes-titulo" data-testid="state-sections">
        <h2 id="estado-secoes-titulo" className="a-h2">Seções da página do estado</h2>
        <p className="a-muted mt-2 max-w-3xl text-[0.875rem]">Estas não vêm das categorias: aparecem ou somem inteiras, em todos os estados da região. Os carrosséis de categoria seguem as listas abaixo.</p>
        <ul className="mt-3 divide-y divide-black/15">
          {STATE_PAGE_SECTIONS.map((section) => {
            const draft = statePageShows(doc, section);
            const live = statePageShows(baseDoc, section);
            return (
              <li key={section} className="flex flex-wrap items-center gap-3 py-3" data-testid={`state-section-${section}`}>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{STATE_PAGE_SECTION_LABELS[section]}</p>
                  <p className="a-muted text-[0.8125rem]">{SECTION_HELP[section]}</p>
                </div>
                <span className="flex flex-wrap items-center gap-2 text-[0.875rem]">
                  Na loja: {live ? <span className="a-badge ok">Aparece</span> : <span className="a-badge">Oculta</span>}
                  {draft !== live && <span className="a-badge warn">No rascunho: {draft ? "aparece" : "oculta"} (falta publicar)</span>}
                </span>
                <form action={setStatePageSectionAction}>
                  {hidden}
                  <input type="hidden" name="section" value={section} />
                  <input type="hidden" name="shown" value={String(!draft)} />
                  <button type="submit" className="a-btn sm" aria-label={`${draft ? "Ocultar" : "Mostrar"} ${STATE_PAGE_SECTION_LABELS[section]}`}>{draft ? "Ocultar" : "Mostrar"}</button>
                </form>
              </li>
            );
          })}
        </ul>
      </section>

      <section id="estado-categorias" className="a-card scroll-mt-4 p-5" aria-labelledby="estado-categorias-titulo" data-testid="state-categories">
        <h2 id="estado-categorias-titulo" className="a-h2">Categorias (2º nível)</h2>
        <p className="a-muted mt-2 max-w-3xl text-[0.875rem]">
          Abaixo do estado, cada categoria vira um carrossel com os produtos do estado que nenhuma subcategoria levou, nesta ordem.{" "}
          {categories.own ? <strong>Lista escolhida por você.</strong> : <><strong>Automático</strong>: as coleções do topo do menu, na mesma ordem. Ao mexer aqui, a lista passa a ser sua e não acompanha mais o menu.</>}
          {" "}Um carrossel precisa de {STATE_ROW_MIN_ITEMS} produtos; com menos, eles vão para “Mais {stateOfUf(ufs[0])}”.
        </p>
        {categories.records.length === 0 ? <p className="a-muted mt-3 text-[0.875rem]">Nenhuma categoria: os produtos de cada estado vão para as subcategorias ou para o carrossel do estado.</p> : (
          <ol className="mt-3 space-y-2">
            {categories.records.map((c, i) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2" data-testid={`state-category-${c.id}`}>
                <span className="a-muted w-5 text-right">{i + 1}.</span>
                <span className="font-semibold">{c.name}</span>
                {!c.isAvailable && <span className="a-badge" title="Coleção interna na INK">interna</span>}
                {perStateCounts(c)}
                <div className="ml-auto flex gap-1">
                  <form action={moveStateCategoryAction} className="flex gap-1">
                    {hidden}
                    <input type="hidden" name="ref" value={`${store}:${c.id}`} />
                    <button type="submit" name="direction" value="up" className="a-btn sm ghost" disabled={i === 0} aria-label={`Subir ${c.name}`}>↑</button>
                    <button type="submit" name="direction" value="down" className="a-btn sm ghost" disabled={i === categories.records.length - 1} aria-label={`Descer ${c.name}`}>↓</button>
                  </form>
                  <form action={setStateCategoryAction}>
                    {hidden}
                    <input type="hidden" name="ref" value={`${store}:${c.id}`} />
                    <input type="hidden" name="on" value="0" />
                    <button type="submit" className="a-btn sm ghost" aria-label={`Tirar ${c.name} das categorias`}>Tirar</button>
                  </form>
                </div>
              </li>
            ))}
          </ol>
        )}
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <form action={setStateCategoryAction} className="flex flex-wrap items-end gap-2">
            {hidden}
            <input type="hidden" name="on" value="1" />
            <div>
              <label className="a-label" htmlFor="state-category-add">Incluir categoria</label>
              <select id="state-category-add" name="ref" className="a-input">
                {synced.filter((c) => !inCategories.has(c.id)).map((c) => <option key={c.id} value={`${store}:${c.id}`}>{c.name}{c.isAvailable ? "" : " (interna)"}</option>)}
              </select>
            </div>
            <button type="submit" className="a-btn sm">Incluir</button>
          </form>
          {categories.own && (
            <form action={resetStateCategoriesAction} className="ml-auto">
              {hidden}
              <button type="submit" className="a-btn sm ghost">Voltar ao topo do menu</button>
            </form>
          )}
        </div>
      </section>

      <section id="estado-subcategorias" className="a-card scroll-mt-4 p-5" aria-labelledby="estado-subcategorias-titulo" data-testid="state-subcategories">
        <h2 id="estado-subcategorias-titulo" className="a-h2">Subcategorias (3º nível)</h2>
        <p className="a-muted mt-2 max-w-3xl text-[0.875rem]">
          {subcategories.legacy ? (
            <><strong>Lista antiga</strong> (de antes das categorias): só estas coleções viram subcategoria. Ao tirar ou incluir uma, ou ao voltar ao automático, as novas coleções públicas passam a entrar sozinhas.</>
          ) : (
            <><strong>Automático</strong>: toda coleção pública da INK que não é estado nem categoria vira subcategoria, na ordem do menu da INK. Uma coleção nova entra sozinha.</>
          )}
          {" "}Cada uma aparece dentro da primeira categoria com que divide produtos (ex.: “Fala de Onde” dentro de “Fala Daqui”) e leva esses produtos do carrossel da categoria. Aqui aparecem só as que mostram algo em algum estado.
        </p>
        {shownSubs.length === 0 ? <p className="a-muted mt-3 text-[0.875rem]">Nenhuma subcategoria aparece hoje: cada produto fica no carrossel da categoria dele.</p> : (
          <ul className="mt-3 space-y-2">
            {shownSubs.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2" data-testid={`state-subcategory-${c.id}`}>
                <span className="font-semibold">{c.name}</span>
                {!c.isAvailable && <span className="a-badge" title="Coleção interna na INK, incluída por você">interna</span>}
                {homeOf(c.id) && <span className="a-muted text-[0.8125rem]">em {homeOf(c.id)}</span>}
                {perStateCounts(c)}
                <span className="ml-auto">{subcategoryForm(c, false, "Tirar")}</span>
              </li>
            ))}
          </ul>
        )}
        {subcategories.hidden.length > 0 && (
          <div className="mt-4" data-testid="state-subcategories-hidden">
            <p className="a-label">Tiradas por você</p>
            <ul className="mt-1 space-y-1">
              {subcategories.hidden.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 text-[0.875rem]">
                  <span>{c.name}</span>
                  <span className="a-muted text-[0.8125rem]">os produtos dela ficam na categoria</span>
                  <span className="ml-auto">{subcategoryForm(c, true, "Voltar")}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-end gap-3">
          {synced.some((c) => !inCategories.has(c.id) && !inSubs.has(c.id) && (subcategories.legacy || !c.isAvailable)) && (
            <form action={setStateSubcategoryAction} className="flex flex-wrap items-end gap-2">
              {hidden}
              <input type="hidden" name="on" value="1" />
              <div>
                <label className="a-label" htmlFor="state-subcategory-add">{subcategories.legacy ? "Incluir subcategoria" : "Incluir coleção interna"}</label>
                <select id="state-subcategory-add" name="ref" className="a-input">
                  {synced.filter((c) => !inCategories.has(c.id) && !inSubs.has(c.id) && (subcategories.legacy || !c.isAvailable)).map((c) => <option key={c.id} value={`${store}:${c.id}`}>{c.name}{c.isAvailable ? "" : " (interna)"}</option>)}
                </select>
              </div>
              <button type="submit" className="a-btn sm">Incluir</button>
            </form>
          )}
          {subsCustomized && (
            <form action={resetStateSubcategoriesAction} className="ml-auto">
              {hidden}
              <button type="submit" className="a-btn sm ghost">Voltar ao automático</button>
            </form>
          )}
        </div>
      </section>

      <section id="estado-previa" className="a-card scroll-mt-4 p-5" aria-labelledby="estado-previa-titulo" data-testid="state-tree">
        <h2 id="estado-previa-titulo" className="a-h2">Como fica cada estado</h2>
        <p className="a-muted mt-2 max-w-3xl text-[0.875rem]">Os carrosséis de categoria de cada página, na ordem em que aparecem, com o rascunho de agora. Cada produto fica no carrossel mais fundo que aparece: subcategoria, depois categoria, depois o do próprio estado (“Mais {stateOfUf(ufs[0])}”).</p>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          {ufs.map((uf) => (
            <div key={uf}>
              <p className="font-bold">{STATE_NAMES[uf]}</p>
              {stateParentCollection(scope, uf) ? <StateRowsList uf={uf} rows={rowsByUf.get(uf) ?? []} /> : <span className="a-badge bad">Não há coleção “{STATE_NAMES[uf]}” na INK</span>}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

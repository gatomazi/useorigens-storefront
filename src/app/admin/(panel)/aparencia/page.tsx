import { saveCardsAction, saveCarouselEndAction, saveSearchAction, saveMundoAction, saveThemeAction } from "@/app/admin/actions";
import { Flash } from "@/components/admin/Flash";
import { GlobalPendingNote } from "@/components/admin/GlobalPendingNote";
import { ThemeEditor } from "@/components/admin/ThemeEditor";
import { HomeThemeCard } from "@/components/admin/HomeThemeCard";
import { HOME_THEME_LABEL } from "@/lib/site-config/home-themes";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { currentScope, REGION_SCOPES, scopeName } from "@/lib/admin/scope";
import { canEdit } from "@/lib/admin/store/ports";
import { loadEditorWorkspace, loadWorkspace } from "@/lib/admin/workspace";
import type { RegionSlug } from "@/lib/geo/regions";
import { launchedRegions } from "@/lib/regions/launched";
import { CARD_BUY_STYLE_NAME } from "@/lib/site-config/cards-schema";
import { carouselEndText, COUNT_TOKEN, DEFAULT_CAROUSEL_END_LABEL, MAX_CAROUSEL_END_LABEL } from "@/lib/site-config/carousel-end-schema";
import { siteCollectionMenu } from "@/lib/catalog/collection-menu";
import { coveredUfs } from "@/lib/site-config/chrome";
import { navData, type NavData } from "@/lib/site-config/navigation";
import { DEFAULT_BUY_LABEL, MAX_BUY_LABEL } from "@/lib/site-config/schema";
import { modoMundoServidor } from "@/lib/mundo/flag";
import { modoEfetivo, MUNDO_MODOS, type MundoModo } from "@/lib/site-config/mundo-schema";

const MUNDO_OPCOES: readonly [MundoModo | "segue", string, string][] = [
  ["on", "Ligado", "A página /meu-pequeno-mundo e as três entradas da loja: bloco na home, convite nas páginas de cidade e link no rodapé."],
  ["pagina", "Só a página", "A página e os links compartilhados funcionam, mas a loja não mostra nenhuma entrada."],
  ["off", "Desligado", "A página responde 404 e nada aparece na loja."],
  ["segue", "Seguir o servidor", "Sem escolha no painel: vale só a variável MEU_PEQUENO_MUNDO do servidor."],
];
const MUNDO_ROTULO: Record<MundoModo, string> = { on: "ligado (página e entradas)", pagina: "só a página", off: "desligado" };

export default async function AppearancePage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const actor = await requireAdmin();
  const scope = await currentScope(actor);
  const sp = await searchParams;
  const owner = actor.role === "owner";
  // The region's palette is the palette of the home theme being edited (each theme keeps its own).
  const [ws, global] = await Promise.all([loadEditorWorkspace(scope), loadWorkspace("global")]);
  const launched = launchedRegions();
  // Real menu data per region for the previews (the home's own sections, launched regions, states that have products).
  const navByRegion = Object.fromEntries(
    await Promise.all(
      REGION_SCOPES.map(async (r) => {
        const doc = (r === scope ? ws : await loadWorkspace(r)).doc;
        return [r, navData({ region: r, doc, launched, coveredUfs: coveredUfs(r), collections: siteCollectionMenu(r, doc) })] as const;
      }),
    ),
  ) as Record<RegionSlug, NavData>;
  const inherits = ws.doc.theme?.mode === "inherit";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="a-h1">Aparência <span className="a-muted">· {scopeName(scope)}</span></h1>
        <p className="a-muted mt-2 max-w-3xl">Cores do header, do menu mobile e da página. A paleta <strong>Use Origens</strong> vale para toda região que escolher <em>Herdar</em>; cada região pode manter a <em>Paleta própria</em>. Sem configuração, a região continua exatamente como está hoje. Salvar guarda só um <strong>rascunho</strong>; a região é publicada em <em>Publicar</em>, e a paleta global, o botão nos cards e o Meu Pequeno Mundo também, em <em>Publicar → Configuração global</em>.</p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <GlobalPendingNote global={global} owner={owner} />

      <HomeThemeCard region={scope} doc={ws.doc} editing={ws.editingTheme} active={ws.activeTheme} live={ws.liveTheme} rev={ws.record?.rev ?? null} readOnly={!canEdit(actor, scope)} to="/admin/aparencia" />

      <ThemeEditor
        key={`region-${scope}-${ws.editingTheme}-${ws.record?.rev ?? "null"}`}
        scope={scope}
        region={scope}
        theme={ws.doc.theme}
        globalTheme={global.doc.theme}
        navigation={ws.doc.navigation}
        navData={navByRegion}
        readOnly={!canEdit(actor, scope)}
        action={saveThemeAction}
        rev={String(ws.record?.rev ?? "null")}
        title={`Cores do tema ${HOME_THEME_LABEL[ws.editingTheme]} · ${scopeName(scope)}`}
        note={inherits ? "Esta região herda a paleta da Use Origens." : "Escolha manter o visual atual, herdar a paleta global ou definir cores próprias."}
      />

      <ThemeEditor
        key={`global-${global.record?.rev ?? "null"}`}
        scope="global"
        region={scope}
        theme={global.doc.theme}
        globalTheme={global.doc.theme}
        navigation={undefined}
        navData={navByRegion}
        readOnly={!owner}
        action={saveThemeAction}
        rev={String(global.record?.rev ?? "null")}
        title="Paleta global · Use Origens"
        note="Os padrões da marca. Só o owner altera e publica (em Publicar → Configuração global). Ao publicar, todas as regiões que herdam esta paleta mudam juntas, sem deploy; as que mantêm paleta própria ou o visual atual não mudam."
      />

      <section id="botao-cards" className="a-card scroll-mt-4 p-5" aria-labelledby="cards-title" data-testid="cards-setting">
        <h2 id="cards-title" className="a-h2">Botão nos cards de produto · todas as regiões</h2>
        <p className="a-muted mt-1 max-w-3xl text-[0.9375rem]">Ligado, todo card de produto da loja ganha um botão com este texto, embaixo do card ou como um carrinho na imagem: seções de produtos, páginas de coleção, estilos da cidade, resultados da busca e artigos da Uma Penca. O botão abre a mesma página do produto que o card já abre. Uma seção que tem o próprio texto de botão continua com ele. Desligado, cada seção decide, como antes.</p>
        {(() => {
          const draft = global.doc.cards;
          const live = global.baseDoc.cards;
          return (
            <form action={saveCardsAction} className="mt-4 space-y-4">
              <input type="hidden" name="rev" value={String(global.record?.rev ?? "null")} />
              <label className="flex min-h-10 items-center gap-2 text-[0.9375rem] font-semibold">
                <input type="checkbox" name="cards_buy" defaultChecked={Boolean(draft)} disabled={!owner} data-testid="cards-buy" />
                Mostrar o botão em todos os cards
              </label>
              <div className="max-w-xs">
                <label className="a-label" htmlFor="cards_buy_label">Texto do botão</label>
                <input id="cards_buy_label" name="cards_buy_label" className="a-input" defaultValue={draft?.buyLabel ?? DEFAULT_BUY_LABEL} maxLength={MAX_BUY_LABEL} disabled={!owner} data-testid="cards-buy-label" />
              </div>
              <fieldset className="space-y-2">
                <legend className="a-label">Formato</legend>
                <div className="flex flex-wrap gap-3">
                  {([
                    ["button", "Botão embaixo", "Uma barra com o texto, no pé de cada card."],
                    ["fab", "Carrinho na imagem", "Um botão redondo de carrinho no canto da foto; o texto vira o nome dele para leitores de tela."],
                    ["link", "Chamada ao lado do preço", "O texto com uma seta, na mesma linha do preço (“Ver produto →”), sobre um fio no pé do card. Em card estreito, desce para baixo do preço."],
                  ] as const).map(([value, label, help]) => (
                    <label key={value} className="flex max-w-xs cursor-pointer gap-2 border border-black/20 p-3 has-[:checked]:border-black has-[:checked]:bg-white">
                      <input type="radio" name="cards_buy_style" value={value} defaultChecked={(draft?.buyStyle ?? "button") === value} disabled={!owner} className="mt-1" data-testid={`cards-buy-style-${value}`} />
                      <span><span className="block font-bold">{label}</span><span className="a-muted block text-[0.8125rem]">{help}</span></span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <p className="text-[0.875rem]" data-testid="cards-live"><strong>Na loja agora:</strong> {live ? `${CARD_BUY_STYLE_NAME[live.buyStyle ?? "button"]} “${live.buyLabel}” em todos os cards` : "cada seção decide"}.{JSON.stringify(draft ?? null) !== JSON.stringify(live ?? null) && " O rascunho tem outra escolha: publique a configuração global em Publicar."}</p>
              {owner ? <button type="submit" className="a-btn" data-testid="save-cards">Salvar rascunho do botão</button> : <p className="a-muted">Só o owner altera.</p>}
            </form>
          );
        })()}
      </section>

      <section id="busca" className="a-card scroll-mt-4 p-5" aria-labelledby="search-title" data-testid="search-setting">
        <h2 id="search-title" className="a-h2">Busca · todas as regiões</h2>
        <p className="a-muted mt-1 max-w-3xl text-[0.9375rem]">O que a busca da loja mostra ao digitar. Desligando “Estampas”, saem os resultados de cidade × estilo (“Tijucas · Ponto de Origem”) e as estampas de merch: a busca fica com cidades, estados e páginas (coleções e temas), e quem procura a cidade cai na página dela, onde escolhe a estampa. Vale também para os resultados de outras regiões.</p>
        {(() => {
          const draft = global.doc.search?.designs !== false;
          const live = global.baseDoc.search?.designs !== false;
          return (
            <form action={saveSearchAction} className="mt-4 space-y-4">
              <input type="hidden" name="rev" value={String(global.record?.rev ?? "null")} />
              <label className="flex min-h-10 items-center gap-2 text-[0.9375rem] font-semibold">
                <input type="checkbox" name="search_designs" defaultChecked={draft} disabled={!owner} data-testid="search-designs" />
                Mostrar o grupo “Estampas” nos resultados da busca
              </label>
              <p className="text-[0.875rem]" data-testid="search-live"><strong>Na loja agora:</strong> estampas {live ? "aparecem" : "não aparecem"} na busca.{draft !== live && " O rascunho tem outra escolha: publique a configuração global em Publicar."}</p>
              {owner ? <button type="submit" className="a-btn" data-testid="save-search">Salvar rascunho da busca</button> : <p className="a-muted">Só o owner altera.</p>}
            </form>
          );
        })()}
      </section>

      <section id="fim-carrossel" className="a-card scroll-mt-4 p-5" aria-labelledby="carousel-end-title" data-testid="carousel-end-setting">
        <h2 id="carousel-end-title" className="a-h2">Card no fim dos carrosséis · todas as regiões</h2>
        <p className="a-muted mt-1 max-w-3xl text-[0.9375rem]">Ligado, todo carrossel de produtos que tem “Ver todos” ganha um último card com este texto, depois do último produto: quem rolou até o fim vê que a coleção continua. O card abre o mesmo endereço do “Ver todos” de cima. Escreva <code>{COUNT_TOKEN}</code> onde vai o número de peças: ele é preenchido quando o destino é uma página de coleção do site; nos outros destinos o número sai do texto. Carrossel sem “Ver todos” não ganha o card.</p>
        {(() => {
          const draft = global.doc.carouselEnd;
          const live = global.baseDoc.carouselEnd;
          const label = draft?.label ?? DEFAULT_CAROUSEL_END_LABEL;
          return (
            <form action={saveCarouselEndAction} className="mt-4 space-y-4">
              <input type="hidden" name="rev" value={String(global.record?.rev ?? "null")} />
              <label className="flex min-h-10 items-center gap-2 text-[0.9375rem] font-semibold">
                <input type="checkbox" name="carousel_end" defaultChecked={Boolean(draft)} disabled={!owner} data-testid="carousel-end" />
                Mostrar o card no fim dos carrosséis
              </label>
              <div className="max-w-md">
                <label className="a-label" htmlFor="carousel_end_label">Texto do card</label>
                <input id="carousel_end_label" name="carousel_end_label" className="a-input" defaultValue={label} maxLength={MAX_CAROUSEL_END_LABEL} disabled={!owner} data-testid="carousel-end-label" />
                <p className="a-muted mt-1 text-[0.8125rem]">Fica assim: “{carouselEndText(label, 128)}” com o número, ou “{carouselEndText(label)}” sem ele.</p>
              </div>
              <p className="text-[0.875rem]" data-testid="carousel-end-live"><strong>Na loja agora:</strong> {live ? `card “${live.label}” no fim dos carrosséis` : "desligado"}.{JSON.stringify(draft ?? null) !== JSON.stringify(live ?? null) && " O rascunho tem outra escolha: publique a configuração global em Publicar."}</p>
              {owner ? <button type="submit" className="a-btn" data-testid="save-carousel-end">Salvar rascunho do card</button> : <p className="a-muted">Só o owner altera.</p>}
            </form>
          );
        })()}
      </section>

      <section id="meu-pequeno-mundo" className="a-card scroll-mt-4 p-5" aria-labelledby="mundo-title" data-testid="mundo-setting">
        <h2 id="mundo-title" className="a-h2">Meu Pequeno Mundo · todas as regiões</h2>
        {(() => {
          const servidor = modoMundoServidor();
          const draft = global.doc.mundo?.modo;
          const live = global.baseDoc.mundo?.modo;
          const acima = (m: MundoModo) => MUNDO_MODOS.indexOf(m) > MUNDO_MODOS.indexOf(servidor);
          return (
            <>
              <p className="a-muted mt-1 max-w-3xl text-[0.9375rem]">Liga e desliga a experiência sem deploy. O servidor continua sendo o limite: o painel só abre até onde a variável <code>MEU_PEQUENO_MUNDO</code> permite (hoje: <strong>{MUNDO_ROTULO[servidor]}</strong>). Para o painel decidir tudo, a variável fica em <code>on</code>.</p>
              <form action={saveMundoAction} className="mt-4 space-y-4">
                <input type="hidden" name="rev" value={String(global.record?.rev ?? "null")} />
                <fieldset className="flex flex-wrap gap-3">
                  <legend className="sr-only">Estado do Meu Pequeno Mundo</legend>
                  {MUNDO_OPCOES.map(([value, label, help]) => {
                    const bloqueado = value !== "segue" && acima(value);
                    return (
                      <label key={value} className="flex max-w-xs cursor-pointer gap-2 border border-black/20 p-3 has-[:checked]:border-black has-[:checked]:bg-white">
                        <input type="radio" name="mundo_modo" value={value} defaultChecked={(draft ?? "segue") === value} disabled={!owner || bloqueado} className="mt-1" data-testid={`mundo-modo-${value}`} />
                        <span><span className="block font-bold">{label}</span><span className="a-muted block text-[0.8125rem]">{bloqueado ? "O servidor não permite: a variável MEU_PEQUENO_MUNDO está abaixo disso." : help}</span></span>
                      </label>
                    );
                  })}
                </fieldset>
                <p className="text-[0.875rem]" data-testid="mundo-live"><strong>Na loja agora:</strong> {MUNDO_ROTULO[modoEfetivo(servidor, servidor === "off" ? undefined : live)]}.{(draft ?? null) !== (live ?? null) && " O rascunho tem outra escolha: publique a configuração global em Publicar."}</p>
                <p className="a-muted text-[0.8125rem]">Ao publicar, as páginas das regiões são refeitas: o bloco da home, o convite e o link aparecem ou somem na próxima visita, junto com a página.</p>
                {owner ? <button type="submit" className="a-btn" data-testid="save-mundo">Salvar rascunho</button> : <p className="a-muted">Só o owner altera.</p>}
              </form>
            </>
          );
        })()}
      </section>

    </div>
  );
}

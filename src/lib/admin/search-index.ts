/**
 * The panel's search ("Buscar no painel", ⌘K): a CURATED index of the panel's pages and of the main blocks inside them, with the words people use to
 * look for them ("frete", "banner", "cor", "cupom"…), so a feature is found without knowing on which screen it lives. Pure (no I/O, no React): the
 * sidebar component, the tests and anything else share it.
 *
 * Each entry points at a page of the panel and, when the feature is a block of that page, at the block's DOM id (`anchor`); the component scrolls
 * there and highlights it. `{region}` in an anchor is the region being edited (blocks drawn per region, e.g. `theme-sul`). Order matters: on an
 * equal score the entry that comes first wins, so each page is listed before its blocks and the most asked-for blocks come first.
 */

export type AdminSearchEntry = {
  /** What the result says. */
  title: string;
  /** Where it lives, shown under the title ("Aparência", "Tema da INK"…). */
  where: string;
  href: `/admin${string}`;
  /** DOM id of the block on that page; `{region}` = the region being edited. Absent = the top of the page. */
  anchor?: string;
  /** The words people search with (pt-BR, accents optional): synonyms, singular forms, what the feature does. */
  keywords: readonly string[];
  /** Only the owner sees it (the same rule as the sidebar). */
  ownerOnly?: true;
};

export const ADMIN_SEARCH_INDEX: readonly AdminSearchEntry[] = [
  // ── Visão geral ──
  { title: "Visão geral", where: "Painel", href: "/admin", keywords: ["inicio", "resumo", "painel", "dashboard"] },
  { title: "O que pede atenção", where: "Visão geral", href: "/admin", anchor: "atencao", keywords: ["pendencias", "problemas", "alertas", "avisos"] },

  // ── Conteúdo ──
  { title: "Home", where: "Conteúdo", href: "/admin/home", keywords: ["pagina inicial", "secoes", "secao", "ordem das secoes", "vitrine", "vitrines", "carrossel"] },
  { title: "Tema da home", where: "Home", href: "/admin/home", anchor: "tema-da-home", keywords: ["tema", "editorial", "original", "trocar tema", "usar na loja", "visual da home"] },
  { title: "Adicionar seção", where: "Home", href: "/admin/home", anchor: "nova-secao", keywords: ["nova secao", "criar secao", "carrossel de produtos", "grade de produtos", "uma penca", "campanha", "grade de imagens"] },
  { title: "Páginas de estado", where: "Conteúdo", href: "/admin/estados", keywords: ["estado", "estados", "pagina do estado", "uf"] },
  { title: "Seções da página do estado", where: "Páginas de estado", href: "/admin/estados", anchor: "estado-secoes", keywords: ["secoes do estado"] },
  { title: "Categorias e subcategorias do estado", where: "Páginas de estado", href: "/admin/estados", anchor: "estado-categorias", keywords: ["categorias", "subcategorias", "hierarquia", "liga desliga categoria"] },
  { title: "O Pódio", where: "Páginas de estado", href: "/admin/estados", anchor: "podio", keywords: ["podio", "mais vendidos", "ranking", "quem esta no podio", "mais vestidos"] },
  { title: "Páginas", where: "Conteúdo", href: "/admin/paginas", keywords: ["hotpage", "landing", "pagina", "categoria pai", "campanha", "dia dos pais", "natal"] },
  { title: "Nova página", where: "Páginas", href: "/admin/paginas", anchor: "nova-pagina", keywords: ["criar pagina", "nova hotpage"] },
  { title: "Menu", where: "Conteúdo", href: "/admin/navegacao", keywords: ["navegacao", "menu do topo", "cabecalho", "header"] },
  { title: "Coleções no menu", where: "Menu", href: "/admin/navegacao", anchor: "menu-colecoes", keywords: ["menu de colecoes", "categorias do menu", "topo"] },
  { title: "Descrições das coleções no menu", where: "Menu", href: "/admin/navegacao", anchor: "descricoes-colecoes", keywords: ["descricao", "texto da colecao"] },
  { title: "Seções da home na barra do topo", where: "Menu", href: "/admin/navegacao", anchor: "links-secoes", keywords: ["links do menu", "atalhos"] },
  { title: "Menu do celular", where: "Menu", href: "/admin/navegacao", anchor: "nav-blocks", keywords: ["mobile", "celular", "blocos do menu", "comprar", "outras regioes"] },
  { title: "Mídia", where: "Conteúdo", href: "/admin/midia", keywords: ["banner", "banners", "imagem", "imagens", "foto", "fotos", "upload", "enviar imagem", "biblioteca"] },

  // ── Catálogo ──
  { title: "Coleções", where: "Catálogo", href: "/admin/colecoes", keywords: ["colecao", "colecoes da ink", "habilitar colecao", "colecao interna", "pagina da colecao"] },
  { title: "Personalização", where: "Catálogo", href: "/admin/personalizacao", keywords: ["personalizacao", "personalizar", "personalizado", "localidade", "caneca", "canecas", "lendas", "modelo personalizado", "nome na camiseta"] },
  { title: "Novo modelo de personalização", where: "Personalização", href: "/admin/personalizacao", anchor: "novo", keywords: ["criar modelo", "novo modelo"] },
  { title: "Seção de personalização na home", where: "Home", href: "/admin/home", anchor: "nova-secao-personalizacao", keywords: ["localidade", "personalizacao na home", "chamada para personalizar", "personalizar a minha", "secao de personalizacao"] },
  { title: "Solicitações", where: "Atendimento", href: "/admin/personalizacao/solicitacoes", keywords: ["pedidos de personalizacao", "solicitacao", "fila", "atendimento", "clientes"] },

  // ── Marketing ──
  { title: "Cupons e promoções", where: "Marketing", href: "/admin/promocoes", keywords: ["cupom", "cupons", "promocao", "promocoes", "desconto", "ver cupons", "levemais"] },
  { title: "Faixa do topo", where: "Marketing", href: "/admin/faixa", keywords: ["faixa", "barra do topo", "letreiro", "aviso", "mensagem do topo", "tarja"] },
  { title: "Cores da faixa", where: "Faixa do topo", href: "/admin/faixa", anchor: "faixa-cores", keywords: ["cor da faixa"] },
  { title: "Como as mensagens da faixa aparecem", where: "Faixa do topo", href: "/admin/faixa", anchor: "faixa-estilo", keywords: ["passando", "uma de cada vez", "rotacao"] },
  { title: "Tracking", where: "Marketing", href: "/admin/tracking", keywords: ["pixel", "meta", "facebook", "ga4", "google analytics", "analytics", "rastreamento", "id do pixel"] },
  { title: "IDs efetivos por região", where: "Tracking", href: "/admin/tracking", anchor: "ids-efetivos", keywords: ["ids", "conferir pixel"] },

  // ── Configuração ──
  { title: "Aparência", where: "Configuração", href: "/admin/aparencia", keywords: ["visual", "estilo"] },
  { title: "Cores do tema", where: "Aparência", href: "/admin/aparencia", anchor: "theme-{region}", keywords: ["cores", "cor", "paleta", "cores da regiao", "cor do header", "cor do menu", "cor de destaque", "fundo da pagina"] },
  { title: "Cores da marca (paleta global)", where: "Aparência · todas as regiões", href: "/admin/aparencia", anchor: "theme-global", keywords: ["global", "use origens", "herdar", "marca"] },
  { title: "Cores das páginas sem região", where: "Aparência · catálogo geral", href: "/admin/aparencia", anchor: "theme-neutral", keywords: ["cores sem regiao", "paginas sem regiao", "paleta neutra", "catalogo geral", "regioes", "cores da entrada"] },
  { title: "Botão nos cards de produto", where: "Aparência · todas as regiões", href: "/admin/aparencia", anchor: "botao-cards", keywords: ["botao", "card", "cards", "ver produto", "carrinho no card", "comprar"] },
  { title: "Meu Pequeno Mundo", where: "Aparência · todas as regiões", href: "/admin/aparencia", anchor: "meu-pequeno-mundo", keywords: ["mundo", "pequeno mundo", "experiencia"] },
  { title: "Tema da INK", where: "Configuração", href: "/admin/tema-ink", keywords: ["ink", "loja ink", "pagina de produto da ink", "compra"] },
  { title: "Onde aplicar o tema da INK", where: "Tema da INK", href: "/admin/tema-ink", anchor: "ink-onde-aplicar", keywords: ["checkout", "carrinho", "pagamento", "pagina de produto", "pdp", "conta", "login", "entrar", "pedidos", "rastreio"] },
  { title: "Cores do carrinho e do checkout", where: "Tema da INK", href: "/admin/tema-ink", anchor: "ink-aparencia", keywords: ["cores do carrinho", "cores do checkout", "botao principal", "finalizar compra", "fonte", "cantos"] },
  { title: "Incentivo de frete grátis no carrinho", where: "Tema da INK", href: "/admin/tema-ink", anchor: "ink-incentivo", keywords: ["frete gratis", "frete", "incentivo", "falta 1 peca", "pecas", "entrega gratis"] },
  { title: "Sincronização", where: "Configuração", href: "/admin/sincronizacao", keywords: ["sincronizar", "sync", "atualizar catalogo", "catalogo", "atualizar colecoes"] },
  { title: "Sincronizar a loja da região", where: "Sincronização", href: "/admin/sincronizacao", anchor: "sincronizar-loja", keywords: ["sincronizar catalogo", "sincronizar colecoes"] },
  { title: "Pessoas", where: "Configuração", href: "/admin/usuarios", keywords: ["usuarios", "editores", "acesso", "convidar"], ownerOnly: true },

  // ── Publicar ──
  { title: "Publicar", where: "Painel", href: "/admin/publicar", keywords: ["publicacao", "colocar no ar", "subir", "rascunho"] },
  { title: "Esperando publicação", where: "Publicar", href: "/admin/publicar", anchor: "esperando", keywords: ["pendente", "o que falta publicar"] },
  { title: "Lançamento público da região", where: "Publicar", href: "/admin/publicar", anchor: "lancamento", keywords: ["lancar", "lancamento", "abrir regiao"] },
  { title: "Configuração global", where: "Publicar · todas as regiões", href: "/admin/publicar", anchor: "global", keywords: ["publicar global"] },
];

export const MAX_ADMIN_RESULTS = 8;

/** Lower case, no accents, words separated by single spaces ("Promoções!" → "promocoes"). */
export const normalizeSearch = (text: string): string =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** How well `field` answers `q` (both normalized): equal, starts with it, or has it at the start of a word. 0 = no. */
function phrase(field: string, q: string, [equal, start, word]: readonly [number, number, number]): number {
  if (field === q) return equal;
  if (field.startsWith(q)) return start;
  return ` ${field}`.includes(` ${q}`) ? word : 0;
}

/**
 * Score of an entry for a normalized query: how well the whole query answers the title, plus the best keyword, plus the page name (so "cores" puts
 * "Cores do tema", whose keyword is exactly "cores", above "Cores da faixa"). When no field has the whole query, every word of it must start a word
 * somewhere in the entry (any order: "frete carrinho"), with a small score.
 */
export function scoreEntry(entry: AdminSearchEntry, q: string): number {
  const title = normalizeSearch(entry.title);
  const keywords = entry.keywords.map(normalizeSearch);
  const where = normalizeSearch(entry.where);
  const best = phrase(title, q, [120, 100, 70]) + Math.max(0, ...keywords.map((k) => phrase(k, q, [90, 60, 40]))) + phrase(where, q, [30, 20, 10]);
  if (best > 0) return best;
  const words = ` ${[title, ...keywords, where].join(" ")}`;
  return q.split(" ").every((w) => words.includes(` ${w}`)) ? 5 : 0;
}

export type AdminSearchResult = { entry: AdminSearchEntry; href: string };

/** The best entries for `query` (at most `MAX_ADMIN_RESULTS`), with the link resolved for the region being edited. Empty query = nothing. */
export function searchAdmin(query: string, { region, owner = false }: { region: string; owner?: boolean }): AdminSearchResult[] {
  const q = normalizeSearch(query);
  if (q.length === 0) return [];
  return ADMIN_SEARCH_INDEX.map((entry, order) => ({ entry, order, score: entry.ownerOnly && !owner ? 0 : scoreEntry(entry, q) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, MAX_ADMIN_RESULTS)
    .map(({ entry }) => ({ entry, href: entry.anchor ? `${entry.href}#${entry.anchor.replace("{region}", region)}` : entry.href }));
}

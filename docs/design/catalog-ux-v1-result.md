# Catalog UX V1: resultado da rodada

Data: 12/10/2026. Branch `feature/catalog-ux-v1`, a partir da `main` em `e3566fb` (PR #68). Só commits locais: nada foi enviado, mergeado ou publicado; o Worker da INK não foi tocado.
Revisão inicial em [`catalog-ux-v1-review.md`](catalog-ux-v1-review.md). Capturas em [`screenshots/catalog-ux-v1/antes/`](screenshots/catalog-ux-v1/antes/) (produção, 11/10) e [`screenshots/catalog-ux-v1/depois/`](screenshots/catalog-ux-v1/depois/) (build de produção local, `next build` + `next start`, dados locais).

## 1. Principais decisões

1. **Card de estilo = card de produto.** O card da cidade (`FamilyCard`) virou dado puro (`src/lib/catalog/family-card.ts`) desenhado por `FamilyCardView` com a MESMA moldura de `ProductCard` (bloco com borda, foto, nome, contexto, preço). O card do hero da home também usa essa moldura. Favorito continua em cima; compartilhar ficou em segundo plano (translúcido, alvo de 44 px mantido). O botão global "Comprar" do CMS continua valendo onde o dono ligou.
2. **Trilho de peças em uma linha, com sticky discreto.** No desktop os 10 chips cabem numa linha em 1440 px; abaixo disso o trilho rola de lado com fade. Ao rolar a grade, o trilho gruda sob o header (52/60 px) como uma faixa de 56 px, no celular também. Legenda viva sob o trilho: "7 estilos em Oversized. Toda a grade mudou para essa peça."
3. **Abas no servidor, grades sob demanda.** `CityGarmentTabs` deixou de usar `useSearchParams` (que forçava o fallback só no cliente, com deslocamento na hidratação). A página sai do servidor com a camiseta clássica; `?peca=` é lido depois da hidratação e escrito com a History API. As outras peças viajam como dados compactos e cada grade é montada na primeira escolha (e fica montada depois).
4. **Coleção automática como PLP.** Cabeçalho compacto (213 px desktop, ~154 px celular) com o total de produtos ao lado do título; filtros Peça / Estado / Cidade / Estilo e ordenação por preço sobre o snapshot, via `/api/colecoes`, sem URL nova (canonical e `noindex` intactos). A página de uma categoria-pai publicada pelo dono mantém o hero dela.
5. **Home mobile: título → busca → produto.** O texto de apoio e a contagem vão depois dos cards no celular; no desktop nada muda além da moldura dos cards.
6. **Menu:** o dropdown de estados chama-se "Estados" (era "Regiões", ao lado de "Sul ▾", que troca de região); o link "Estados" da home sai da barra quando o dropdown existe; no celular "Categorias" lê em duas colunas e as outras regiões viram chips. O restante é curadoria no CMS (seção 5).
7. **Overlays:** banner de cookies mais baixo (uma frase, botões de 44 px); botão de cupom de 48 px no celular, que se recolhe ao rolar para baixo e volta ao rolar para cima ou no topo.

## 2. O que mudou por superfície

| Superfície | Antes | Depois |
|---|---|---|
| Home | hero: régua, título, texto, busca, contagem, cards | celular: título, busca, cards, texto + contagem; cards na moldura do store |
| Cidade | 10 botões em duas linhas (desktop) / 1,5 chip (celular); guia de medidas em linha própria; 10 grades no HTML; abas só no cliente | título + guia na mesma linha; trilho de chips (1 linha, scroll, fade), sticky; legenda; 1 grade no HTML; abas SSR |
| Coleção automática | hero de 430 px; só busca por texto; 24 por página | cabeçalho de 213/154 px com total; busca + filtros + ordenação; paginação mantida |
| Menu | "Regiões ▾" (estados) + "Sul ▾" (regiões); 12 categorias em coluna no celular | "Estados ▾"; categorias em 2 colunas; regiões em chips |
| Cookies | 2 linhas + 2 botões (~150 px no celular) | 1 frase + 2 botões (~103 px) |
| Cupom | 56 px fixo, sempre visível | 48 px no celular; some ao rolar para baixo, volta ao rolar para cima |

## 3. Filtros implementados (`src/lib/search/collection-filter.ts`)

- **Peça** (INK `product_type`; um design de cidade é a camiseta clássica, pela mesma regra das abas de peça), **Estado**, **Cidade** (só depois de escolher o estado: uma coleção regional tem mais de mil cidades; a busca por texto já acha uma pelo nome e apelidos), **Estilo** (família).
- **Ordenação:** ordem da coleção, menor preço, maior preço. Sem "mais vendidos" (não há dado de venda por produto exposto).
- Facetas contadas sobre os cards que passam pelos OUTROS filtros (escolher SC estreita as cidades, mas não esconde PR/RS). Uma faceta com uma opção só não aparece ("Da Nossa Terra" só tem peça única e ordenação).
- `GET /api/colecoes/<região>/<slug>?q=&peca=&uf=&cidade=&estilo=&ordem=` devolve `{ total, items (≤ 60), facets }`; `force-dynamic`, cache de CDN de 5 min; nada consulta a INK.
- Desktop: barra de selects acima da grade + "Limpar filtros". Celular: botão "Filtrar · N" abre sheet com chips (ou lista, acima de 12 opções), "Limpar filtros" e "Ver N produtos". Estado dos filtros fica no componente: a URL não muda, não nascem combinações indexáveis.
- Origem do clique: `colecao_filtro` (novo em `SOURCES`) quando o card veio de filtro/ordenação sem texto; `colecao_busca` continua para a busca.

## 4. Componentes consolidados

- `src/components/catalog/ProductCard.tsx` exporta `cardFrame`, `CARD_INFO`, `CARD_NAME`, `CARD_FOOT`, `CardTags`.
- `FamilyCardView` (cliente) + `FamilyGridView` desenham os modelos de `family-card.ts`; `FamilyGrid` (servidor) continua a API usada pela home, pela PDP ("Outros estilos") e pela cidade sem peças. `FamilyCard.tsx` foi removido.
- `RegionHero` usa a mesma moldura nos três cards.
- `CollectionSearch` virou `CollectionBrowser` (busca + filtros + ordenação).
- `PageHero` ganhou `compact` + `aside`; `ProductGrid` ganhou `compact` (título do grid menor quando o cabeçalho da página já nomeia a coleção).
- `.chip` em `globals.css` (chips de filtro).

## 5. Menu: o que o dono publica no CMS (sem código)

Em **Coleções → Menu de coleções** do Sul (e depois Norte e Centro-Oeste):

1. **Não exibir** as coleções de estado "Rio Grande do Sul", "Santa Catarina" e "Paraná": elas já estão em "Estados ▾" e no bloco "Estados do Sul" do celular (hoje aparecem duas vezes).
2. **Não exibir** "10/10" em Categorias enquanto a campanha estiver como link no topo (hotpage): aparecia como categoria e no topo.
3. **Topo:** no máximo 2 ou 3 coleções comerciais (sugestão: Seu Lugar, Da Nossa Terra, Novidades). As demais ficam só em Categorias.
4. Em **Navegação**, manter o bloco "Comprar" com a campanha vigente e Canecas; quando a campanha acabar, tirar o link.

Com isso o menu percebido fica: Estados · Categorias · Comprar (campanha, Canecas) · Sul ▾ (regiões) · Meus Lugares · Buscar. A navbar da INK recebe o mesmo menu por `/api/navbar`, mas o Worker ainda ignora `url`/`moreLabel` e escreve "Regiões"/"Demais categorias" (pendência registrada em `estado-da-loja.md` §7.2).

## 6. PDP da INK (Worker): só documentação

Lido em `use-origens-workers-release/src/loader/header-nav.js` e `promo-fab.js`, nada alterado nem publicado:

- O `promo-fab` da INK já recua acima do `#add-to-cart-mob` e do `.cookie-acceptance` e some com carrinho/modal/menu/teclado; as abas WhatsApp e Ajuda já desviam do aviso de cookies. O que sobra no celular é a soma de quatro elementos (cookies da INK, cupom, WhatsApp, Ajuda) nos primeiros segundos.
- Recomendação para uma rodada própria do Worker: (a) no celular, esconder o cupom enquanto o aviso de cookies da INK estiver visível (mesmo gatilho que o storefront passa a ter ao rolar); (b) renomear "Regiões" → "Estados" e "Demais categorias" → rótulo do CMS, e honrar `url` do payload (abre as páginas de coleção do site); (c) logo mobile de 48 px pode cair para 40 px para o header ficar com a altura do nativo.
- CTA sticky de compra: **não implementar**. O CTA fixo `#add-to-cart-mob` é da INK, e o `promo-fab` já mede e desvia dele; um segundo CTA fixo conflitaria com o controlador nativo de variantes.

## 7. Screenshots antes/depois

| Página | Antes | Depois |
|---|---|---|
| Home 1440 | `antes/home-sul-desktop-1440.png` | `depois/home-sul-desktop-1440.png` |
| Home 390 | `antes/home-sul-mobile-390.png` | `depois/home-sul-mobile-390.png` |
| Cidade 1440 | `antes/cidade-floripa-desktop-1440.png` | `depois/cidade-floripa-desktop-1440.png`, `depois/cidade-floripa-oversized-desktop-1440-scrolled.png` (trilho sticky) |
| Cidade 390 / 375 | `antes/cidade-floripa-mobile-390.png`, `-375.png` | `depois/cidade-floripa-mobile-390.png`, `-375.png`, `depois/cidade-floripa-oversized-mobile-390-scrolled.png` |
| Coleção 1440 | `antes/colecao-da-nossa-terra-desktop-1440.png` | `depois/colecao-da-nossa-terra-desktop-1440.png`, `depois/colecao-filtros-desktop.png` (Seu Lugar: SC + Ponto de Origem + menor preço) |
| Coleção 390 | `antes/colecao-da-nossa-terra-mobile-390.png` | `depois/colecao-da-nossa-terra-mobile-390.png`, `depois/colecao-filtros-sheet-mobile*.png`, `depois/colecao-filtros-mobile-aplicado.png` |
| Menu | `docs/screenshots/estado-da-loja/mobile-menu.png`, `desktop-categorias.png` | `depois/menu-mobile-390.png`, `depois/menu-desktop-categorias.png` |

Os "depois" vêm do build local: o CMS local não tem as seções da home de produção (campanha, Canecas, hotpage), e só 8 cidades têm índice de peças (Florianópolis, Tijucas, Curitiba, Porto Alegre, Joinville, Blumenau, Caxias do Sul, Londrina, montado a partir das páginas de produção).

## 8. Medições

Primeira foto de produto (topo, px), viewport 1440×900 e 390×844:

| Página | Antes 1440 | Depois 1440 | Antes 390 | Depois 390 |
|---|---|---|---|---|
| Home | 208 | 194 | 461 | 334 |
| Cidade (com abas) | 664 | 604 | 549 | 513 |
| Coleção automática | 728 | 561 | 528 | 464 |

HTML da página da cidade (Florianópolis, `curl`, sem gzip):

| | Antes (produção) | Depois (build local) |
|---|---|---|
| Documento | 367 KB | 245 KB |
| Payload RSC (`self.__next_f`) | 288 KB | 162 KB |
| DOM antes do payload | 72 KB | 76 KB |
| Grades de peça no HTML | 10 (80 cards) | 1 (8 cards) |

Banner de cookies no celular: ~150 px → ~103 px. Menu mobile local (Comprar + 11 categorias + 3 estados): 697 px de lista, cabe numa tela.
A home de produção (645 KB) não é comparável com a local (422 KB): o CMS local tem menos seções.

## 9. Testes executados

- `tsc --noEmit`: ok. `eslint .`: 0 erros (10 avisos já existentes, fora desta rodada).
- `vitest run`: 107 arquivos, 1.381 testes passando (15 novos em `cards-and-collection-search.test.ts`: facetas, filtros, ordenação, parse da query).
- `next build` (SITE_CONFIG_HOME=on): ok (os 42 avisos de Edge Runtime já existem na `main`).
- E2E da vitrine (`playwright.config.ts`, CMS off): `city-garment-tabs`, `sul`, `mobile-menu`, `share-size-guide`, `tracking-and-nav`, `global-search`, `seo` = 142 testes, 138 passando; as 4 falhas são as já conhecidas da `main` (página do estado no celular; 3 testes do dropdown "Sul"). Testes ajustados: rótulo "Estados", link "Estados" fora da barra, copy do banner, largura do card do hero.
- E2E novo `playwright.catalog-ux.config.ts` (CMS on, dados locais): 14 testes passando: trilho em uma linha, só a grade clássica no HTML, grade montada ao escolher, `?peca=` restaurado, sticky sob o header, 390 px sem overflow, GoToInk exatamente uma vez com `city_styles`; cabeçalho compacto e canonical/noindex; filtros desktop (estado + estilo + preço, limpar volta à paginação) e sheet no celular; home mobile (título → busca → card → texto); banner de cookies ≤ 120 px e some após a escolha; cupom recolhe ao rolar e volta; menu em duas colunas; "Estados" no header.
- Scripts de QA: `scripts/qa/catalog-ux-capture.mjs` (capturas) e `scripts/qa/catalog-ux-interactions.mjs` (menus e filtros).

## 10. Limitações restantes

- O botão de cupom, parado, ainda cobre o canto do primeiro card da esquerda no celular antes de rolar (grades de duas colunas não deixam canto livre). Alternativa a decidir pelo dono: mover para o canto inferior direito no site (na INK ele fica à esquerda por causa do WhatsApp/Ajuda).
- Facetas de peça dependem de `garmentTypeId` no merch: entra com o `catalog:sync` (o snapshot de produção já traz; o local foi ressincronizado nesta rodada).
- Resultados filtrados mostram no máximo 60 cards (como a busca); a mensagem pede para refinar.
- Filtros não ficam na URL (decisão: sem combinações indexáveis); um link não leva os filtros.
- O `?peca=` de um link compartilhado troca a grade logo depois da hidratação (um instante com a clássica).
- Norte e Centro-Oeste não foram capturados (sem índice de peças local); o código é o mesmo e os testes de região (`playwright.regions.config.ts`) não foram rodados.
- `garments:sync` real não serve para QA local (1.608 páginas na loja Sul, as mais novas são produtos migrados sem canônico); ver memória do projeto.

## 11. Commits locais

Ver `git log main..feature/catalog-ux-v1`:

1. cidade: card de estilo unificado, trilho de peças sticky, grades sob demanda;
2. coleção: cabeçalho compacto, filtros e ordenação;
3. home: primeira dobra no celular e cards na moldura do store;
4. menu: "Estados", categorias em duas colunas;
5. overlays: cookies compactos e cupom que se recolhe;
6. testes, scripts de QA, capturas e documentação.

## 12. Recomendação

**Pode ir para produção** (depois do push/PR e da revisão do dono): cidade, coleção, home, overlays, menu de código. São mudanças de apresentação sobre dados que já existem; tracking, consentimento, checkout e Worker ficaram intactos. Antes de publicar: rodar "Sincronizar coleções agora" se ainda não foi (o `collectionPage` lê a lista completa) e fazer a curadoria do menu no CMS (seção 5).

**Não ir agora / decidir antes:** posição do botão de cupom (seção 10); qualquer mudança no Worker (seção 6) é uma rodada separada com gate próprio.

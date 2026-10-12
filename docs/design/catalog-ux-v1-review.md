# Catalog UX V1: revisão antes da rodada

Data: 11/10/2026. Produção conferida em `www.useorigens.com.br` (Sul), desktop 1440×900 e celular 390×844 / 375×812, com o código da `main` em `e3566fb`.
Capturas do "antes" em [`screenshots/catalog-ux-v1/antes/`](screenshots/catalog-ux-v1/antes/) (geradas por `scripts/qa/catalog-ux-capture.mjs`).

## 5 maiores fricções de compra

1. **Página da cidade: parede de 10 botões de peça.** No desktop a fileira quebra em duas linhas (`cidade-floripa-desktop-1440.png`); no celular só 1,5 chip aparece e o "Guia de medidas" ocupa uma linha inteira antes dos cards (`cidade-floripa-mobile-390.png`). O primeiro produto só entra em y≈550 px no celular. As abas são montadas só no cliente (`useSearchParams` força o fallback), com deslocamento de layout na hidratação, e o HTML carrega 10 grades completas no payload RSC (288 KB de 367 KB).
2. **Página de coleção: hero de 430 px sem função comercial.** O primeiro card aparece em y≈730 px no desktop e y≈530 px no celular (`colecao-da-nossa-terra-*.png`). Não há como filtrar por peça, estado, cidade ou estilo, nem ordenar por preço: só a busca por texto e 24 por página.
3. **Overlays no celular cobrem o que vende.** Banner de cookies (≈150 px) + botão de cupom (56 px, canto inferior esquerdo) cobrem o preço do primeiro card da cidade e da coleção (`mobile-390` de todas as páginas). Na PDP da INK somam-se WhatsApp, "Ajuda?" e o banner de cookies da própria INK.
4. **Cards diferentes por superfície.** Hero (moldura dourada, sombra), cidade (sem moldura, régua dourada, descrição, coração + compartilhar empilhados em dois círculos brancos) e coleção (moldura cinza, nome + contexto + preço). Mesmo produto, três leituras. Os dois botões redondos sobre cada card da cidade pesam no celular.
5. **Menu com duplicidades.** "Regiões ▾" lista estados (PR, SC, RS) enquanto "Sul ▾" troca de região; "Categorias" mistura coleções editoriais com as coleções de estado e "10/10"; no celular o menu tem 4 blocos e ~20 linhas (`mobile-menu.png` em `estado-da-loja`).

## 5 mudanças de maior impacto

1. **Cidade:** trilho horizontal compacto de peças (uma linha, scroll com fade), sticky discreto abaixo do header ao rolar a grade, legenda "N estilos em {peça}", guia de medidas na linha do título. Abas no servidor (sem Suspense/fallback) e painéis das outras peças montados só ao serem escolhidos, a partir de dados compactos.
2. **Coleção:** cabeçalho compacto na página automática (produto na primeira dobra) + filtros Peça / Estado / Cidade / Estilo + ordenação por preço, sobre o snapshot, via `/api/colecoes` (sem consulta à INK, sem URL nova).
3. **Cards:** um só sistema (`ProductCard` frame) para cidade, coleção, home e hero; compartilhar em segundo plano; favorito mantido.
4. **Overlays:** banner de cookies mais baixo; cupom some ao rolar para baixo e volta ao rolar para cima, nunca sobre preço/CTA.
5. **Home mobile:** título → busca → produto; texto de apoio depois dos cards.

## Screenshots antes

| Página | Desktop | Celular |
|---|---|---|
| Home Sul | `home-sul-desktop-1440.png` (1º produto y=208) | `home-sul-mobile-390.png` (y=461) |
| Cidade Florianópolis | `cidade-floripa-desktop-1440.png` (y=664) | `cidade-floripa-mobile-390.png` (y=549) |
| Coleção Da Nossa Terra | `colecao-da-nossa-terra-desktop-1440.png` (y=728) | `colecao-da-nossa-terra-mobile-390.png` (y=528) |
| PDP INK | `../screenshots/estado-da-loja/ink-pdp-desktop.png` | `../screenshots/estado-da-loja/ink-pdp-mobile.png` |

Resultado da rodada: [`catalog-ux-v1-result.md`](catalog-ux-v1-result.md).

## O que será alterado nesta rodada

- `src/components/catalog/CityGarmentTabs.tsx`, `FamilyCard.tsx`, `FamilyGrid.tsx`, `src/app/[region]/[uf]/[city]/page.tsx`: trilho, sticky, legenda, painéis sob demanda, card unificado.
- `src/components/catalog/ProductCard.tsx`, `RegionHero.tsx`: sistema de card e hierarquia de favorito/compartilhar.
- `src/components/home/PageHero.tsx`, `HomeSections.tsx`, `src/lib/pages/public.ts`: cabeçalho compacto da coleção automática.
- `src/components/catalog/CollectionSearch.tsx` (→ filtros), `src/lib/search/collection-filter.ts`, `src/app/api/colecoes/[region]/[slug]/route.ts`: filtros e ordenação.
- `src/components/home/RegionHero.tsx`: primeira dobra no celular.
- `src/components/layout/SiteChrome.tsx`, `MobileMenu.tsx`: rótulo do seletor de estados e densidade do menu; curadoria do CMS documentada.
- `src/components/consent/ConsentBanner.tsx`, `src/components/promotions/PromoWidget.tsx`: overlays.
- Worker da INK: só documentação (nada publicado).

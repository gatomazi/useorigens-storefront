# QA integrado final do `/sul`

Executa `CLAUDE_SUL_INTEGRATED_FINAL_QA.md`. A migração para mesorregiões editoriais (ADR 0004) está encerrada;
nenhuma alteração geográfica foi feita nesta rodada além de uma correção pontual descrita abaixo.

## 1. Auditoria de implementação

| Item | Status | Componente / rota |
|---|---|---|
| Ordem da home: Hero → 8 jeitos → Da Nossa Terra → Estados → Redesenhos → Feito Para Você → Fala daqui → O número de cada região → Campanha → Footer | **IMPLEMENTADO** | `src/app/[region]/page.tsx` (comentário de ordem na linha 30 confere com o JSX; confirmado visualmente nas capturas `01-home-full-375.png` / `02-home-full-1440.png`) |
| Hero: busca prioritária, Ponto de Origem/Feito Em/Coordenadas como protagonistas, paisagem só como background, headline/subtexto atualizados, sem menção a DDD | **IMPLEMENTADO** (com 1 regressão corrigida à parte, ver §2) | `src/components/home/RegionHero.tsx` |
| 8 modelos em grade coerente, sem card "destaque" maior, sem espaços vazios | **IMPLEMENTADO** | `src/components/catalog/FamilyGrid.tsx` — grid uniforme 2/3/4 colunas, usado na home (`#estilos`) e na página de cidade |
| Estados em accordion no mobile, um aberto por vez; banner dentro do estado expandido; sem carrossel horizontal | **IMPLEMENTADO** | `src/components/home/StateCards.tsx` — `<details name="estados-mobile">` nativo (single-open); banner via `BannerBackground` dentro do próprio `<details>` (capturas `13-home-estados-expandido-rs-375.png`, `14-home-estados-single-open-check-375.png`) |
| Da Nossa Terra com produtos reais da categoria | **IMPLEMENTADO** | `src/lib/editorial/terra.ts` + `src/lib/home.ts` (`terra`) |
| Redesenhos/Releituras como seção própria, curadoria real, não misturada às 8 famílias-base | **IMPLEMENTADO** | `src/lib/editorial/recreations.ts`, seção `#redesenhos` com frame poster próprio |
| Feito Para Você exibe a linha Lenda, não personalizáveis de mapa/cidade | **IMPLEMENTADO** | `src/lib/editorial/lenda.ts`, seção `#feito-para-voce` |
| Fala daqui antes de DDD | **IMPLEMENTADO** | `src/app/[region]/page.tsx` — `#fala` (linha 117) precede `#geografia` (linha 141) no DOM |
| "Ver todos" com URL real verificada; sem inventar destino para agrupamento sem categoria única (DDD) | **IMPLEMENTADO** | `src/lib/editorial/collections.ts` — Terra/Feito Para Você/Redesenhos/Fala daqui com link real verificado ao vivo; DDD deliberadamente sem link, com a razão documentada no próprio arquivo |
| Banners nunca soltos: hero/campanha/estado/cidade como background da própria seção; header de estado/cidade não atrasa busca/estilos; PDP prioriza produto/preço/CTA | **IMPLEMENTADO** | `RegionHero.tsx`, `Campaign.tsx`, `[uf]/page.tsx`, `[city]/page.tsx`, `[family]/page.tsx` — todos usam `RegionalPhotoSection`/`BannerBackground` como fundo de seção (ADR 0003); PDP confirmado com título/preço/CTA agrupados (captura `06-pdp-pato-branco-375.png`) |
| Mesorregiões com nomes naturais e "N cidades" (plural correto), nunca apresentadas como divisão oficial vigente | **IMPLEMENTADO**, com **1 REGRESSÃO** encontrada e corrigida | ver §2 — a PDP (`[family]/page.tsx`) ainda lia o campo antigo `city.area` ("Região de Cascavel") em vez de `city.meso` |

Nenhum item ficou **PARCIAL** ou **AUSENTE**. Duas regressões pontuais foram encontradas (não relacionadas à
classificação acima em si, mas a texto que deveria ter acompanhado mudanças já aprovadas) — ver §2.

## 2. Problemas encontrados e correções feitas

Apenas bugs/regressões inequívocos foram corrigidos, com o teste correspondente atualizado onde fazia sentido.
Nenhuma seção foi redesenhada e nenhuma estratégia editorial foi alterada.

### 2.1 PDP ainda mostrava a divisão antiga ("Região de X") — REGRESSÃO

A página de produto (`src/app/[region]/[uf]/[city]/[family]/page.tsx`) não estava na lista de rotas verificadas
pelo comando anterior de reversão para mesorregiões (`CLAUDE_MESOREGION_EDITORIAL_NAVIGATION.md`), e continuou
lendo `city.area` (a divisão IBGE 2017 atual) em vez de `city.meso` (a mesorregião editorial). Resultado ao vivo:
`/sul/pr/pato-branco/ponto-de-origem` mostrava **"Paraná · Região de Cascavel"**.

- **Corrigido**: trocado para `city.meso`, mesmo padrão usado na página de cidade, busca e página de estado.
  Agora mostra **"Paraná · Sudoeste Paranaense"**.
- Antes/depois: `16-regressao-pdp-antes.png` → `06-pdp-pato-branco-375.png` (ou `10-pdp-pato-branco-1440.png`).
- Nenhum teste cobria esse texto especificamente; não havia teste para "consertar" — o bug não tinha cobertura,
  o que é o próprio motivo de ele ter passado despercebido. A auditoria estrutural (curl/grep em todas as rotas
  do QA anterior) não pegou porque a PDP não estava entre as rotas verificadas naquele momento.

### 2.2 Diálogo de busca ainda dizia "De qual Sul você é?" — REGRESSÃO

Em um turno anterior desta sessão, o usuário pediu explicitamente para trocar "de qual sul você é" pelo novo
headline "O SEU LUGAR, DO SEU JEITO." — a troca foi feita no H1 do hero (`RegionHero.tsx`), mas o mesmo texto
também aparecia como rótulo dentro do modal de busca (`SearchDialog.tsx`, linha 69) e não foi atualizado junto.

- **Corrigido**: `src/components/search/SearchDialog.tsx` agora usa "O seu lugar, do seu jeito." no rótulo do
  modal, com um comentário apontando a origem do texto para evitar nova dessincronia.
- Antes/depois: `17-regressao-busca-antes.png` → `11-busca-aberta-375.png`.
- Nenhum teste do repositório dependia da string antiga (confirmado por busca em `tests/`), então nada quebrou.

### 2.3 Comentários de documentação desatualizados (não visível ao usuário)

- `RegionHero.tsx`: o JSDoc do componente ainda citava "De qual Sul você é?" como o nome do hero. Corrigido.
- `Campaign.tsx`: o JSDoc citava uma ordem de seções antiga (pré `CLAUDE_HOME_LENDA_ORDER_VIEW_ALL.md`).
  Corrigido para referenciar o comentário de ordem oficial em `page.tsx`, evitando nova duplicação que
  desatualiza sozinha.

### 2.4 Investigado e descartado: imagens aparentemente em branco no carrossel "Fala daqui" (1440px)

A primeira captura full-page em 1440px (via `page.screenshot({ fullPage: true })`) mostrou 3 de 6 cards do
carrossel "Fala daqui" com a área de imagem em branco. Investigação:

- Um scroll real (passo a passo, como um usuário faria) e nova captura mostraram todos os cards carregados
  corretamente (`15-fala-daqui-after-real-scroll-1440.png`).
- As URLs das imagens envolvidas foram testadas diretamente via `curl` e retornaram `200` com bytes de imagem
  válidos.
- Conclusão: **não é bug**. É um artefato do método de captura full-page do Playwright, que não força o
  carregamento nativo (`loading="lazy"`) de imagens ainda fora da área de interseção no momento da captura.
  Um usuário real, rolando a página normalmente, nunca veria esse estado.

Pelo mesmo motivo, um segundo teste script (rolagem vertical completa, sem interação horizontal no carrossel)
reportou 7 imagens do carrossel "O número de cada região" (DDD) como não carregadas — todas mais adiante no
scroll *horizontal* do próprio carrossel, nunca alcançadas pelo script. Também confirmado via `curl` que as
URLs resolvem normalmente (200, JPEG válido). É o comportamento esperado de lazy-loading nativo em conteúdo de
carrossel horizontal ainda não navegado — não uma falha de carregamento real.

### 2.5 Investigado e descartado: header sticky sobre conteúdo ancorado

Verificado especificamente o caso de abrir um link com hash direto (`/sul/sc#grande-florianopolis`, o mesmo
padrão usado pelos chips de mesorregião e pelo link "Ver toda a região" na página de cidade): o topo do
`<summary>` do grupo aberto fica a 85px do topo da viewport, contra 53px de altura do header sticky — sem
sobreposição (captura `18-anchor-scroll-check-375.png`).

## 3. QA visual mobile-first

Inspeção em 375, 430, 768 e 1440px:

- Varredura estrutural automatizada (Playwright) em `/sul`, `/sul/sc`, `/sul/rs`, `/sul/sc/tijucas` e uma PDP
  real (`/sul/pr/pato-branco/ponto-de-origem`) nos 4 breakpoints: **overflow horizontal: 0 em todos os 20
  pares rota×largura. Imagens quebradas: 0. Erros de console: 0.**
- Revisão visual seção a seção da home em 375px (capturas `03-home-01-hero` a `03-home-09-campanha`): sem
  cortes indevidos, sobreposição de camadas, contraste ruim ou cards despadronizados.
- Estado (`/sul/sc`), cidade (`/sul/sc/tijucas`) e PDP revisados em 375/768/1440: sem espaçamento excessivo,
  header nunca atrasa a busca/estilos, título+preço+CTA da PDP ficam num bloco só.
- Busca aberta e menu mobile aberto revisados (capturas `11-busca-aberta-375.png`, `12-menu-mobile-aberto-375.png`):
  áreas de toque ≥44px (`min-h-11`), foco automático no campo de busca, alto contraste no menu (branco sobre preto).

Nenhuma falha visual real encontrada além das duas regressões de texto já corrigidas (§2.1, §2.2).

## 4. Board de capturas

Em `docs/design/screenshots/sul-integrated-final/`:

| Arquivo | Conteúdo |
|---|---|
| `01-home-full-375.png` | Home completa, 375px |
| `02-home-full-1440.png` | Home completa, 1440px |
| `03-home-01-hero-375.png` … `03-home-09-campanha-375.png` | Cada seção da home, 375px, numeradas na ordem real de exibição |
| `04-estado-sc-375.png` | `/sul/sc`, 375px |
| `05-cidade-tijucas-375.png` | `/sul/sc/tijucas`, 375px |
| `06-pdp-pato-branco-375.png` | PDP real, 375px |
| `07-estado-sc-768.png`, `08-estado-sc-1440.png` | `/sul/sc` em 768 e 1440px |
| `09-cidade-tijucas-768.png` | `/sul/sc/tijucas`, 768px |
| `10-pdp-pato-branco-1440.png` | PDP real, 1440px |
| `11-busca-aberta-375.png` | Modal de busca aberto, 375px |
| `12-menu-mobile-aberto-375.png` | Menu mobile aberto, 375px |
| `13-home-estados-expandido-rs-375.png` | Accordion "Estados" com RS expandido (banner + mesorregiões + produto do estado) |
| `14-home-estados-single-open-check-375.png` | Confirmação de single-open: abrir Paraná fecha Rio Grande do Sul |
| `15-fala-daqui-after-real-scroll-1440.png` | "Fala daqui" após scroll real (ver §2.4) |
| `16-regressao-pdp-antes.png` | PDP **antes** da correção §2.1 ("Região de Cascavel") |
| `17-regressao-busca-antes.png` | Busca **antes** da correção §2.2 ("De qual Sul você é?") |
| `18-anchor-scroll-check-375.png` | Verificação de header sticky sobre âncora (ver §2.5) |

## 5. Decisões visuais pendentes

Nenhuma. Tudo que foi encontrado nesta rodada foi um bug objetivo (texto desatualizado ou campo errado), já
corrigido, ou um falso positivo investigado e descartado com evidência. Não há alternativa de design para o
usuário decidir neste momento.

## 6. Resultados de testes

Todos executados após as correções de §2.1–2.3:

- `npx tsc --noEmit --incremental false` — limpo, sem erros.
- `npx eslint src tests` — limpo, sem erros.
- `npx vitest run` — **55/55 testes passando** (4 arquivos).
- `npx playwright test` — **38/38 testes passando**.
- `npx next build` — build de produção concluído com sucesso (único aviso pré-existente e não relacionado:
  "Failed to find font override values for font `Big Shoulders`", já presente antes desta sessão).

## 7. Estado atual do LCP mobile (sem otimizações especulativas)

Medido contra o **build de produção** (`next build` + `next start`, porta 3100), sem nenhuma mudança de
performance aplicada — este número é só um retrato do estado atual, conforme pedido.

**Lighthouse (mobile, throttling simulado padrão — 4G lento simulado + CPU 4×), rota `/sul`:**

| Métrica | Valor |
|---|---|
| Largest Contentful Paint | **5.3 s** |
| First Contentful Paint | 2.3 s |
| Speed Index | 9.3 s |
| Total Blocking Time | 470 ms |
| Cumulative Layout Shift | 0 |
| Time to Interactive | 6.0 s |
| Performance score | **0.57** |

Para referência, uma segunda medição via CDP (Chrome DevTools Protocol) com throttling mais leve (CPU 4×, rede
~4 Mbps / 150 ms de latência, sem a simulação de rede móvel completa do Lighthouse) deu números bem menores —
**LCP ~1.3 s** em `/sul`, ~650 ms em `/sul/sc/tijucas`, ~620 ms na PDP — o que mostra que boa parte do 5.3s do
Lighthouse vem do perfil de rede/CPU simulado (mais pessimista), não de um travamento real do app. Os dois
números estão aqui para dar o quadro completo; nenhuma otimização foi tentada — isso é matéria para um comando
à parte, se for do interesse.

## 8. Escopo respeitado

- Nenhum banner novo gerado, nenhum asset alterado.
- Nenhuma escrita na INK (apenas leitura, como já era).
- `/norte`, `/centro-oeste` e `/` não foram tocados nem iniciados.
- Nenhum commit, nenhum push.
- As duas correções feitas (§2.1, §2.2) são bugs/regressões inequívocos de texto — nenhuma seção foi
  redesenhada, nenhuma estratégia editorial mudou, nenhum recurso novo foi adicionado.

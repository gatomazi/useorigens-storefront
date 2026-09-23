# `/sul` — rodada noturna: estabilização do funil e QA mobile

Relatório da rodada executada a partir de `CLAUDE_RODADA_NOTURNA_STOREFRONT.md`. Complementa (não substitui) os
relatórios das rodadas anteriores (Meta Pixel, INK direto, Regiões, consentimento, estados). **Nenhum commit,
push ou deploy foi feito** — tudo abaixo está na working tree, pronto para revisão.

Datas: medições e capturas em 2026-09-22/23. Máquina compartilhada, sob carga alta e variável durante toda a
sessão (`uptime` chegou a reportar load average 15–17 em alguns momentos) — isso é relevante para a seção de
performance e para a leitura de qualquer número de tempo abaixo.

---

## 1. Resumo executivo

- **P0 (funil real de ponta a ponta): verde.** Os quatro eventos (`PageView`, `Search`, `SelectCity`,
  `GoToInk`) foram exercitados de ponta a ponta com Pixel mockado (nunca real) e, num achado não planejado,
  **dois bugs reais foram encontrados e corrigidos** (não apenas testados): o botão "Rejeitar" do banner de
  consentimento estava com texto invisível (preto sobre fundo escuro), e o carrossel "Ver todos" estava sendo
  clicado no lugar do produto num teste (bug do teste, não do produto — mas revelou a necessidade de um
  seletor mais específico).
- **P1 (atribuição de campanha): auditado, não implementado.** O storefront hoje não captura, persiste nem
  repassa `utm_*`/`fbclid` — gap documentado na seção 4, deliberadamente não resolvido nesta rodada (ver
  justificativa).
- **P1 (QA de navegação/estados): verde**, com evidência em screenshot e teste automatizado.
- **P2 (performance mobile): um bug real confirmado e corrigido** (o background do hero carregava `lazy`, sem
  `fetchPriority`, por causa de uma depreciação do Next.js 16 que este código não tinha acompanhado). A
  medição absoluta de LCP não é confiável nesta sessão por causa da carga da máquina — ver seção 5 para os
  números e o motivo exato de não confiar neles isoladamente.
- **Testes**: `tsc`, ESLint, 112 testes unitários e 73 testes E2E — todos verdes, com o histórico de
  instabilidade (e as causas raiz reais de cada uma) documentado na seção 6.
- **Build de produção**: limpo com e sem `NEXT_PUBLIC_META_PIXEL_ID`.

---

## 2. O que mudou nesta rodada (além das rodadas anteriores)

| Arquivo | Mudança |
|---|---|
| `src/app/globals.css` | **Bug corrigido**: `.btn-ghost` define `color: var(--ink)` (preto), que vencia a utility `text-white` do botão "Rejeitar" do banner de consentimento por ordem de cascata (independente da ordem das classes no JSX) — o texto ficava invisível sobre o fundo escuro do banner. Adicionada uma regra `.btn-ghost.text-white { color: #fff }` de especificidade maior. |
| `src/components/banners/BannerBackground.tsx` | **Bug corrigido**: o background do hero (e de qualquer banner que use este componente) carregava com `loading="lazy"` e sem `fetchPriority`, mesmo passando `priority`. Causa raiz: o Next.js 16 **depreciou a prop `priority`** em favor de `preload`, e `getImageProps()` (diferente do componente `<Image>`, que ainda tem um fallback de compatibilidade) simplesmente ignora `priority` — confirmado no HTML final servido (nenhum `fetchpriority`/`loading=eager` no `<img>`, e nenhum `<link rel=preload>` correspondente). Corrigido replicando o padrão já usado em `ProductPhoto.tsx`: `loading`/`fetchPriority` setados explicitamente no elemento renderizado, sem depender do comportamento automático (depreciado) de nenhuma das duas props. |
| `playwright.config.ts` | `webServer.env` agora define `NEXT_PUBLIC_META_PIXEL_ID` (valor de produção, não segredo) para que os testes E2E exercitem o caminho real de carregamento do Pixel (antes, todo teste rodava com a env var ausente, tornando trivial — não uma prova real — a asserção de "zero requisições ao Meta"). |
| `tests/e2e/tracking-and-nav.spec.ts` | Arquivo novo desta rodada anterior, com **5 correções de teste** aplicadas agora (detalhes na seção 6) e **3 testes novos**: fluxo de aceite (`PageView` único, `consent`/`init`/`track` corretos), navegação após aceite (mais um `PageView`, nunca em abrir/fechar modal) e revogação via rodapé (`fbq('consent','revoke')`, sem replay). |
| `tests/e2e/sul.spec.ts` | `openHeroSearch` (helper pré-existente) ganhou retry-on-stall: o índice de busca (`/api/cidades/sul`) é buscado sob demanda e, sob carga pesada, ocasionalmente não respondia dentro do timeout do teste — não era falha do produto, mas o teste não tinha proteção. Agora espera a resposta real da rede e, se ela nunca chega, reabre o diálogo uma vez (o `loadIndex` do próprio componente já limpa o cache em caso de falha, permitindo nova tentativa). |
| `.env.example`, `docs/deploy/railway.md` | `NEXT_PUBLIC_META_PIXEL_ID` documentada (pendente desde a rodada anterior). |
| `docs/screenshots/2026-09-23/` | Capturas em 375/1440px: home, banner de consentimento (antes e depois do fix), diálogo de busca, menu Regiões aberto, menu mobile, página de estado (RS), página de cidade (Bagé). |
| `docs/design/lighthouse/2026-09-23/` | Duas medições brutas de Lighthouse mobile (`sul-mobile-run1.json`, `run2.json`) para comparação com o baseline de 2026-09-21. |

---

## 3. P0 — funil de ponta a ponta: evidência

### 3.1 Jornada real (código + screenshot; navegação de fato só testada via Playwright, não em navegador manual)

Home → aceitar/rejeitar → pesquisar (ex.: "floripa"/"tij") → selecionar cidade → página da cidade → clicar em
um estilo (Ponto de Origem/Feito Em/Coordenadas) → URL real da INK, mesma aba, sem popup.

Confirmado em **três cidades reais**, uma por estado, exatamente como pedido:

| Cidade | Estilo testado | Destino real | Variantes | Comportamento |
|---|---|---|---|---|
| Bagé/RS | Ponto de Origem | `https://www.usesul.com.br/usesul/product/bage-origem-rs` | 1 (direto) | Clique vai direto à INK, sem PDP intermediária |
| Tijucas/SC | Ponto de Origem | `https://www.usesul.com.br/usesul/product/tijucas-origem-sc` | 1 (direto) | Idem, coberto por teste automatizado (`sul.spec.ts`, `tracking-and-nav.spec.ts`) |
| Pato Branco/PR | Ponto de Origem | — | >1 (mantém PDP interna) | Corretamente **não** pula a PDP — há mais de uma variante real, então a escolha (`VariantPicker`) é uma decisão legítima, não um passo extra |

Confirmado via `curl` no HTML servido (não apenas no código-fonte) que o link de Bagé não tem `target`
(mesma aba) e que a URL bate exatamente com o que a INK retornou (`storeProductUrl`), nunca concatenada.

### 3.2 `PageView`

- Fonte única: `MetaPixel.tsx`, guardado por um `lastTracked` (ref) comparado com a URL atual — dispara no
  `<Script onLoad>` OU no efeito de troca de rota, nunca os dois (qualquer um que rode primeiro "vence", o
  outro vira no-op pelo mesmo guard).
- **Teste novo** (`tracking-and-nav.spec.ts`): aceitar consentimento em uma rota já aberta dispara exatamente
  um `PageView`, sem replay retroativo de nada anterior à aceitação.
- **Teste novo**: uma navegação real subsequente (SPA, cidade → cidade) dispara exatamente mais um; abrir e
  fechar o diálogo de busca (client-side, sem navegação) **não** dispara nenhum.
- `fbq('consent','grant')` e `fbq('init', id)` confirmados disparando exatamente uma vez cada, no aceite.

### 3.3 `Search`

- Dispara só no gesto conclusivo: submit (Enter) ou seleção de uma sugestão — nunca por tecla digitada.
- **Teste**: 10 caracteres digitados sem submeter → zero `Search`.
- **Teste**: busca resolvida por clique numa sugestão → exatamente um `Search` **e** um `SelectCity` (mesmo
  gesto, conforme o contrato do adendo).

### 3.4 `SelectCity`

- Dispara só em escolha explícita de cidade — nunca em chegada direta por URL/reload.
- **Teste**: clique numa cidade da listagem por mesorregião da página de estado → exatamente um `SelectCity`,
  zero `Search` (é uma escolha, não uma busca).
- **Teste**: mesma cidade acessada direto por URL → zero `SelectCity`.

### 3.5 `GoToInk`

- Ponto compartilhado confirmado: os 5 carrosséis da home (Da Nossa Terra, Redesenhos, Feito Para Você, Fala
  daqui, DDD) passam pelo **mesmo** `<a onClick>` em `ProductCarousel.tsx` — instrumentado uma única vez.
- Inventário completo dos pontos de disparo (todos com `sourceSection` próprio):

  | `sourceSection` | Onde | Componente |
  |---|---|---|
  | `home_terra`, `home_redesenhos`, `home_feito_para_voce`, `home_fala`, `home_ddd` | Home, 5 carrosséis | `ProductCarousel` |
  | `state_showcase` | Página de estado, vitrine "Destaques" | `ProductCarousel` |
  | `city_styles` | Página de cidade, grid de estilos (sem variantes) | `FamilyCard` → `TrackedInkLink` |
  | `city_fala` | Página de cidade, "Fala de {cidade}" | `TrackedInkLink` |
  | `city_localities` | Página de cidade, "Lugares de {cidade}" | `TrackedInkLink` |
  | `pdp` | PDP, botão de compra do `VariantPicker` | `VariantPicker` |
  | `pdp_other_styles` | PDP, "Outros estilos" | `FamilyCard` → `TrackedInkLink` |

- **Testes**: um clique num card de cidade sem variantes, no CTA da PDP e num item do carrossel da home —
  cada um dispara exatamente um `GoToInk`, nunca `ViewContent`/`AddToCart`/`InitiateCheckout`/`Purchase`, e a
  navegação real (bloqueada só na camada de teste, nunca no produto) continua íntegra.

### 3.6 Consentimento

- **Teste**: sem decisão, zero requisição a `facebook.net`/`facebook.com/tr` durante uso normal (busca,
  navegação).
- **Teste**: rejeitar → banner some, zero requisição, decisão persiste após reload (banner não reaparece
  sozinho).
- **Teste novo**: aceitar → Pixel carrega (mockado, nunca real), `consent`/`init`/`PageView` corretos.
- **Teste novo**: revogar pelo rodapé ("Preferências de privacidade") → `fbq('consent','revoke')` disparado,
  banner reaparece para nova escolha, **zero eventos novos** depois disso (nem mesmo navegando).

### 3.7 Bug real encontrado: botão "Rejeitar" invisível

Durante a captura de screenshot do banner, o texto do botão "Rejeitar" não aparecia — nem cinza, ausente.
Verificado via `getComputedStyle`: `color: rgb(0,0,0)` (preto), sobre um fundo quase preto (`on-ink`). Causa:
`.btn-ghost` (definida em `globals.css`, depois do `@import "tailwindcss"`) define `color: var(--ink)`, e essa
regra vence a utility `text-white` do Tailwind por ordem de cascata — a ordem das classes no JSX não importa
para isso, só a ordem no CSS compilado. Corrigido com uma regra de maior especificidade
(`.btn-ghost.text-white { color: #fff }`). Confirmado visualmente antes/depois (screenshots
`consent-banner-1440.png` recapturado). Isso é uma correção real de acessibilidade/funil: um botão de recusa
ilegível vai contra o próprio espírito do banner mínimo de consentimento (recusa deve ser tão visível quanto
aceite).

---

## 4. P1 — atribuição de campanha (`utm_*`/`fbclid`): auditoria, gap documentado, nada implementado

**Auditoria (código lido, não hipótese):**

- Nenhum arquivo do projeto lê, persiste ou repassa `utm_source`, `utm_medium`, `utm_campaign`,
  `utm_content`, `utm_term` ou `fbclid` hoje (`grep -rl "utm_\|fbclid" src/` não retorna nada).
- `src/proxy.ts` (middleware) não redireciona nem reescreve query strings — um visitante chegando em
  `/sul?utm_source=meta&fbclid=...` mantém esses parâmetros na primeira resposta.
- Mas nenhum componente os lê, e a **navegação client-side do Next.js entre rotas não carrega query string de
  uma URL para outra automaticamente** — então, sem código dedicado, esses parâmetros somem assim que a
  pessoa faz a primeira ação real (buscar, clicar numa cidade). Hoje eles sobrevivem, na prática, só enquanto
  a pessoa fica exatamente na URL de pouso.
- `purchaseUrl()` (`src/lib/catalog/commerce.ts`) retorna a URL da INK exatamente como veio do snapshot, sem
  nenhuma manipulação de query string.

**Por que não implementei o repasse nesta rodada:** o próprio comando autoriza esse caminho explicitamente —
"se a persistência ou o repasse depender de comportamento não confirmado da INK, documentar exatamente a
lacuna". Não há nenhuma visibilidade neste projeto sobre como a PDP/checkout da INK reage a parâmetros extras
na query string (se preserva, ignora ou eventualmente rejeita). Construir uma captura+persistência
(sessionStorage) e um repasse (`URLSearchParams.append`, nunca sobrescrevendo o que a INK já tiver) é tecnica-
mente simples e de baixo risco de *quebrar* a navegação — mas eu não teria como confirmar que isso de fato
**melhora a atribuição do lado da INK**, e a instrução é explícita em não inventar suporte a parâmetros que a
INK possa descartar. Prefiro entregar isso como uma auditoria honesta e um gap nomeado a uma implementação que
eu não consigo verificar.

**Recomendação para revisão humana:** se a atribuição de campanha for prioridade, o próximo passo de baixo
risco é confirmar com o time da INK (ou inspecionar uma URL de produto real com esses parâmetros manualmente)
se query params extras sobrevivem ao carregamento da PDP deles; só então vale implementar a captura/persistência
do lado do storefront.

---

## 5. P1 — QA de navegação, estados e catálogo

- **Menu "Regiões"** (topo, desktop e mobile): leva a rotas geográficas reais (`/sul/rs`, `/sul/sc`,
  `/sul/pr`, "Ver estados"), nunca mais à categoria de DDD. Confirmado em screenshot
  (`regioes-menu-1440.png`, `mobile-menu-375.png`) e teste automatizado.
- **Dropdown "Sul"** (trocador de região): fecha em clique fora, `Escape` (com foco de volta ao trigger),
  seleção e mudança de rota — comportamento novo desta rodada anterior, revalidado aqui. Continua funcionando
  junto com o dropdown "Regiões" sem conflito (um clique dentro do painel "Regiões", fora de um link, mantém o
  painel aberto — testado).
- **Páginas de estado (RS/SC/PR)**: vitrine "Destaques de {estado}" com produtos reais, preço real, link real
  — nunca "Mais vendidas" (`totalSalesCount` não tem período/data conhecidos, então nunca é exposto
  publicamente como ranking, só usado como sinal interno de curadoria). Confirmado em screenshot
  (`state-rs-1440.png`) e teste (heading correto, ausência do texto "Mais vendidas", posição acima do
  navegador de mesorregiões).
- **Homepage, busca, 3 estados, 1 cidade por estado, 1 PDP**: conferidos via screenshot em 375/1440px
  (`docs/screenshots/2026-09-23/`). PDP continua acessível direto por URL e nunca é um passo obrigatório
  entre a cidade e a INK (confirmado no código e no teste "mantém PDP quando há mais de uma variante real").
- **Sem banner isolado nem espaço vazio grande**: confirmado visualmente nas capturas de página inteira (RS,
  Bagé) — nenhuma seção quebrada ou vazia.

---

## 6. Testes e build

### 6.1 Resultado final

- `tsc --noEmit`: limpo.
- `eslint .`: limpo.
- `vitest run`: **112/112** testes unitários.
- `playwright test`: **73/73** testes E2E, estável em **4 execuções completas consecutivas** após as
  correções abaixo (as duas primeiras tiveram falhas reais de teste, corrigidas; a quinta execução teve 2
  falhas que **não se repetiram** nas duas execuções seguintes — ver 6.3).
- `next build`: limpo com `NEXT_PUBLIC_META_PIXEL_ID` ausente **e** presente (produção).

### 6.2 Bugs de teste reais encontrados e corrigidos (não bugs de produto)

1. **Corrida de hidratação**: vários testes clicavam num elemento dependente de JS (botão de busca) logo
   após `page.goto(url, { waitUntil: "domcontentloaded" })` — que resolve assim que o HTML é parseado, antes
   da hidratação do React terminar. Corrigido trocando para o `waitUntil` padrão (`load`), replicando o
   padrão já usado com sucesso em `sul.spec.ts` (`openHeroSearch`).
2. **`page.route(...).abort()` não evita o *unload* do documento**: para provar que um clique em GoToInk não
   sai do localhost, o primeiro approach abortava a requisição de rede — mas mesmo abortada, o Chromium ainda
   tenta a navegação de topo e substitui o documento por uma página de erro, o que apagava um array
   `window.__fbqCalls` antes do teste conseguir lê-lo de volta (~50% das vezes, confirmado empiricamente com
   execuções repetidas isoladas). Corrigido de duas formas combinadas: (a) capturar as chamadas via
   `page.exposeFunction` num array do lado do Node, que sobrevive ao unload; (b) impedir o `preventDefault()`
   da navegação num listener de `click` em fase de captura (`document.addEventListener("click", ..., true)`),
   que roda antes do handler do React e nunca chama `stopPropagation`, então o `onClick` real do React
   continua disparando normalmente — sem nunca precisar abortar a requisição de rede.
3. **Seletor errado no teste do carrossel da home**: `#terra a.group` capturava o link "Ver todos" (que
   também tem a classe `group` e vem antes no DOM), não um card de produto — por isso o teste via zero
   chamadas de `GoToInk`. Corrigido para `#terra ul a.group`, escopando ao `<ul>` de itens.
4. **Enter na busca antes do índice carregar**: `/api/cidades/{region}` carrega sob demanda; digitar e
   apertar Enter imediatamente podia resolver contra uma lista de resultados ainda vazia (`choose(undefined)`
   é um no-op silencioso — nenhuma navegação acontece). Corrigido esperando por uma sugestão real antes do
   Enter.
5. **Timeout de instabilidade sob carga**: sob a carga muito alta desta máquina (confirmada via `uptime`,
   chegando a 15–17), a busca pelo índice de cidades ocasionalmente não respondia dentro da janela do teste —
   não uma falha do produto (o próprio `loadIndex` já tem retry ao focar de novo), mas os testes não tinham
   essa proteção. Corrigido com um helper de retry-por-reabertura em `tracking-and-nav.spec.ts` e
   `sul.spec.ts`.

### 6.3 Flakiness residual (ambiental, documentado com honestidade)

Numa das 6 execuções completas da suíte E2E feitas ao longo desta rodada, **2 testes falharam por timeout**
num momento em que a máquina tinha carga muito alta (load average 13–17, mais processos Node de outro projeto
do usuário rodando em paralelo — confirmado via `ps aux`, não é nada que este trabalho tenha deixado
pendurado). As duas execuções seguintes, sob carga mais normal, passaram 73/73 de forma limpa e rápida
(48–56s, contra ~1.7min naquela execução específica). Isso foi tratado como ruído de máquina, não regressão —
mas fica documentado aqui em vez de omitido.

---

## 7. P2 — performance mobile (LCP)

### 7.1 Bug real confirmado e corrigido

O background do hero (`RegionHero` → `RegionalPhotoSection` → `BannerBackground`) é o elemento LCP da home
(confirmado pelo próprio Lighthouse, seção 7.2). Ele carregava com **`loading="lazy"` e sem
`fetchPriority`**, apesar do componente passar `priority` — confirmado direto no HTML final servido (não
suposição):

```html
<!-- antes -->
<img alt="" width="2048" height="768" decoding="async" ... src="/_next/image?url=%2Fbanners%2Fsul%2Fhero-desktop.png&w=3840&q=80" class="..."/>
<!-- nenhum fetchpriority, nenhum loading=eager, nenhum <link rel=preload> correspondente no <head> -->
```

**Causa raiz**: o Next.js 16 depreciou a prop `priority` em favor de `preload`
(`node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md`, linha 291–293). O componente
`<Image>` ainda honra `priority` por compatibilidade, mas `getImageProps()` — usado aqui para montar um
`<picture>` manual com arte direcionada mobile/desktop — **não tem esse fallback**: confirmado via um log
temporário que `getImageProps({ priority: true, ... }).props` retorna `loading: "lazy"` e nenhuma chave
`fetchPriority`. É exatamente o tipo de mudança quebrando comportamento silenciosamente que o próprio
`AGENTS.md` deste projeto avisa para checar contra a documentação local antes de escrever código.

**Correção**: replicado o padrão que `src/components/catalog/ProductPhoto.tsx` já usava corretamente — setar
`loading`/`fetchPriority` explicitamente no elemento renderizado, em vez de depender do comportamento
automático de qualquer uma das duas props (nenhuma delas tem efeito em `getImageProps`).

**Confirmado corrigido**, depois do fix, no HTML servido:
```html
<img alt="" loading="eager" width="2048" height="768" ... fetchPriority="high" class="..."/>
```

E confirmado no próprio Lighthouse pós-fix: o audit `largest-contentful-paint-element`, que **antes vinha
vazio** (Lighthouse não conseguia atribuir o elemento), agora aponta corretamente para
`section.relative > div.absolute > picture > img.absolute` com `fetchpriority="high"` visível no snippet.

**Não mexi** na prioridade dos outros ~10 preloads de alta prioridade já existentes na home (logo, 3 cards do
trio do hero, 2 primeiros itens de cada um dos 5 carrosséis) — isso é uma competição real por prioridade que
vale revisar, mas está fora do escopo explicitamente autorizado desta rodada ("sem refatoração ampla não
autorizada"). Fica registrado como risco/recomendação na seção 8.

### 7.2 Medição — por que o número absoluto não é confiável nesta sessão

| | Baseline (2026-09-21, `docs/design/lighthouse/sul-mobile.json`) | Run 1 (pós-fix) | Run 2 (pós-fix) |
|---|---|---|---|
| LCP | 3.5s | 5.0s | 4.3s |
| Element render delay (subpart) | — | 849ms | 44ms |
| Resource load duration (subpart) | — | 300ms | 36ms |

As duas execuções pós-fix, feitas em sequência, no mesmo build, no mesmo processo `next start` — **variam em
20x** num único subcomponente da métrica (element render delay: 849ms vs 44ms). Isso não é uma característica
do produto mudando entre uma chamada e outra; é ruído do modo de *simulated throttling* do Lighthouse reagindo
à carga real e instável da CPU da máquina no momento da medição (`uptime` mostrava load average 15–17 durante
essas execuções — a mesma condição que já tinha causado flakiness nos testes E2E na seção 6.3). Uma terceira
execução, iniciada para ter uma mediana, **travou** (mesmo tempo de CPU em múltiplas checagens ao longo de
vários minutos) e foi abortada — mais uma evidência de quão hostil o ambiente estava no momento, não do app.

**Conclusão honesta**: o fix está confirmado correto no HTML (fetchPriority/preload aplicados onde deveriam
estar, elemento LCP corretamente atribuído pelo próprio Lighthouse). **Não dá para afirmar, com estes números,
se o LCP real melhorou, piorou ou ficou igual** em relação ao baseline de 3.5s — as condições de carga entre as
duas medições não são comparáveis, e a variância interna das próprias medições desta sessão (20x num
subcomponente) já invalida qualquer leitura fina. Recomendo remedir num ambiente quieto (CI dedicado, ou esta
mesma máquina num momento de baixa carga) antes de reportar um número de LCP como fato para qualquer decisão.
Isso está sinalizado aqui em vez de "inventar um ganho", conforme a instrução explícita do comando.

---

## 8. Riscos e pontos para revisão humana

1. **Atribuição de campanha (UTM/fbclid) não implementada** — decisão deliberada, ver seção 4. Requer decisão
   de produto/confirmação do comportamento da INK antes de implementar.
2. **Competição de `fetchPriority="high"`**: a home tem ~10+ imagens marcadas como alta prioridade
   simultaneamente (logo, trio do hero, 2 primeiros itens de 5 carrosséis, agora + o background do hero).
   Isso dilui o sinal de prioridade do navegador. Não mexi nisso agora (fora do escopo autorizado), mas é
   plausível que seja parte do "atraso dominante" já diagnosticado antes — vale revisão dedicada.
3. **Medição de LCP não confiável nesta sessão** — ver seção 7.2. Precisa ser refeita num ambiente mais
   estável antes de qualquer decisão baseada em número.
4. **Confirmação real na Meta/INK**: tudo aqui foi validado com `fbq` mockado (nunca uma chamada real à
   Meta) e navegação real bloqueada só na camada de teste (nunca no produto em si). A validação final —
   Events Manager, Pixel Helper, confirmação de que o `PageView` cross-domain é esperado e que a INK nunca vê
   um evento comercial duplicado vindo do storefront — **depende de acesso que esta sessão não tem** e
   precisa ser feita manualmente pelo usuário num ambiente autorizado.
5. **Flakiness residual sob carga extrema** (seção 6.3): mitigado onde apareceu, mas a causa de fundo (a
   máquina fica ocasionalmente sob carga muito alta, inclusive de processos de outros projetos do usuário) não
   é algo que este trabalho pode corrigir — só tornar os testes mais resilientes a ela, o que foi feito nos
   pontos que efetivamente falharam.

---

## 9. Variáveis de ambiente (Railway)

Sem mudança na lista desde a rodada anterior — apenas a documentação de `NEXT_PUBLIC_META_PIXEL_ID` foi
completada nesta rodada (`.env.example`, `docs/deploy/railway.md`). Nenhum valor secreto neste relatório, nos
arquivos alterados ou nos screenshots.

## 10. Rollback

Nada foi implantado. Reverter esta rodada = descartar as mudanças não commitadas listadas na seção 2 (`git
checkout -- <arquivos>` / remover os arquivos novos). Nenhuma migração, nenhuma mudança de schema, nenhuma
alteração na INK.

---

**Aguardando revisão antes de qualquer commit, push ou deploy**, conforme a instrução da rodada.

# Plano: correções da análise de UX da loja

Spec: [spec.md](spec.md) (aprovada em 2026-11-13) · Status: approved (R9 retirado pelo dono)

## Como vai ser entregue

Cinco PRs, cada um com worktree própria a partir da `origin/main`. Nenhum é mergeado sem você validar **local**, em desktop (1440×900) e celular (390×844):

| PR | Repo | Branch | Cobre |
|---|---|---|---|
| 1 | storefront | `docs/analise-ux-loja` | R7, R12 (relatório, capturas, `specs/`) |
| 2 | storefront | `fix/ux-loja-rapidos` | R1, R2, R3, R4, R5 |
| 3 | storefront | `feature/busca-quis-dizer` | R6 |
| 4 | worker-lojas | `fix/ux-pdp-barra` | R8, R10 |
| 5 | storefront | `fix/host-sem-www` | R11 |

**Validação local (você faz antes de qualquer merge):**
- Site: um `next dev` por worktree (porta própria), com `data/generated` e `data/admin-dev` copiados. Abro duas janelas, desktop e celular, já nas páginas da mudança.
- Worker: `node scripts/preview-tema.mjs --headed` abre as duas janelas contra as páginas **reais** da INK, passando pelo Worker local (Miniflare). Os POSTs do checkout são bloqueados pelo próprio script, então nada de pedido nem cobrança.
- Cada PR leva capturas 1440 e 390 em `docs/screenshots/<feature>/` e `graphify update .` antes de abrir.

## O que a leitura do código mostrou

- **#19 (R7) não é defeito.** `GET /api/offer-popup/sul` responde `delaySeconds: 25`, não 8. Por isso o popup não abriu no meu teste de 10 s. O código também não espera aceite de cookies: só adia com menu, busca ou diálogo aberto, ou com a pessoa digitando. O `ConsentBanner` é `role="region"`, não diálogo, então não bloqueia. **Corrijo o relatório** (achado retirado).
- **#4 (borda dupla), causa:** `globals.css:948` põe `.search-input:focus-visible { outline: 2px solid; outline-offset: 8px }`, e o campo ainda tem `border-b-[3px]`. Quando o campo recebe foco aparecem o quadro e o sublinhado.
- **#6 (busca): `rank.ts` diz "sem busca por proximidade, de propósito: cidade errada é pior que nenhuma".** O desenho respeita isso: a proximidade só gera uma **sugestão** que a pessoa aceita, nunca resultados.
- **A busca do cabeçalho da INK usa a mesma `/api/busca`** (pelo `busca-gateway.js` do Worker, que só repassa campos conhecidos). Um campo novo na resposta não quebra nada, mas só aparece na INK quando o gateway passar a repassá-lo. Isso fica **fora** deste trabalho.
- **O checkout do Worker é "só CSS" de propósito** (`injectCssOnlyTheme`). Por isso o R9 foi retirado: o checkout não muda.
- **`storeName` só alimenta o texto** (`VariantPicker.tsx:138`). Não vai para analytics, então trocar é seguro. Há mais dois textos fixos com o nome da região: `privacidade/page.tsx:145` (mesmo erro, entra no PR 2) e `seo/copy.ts:102` (copy de SEO, vai para a lista de decisões).
- **Já existe `src/proxy.ts`** (convenção do Next 16), com a regra de host canônico e de `/admin`. O redirect do apex entra nele.

## Design por requisito

**R1 · `VariantPicker` + página da estampa + privacidade.**
O componente passa a receber `finishIn` (a frase pronta) no lugar de `storeName`: "Tamanho, cor, frete e pagamento você define {finishIn}." A página passa `checkoutStoreFor(region).finishIn`. Isso evita o "na loja na nossa loja online" que a troca direta do valor causaria. A privacidade usa o mesmo helper.

**R2 · `MeusLugaresView.tsx:133`.** O `Link` troca `link-line` pela classe `btn` que o site já usa nos CTAs.

**R3 · `GlobalSearch.tsx`.** O bloco "Não encontramos nada…" sobe para antes do link "Ver todos os produtos…". Com resultados nada muda, porque o bloco só existe sem resultados.

**R4 · `globals.css`.** Com foco, o sublinhado do campo fica transparente e o quadro (outline) continua. Assim aparece uma borda por vez e o indicador de foco segue forte (acessibilidade). Alternativa: tirar o quadro e engrossar o sublinhado, mas o foco fica mais fraco.

**R5 · `CustomizerForm.tsx` (modo estúdio).** No celular, a ordem passa a ser título → campo do sobrenome → prévia e cores, por classes `order-*`; a partir de `lg:` fica como hoje. O botão "Ver como ficou" (tela cheia, já existe sob o campo) cobre a prévia ao digitar. Contra: a prévia deixa de ficar sobre o campo. Alternativa: encolher a prévia, mas não leva o campo à primeira tela (hoje está a ~1.320 px).

**R6 · busca com "Você quis dizer…".**
- Novo `src/lib/search/suggest.ts`, função pura `suggestPlace(prepared, query)`.
- Distância de edição (com troca de letras vizinhas) limitada a 1 letra até 5 caracteres, a 2 acima disso. Sobre nomes e apelidos normalizados (sem acento) de **lugares** da região.
- Só sugere com um único melhor candidato; empate ou termo de até 3 letras = sem sugestão.
- `searchGlobal` ganha `suggestion?: string` (campo aditivo) e só o calcula quando `total === 0` e `others` está vazio.
- `GlobalSearch` mostra "Você quis dizer **X**?" como botão que refaz a busca com X.
- Falha ou nada perto: cai na mensagem de hoje.

**R7 · sem código.** Registro no relatório (achado retirado, com o `delaySeconds: 25`).

**R8 · Worker `theme-ui.js` + `theme.js`.**
- No celular com a casca da INK e o aviso `.cookie-acceptance` visível (o mesmo seletor que `promo-fab.js` e `assistant.js` já usam), um observador mede a altura do aviso e grava `--o-cookie-h` no `documentElement`.
- O CSS da barra (`theme.js` ~linha 407) ganha `bottom: var(--o-cookie-h, 0px)`.
- Sem aviso, a variável sai e a barra volta ao fundo.
- Alternativa descartada: esconder a barra enquanto o aviso estiver na tela. O primeiro controle de compra do fluxo fica a ~1.100 px, então o cliente ficaria sem botão.
- Risco: barra e aviso empilhados ocupam ~140 px do fundo. É o que a prévia vai mostrar.

**R9 · retirado.** O checkout fica como hoje (decisão do dono). O pedido de `autocomplete` e do teclado numérico no CEP vai para a INK.

**R10 · Worker, `theme-ui.js`.** (Desenho revisto depois da sonda de leitura na PDP real, 13/11.)
- A sonda mostrou que o formulário é Turbo e que o botão **já fica desabilitado** durante o envio (toque duplo já bloqueado pela INK); o rótulo vira só um spinner. A INK aceita `data-turbo-submits-with`.
- Então o R10 vira: o loader põe `data-turbo-submits-with="Adicionando…"` em `#add-to-cart-desk` e `#add-to-cart-mob`. O Turbo troca o rótulo no envio e o devolve ao fim (sucesso ou erro). Sem escutar eventos, sem interceptar o envio.
- Um atributo que a INK já tenha é respeitado; ao desligar o tema só os nossos saem.

**R11 · `src/proxy.ts` + função pura em `lib/seo/canonical-host.ts`.**
- `decideApexRedirect({ host, pathname, method })`: só se o host for exatamente o apex do `NEXT_PUBLIC_SITE_URL` (o domínio sem `www.`), método GET ou HEAD, e o caminho fora de `/api/**`, `/.well-known/**`, `/admin/**`, `/media/**`, `/troca-foto/**`, `/estampas/**` e `/_next/**`.
- Responde 301 para o mesmo caminho e query em `www`, e nunca para um host vindo da requisição (o destino sai do `siteUrl()`).
- Antes de escrever: **inventário** de quem usa o apex (MCP, OAuth, webhooks, feed do Merchant, catálogo Meta, `stores.js` do Worker, o formulário de busca da INK, `SHARED_DOMAIN` do cookie). O resultado vai no PR.
- A busca nativa da INK posta para o apex pela configuração do painel da INK: isso é do painel, não de código.
- Se o dono preferir regra no Cloudflare, o PR entrega só o texto da regra.

## Requisito → onde → como testa

| Req | Onde | Teste |
|---|---|---|
| R1 | `VariantPicker.tsx`, `[family]/page.tsx`, `privacidade/page.tsx` | unit: frase nos dois modos (loja única e multiloja) + captura |
| R2 | `MeusLugaresView.tsx` | captura 1440 e 390; e2e existente de Minhas Estampas continua verde |
| R3 | `GlobalSearch.tsx` | ordem dos blocos no teste da busca (DOM) + captura |
| R4 | `globals.css` | captura em foco e em repouso, 1440 e 390 |
| R5 | `CustomizerForm.tsx` | medição da posição do campo em 390 (< 1 tela) + captura 1440 sem mudança |
| R6 | `suggest.ts`, `global.ts`, `GlobalSearch.tsx` | unit (`florianopolsi`, `curitba`, termo sem par, ≤3 letras, empate, acento, só com zero resultados) + orçamento de tempo + captura |
| R7 | relatório | consulta ao endpoint registrada |
| R8 | `theme-ui.js`, `theme.js` | DOM test (jsdom, altura simulada) + prévia real `--headed` em 390 |
| R10 | loader da PDP | DOM test disparando `turbo:submit-start`/`submit-end`, com erro de rede; prévia real |
| R11 | `proxy.ts`, `canonical-host.ts` | unit da função pura (apex, www, `/api`, POST, query) + `curl -I` contra `next start` local com `Host:` forjado |
| R12 | `docs/qa/`, `docs/screenshots/analise-ux-2026-11-13/`, `specs/` | links relativos conferidos; PNGs comprimidos |
| R13 | cada PR | corpo em pt-BR, capturas, sem merge nem release |

## Riscos e o que mudaria com 10x

- **R6:** a comparação roda no servidor só quando a busca dá zero, sobre ~5,5 mil lugares, com saída rápida por diferença de tamanho. Com muito mais lugares ou tráfego, o passo seguinte é um índice por trigramas, sem mudar o contrato.
- **R11:** o risco é quebrar um cliente que chama o apex. Por isso o inventário vem antes e só páginas GET são redirecionadas.
- **Ordem no ar (quando você decidir):** o Worker (PR 4) e o redirect (PR 5) são independentes, porque o Worker só chama `/api/**`, que fica fora do redirect.

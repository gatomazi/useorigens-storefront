# Use Origens: rodada de conversão e guia na página de produto

Execução em **13/10/2026**. Tudo o que está aqui foi feito em branches e PRs abertos para revisão: **nada foi mergeado nem publicado** (nem no Railway, nem nos Workers da INK), por pedido do dono durante a rodada. As capturas de "antes" são de produção; as de "depois" são do código novo rodando contra as PDPs **reais** da INK (Worker local) e contra o storefront local com a rota nova. Capturas em [`screenshots/conversao-use-origens/`](screenshots/conversao-use-origens/) (nome = região-página-estado-viewport-antes/depois).

---

## 1. Resumo

**Problemas encontrados (auditoria em produção, 3 regiões, 4 viewports):**

1. Na página de produto da INK, no celular e na primeira visita, **quatro elementos fixos** disputam a base da tela (aviso de cookies da INK, botão de cupons, WhatsApp, Ajuda): o cupom **cobria o "R$" do preço** e, ao rolar até o CTA, cobria o título do bloco "Continue explorando" enquanto o aviso cobria os botões dele.
2. O caminho de quem caiu numa PDP errada era **sair da INK** para a vitrine (outro domínio) e recomeçar; a busca do bloco só levava a páginas do site, nunca a um produto.
3. **Todos os links do Worker para a vitrine usam `https://useorigens.com.br`, o host não canônico** (`x-robots-tag: noindex`; o canonical aponta para `www`). Consentimento, favoritos e espelho do carrinho ficam separados entre os dois hosts: quem aceitou cookies no `www` vê o banner de novo ao voltar da INK.
4. O cabeçalho da INK diverge do site: "Regiões" (site: "Estados"), "Demais categorias" (site: "Categorias"), links de coleção para a INK em vez das páginas do site; em **Norte e Centro-Oeste o menu de categorias da INK está vazio** (o menu de coleções não foi publicado no CMS dessas regiões).
5. Medição: `product_slug` da chegada à vitrine só aceitava os **5 slugs do piloto**, enquanto o loader já roda em todas as PDPs: a dimensão ficava vazia para o resto.
6. Nativo da INK (sem ajuste nesta rodada): faixa superior com duas mensagens **sobrepostas** (marquee), aviso de cookies cobrindo as cores no desktop, toast "Selecione o modelo" no topo enquanto o CTA está no fim.

**Mudanças implementadas:**

- **Guia na PDP** (`pdp-guide`, Worker, flag própria): convite "Procurando sua cidade ou outra estampa?" com **[Buscar uma cidade] [Ver outras estampas]** e, quando o produto é de cidade, **[Mais estampas de <cidade>]**; painel por toque (folha inferior no celular, diálogo no desktop) com busca de cidade + UF, até 3 estampas da cidade e até 8 coleções reais com 4 produtos cada; produto abre a PDP **na própria loja** (carrinho preservado); dispensa por 30 dias com reabertura discreta; estados de carregamento, vazio e erro; nova rota pública `/api/guia/<região>` no storefront.
- **Cupom** (Worker): recolhe no celular enquanto o aviso de cookies da INK está na tela e nunca cobre o preço nem os botões do guia.
- **Cabeçalho da INK** (Worker): "Estados", "Categorias" (renomeável pelo CMS) e links para as páginas de coleção do site quando o CMS as manda.
- **Medição** (storefront): qualquer slug com formato de catálogo passa no marcador de chegada; eventos `origens_guide_*` documentados.

**Estado de publicação:** local + PRs abertos. Storefront: branch `feature/guia-pdp-conversao`, [PR #70](https://github.com/gatomazi/useorigens-storefront/pull/70). Workers: branch `feature/pdp-guide`, [PR #21](https://github.com/gatomazi/worker-lojas/pull/21). Ordem de publicação quando aprovado: storefront primeiro, depois Worker loja a loja com `,pdp-guide` nas features (seção 9).

---

## 2. Baseline

| Item | Valor |
|---|---|
| Data | 13/10/2026 (catálogo sincronizado às 03:33–03:36 BRT; 17.446 produtos: Sul 9.851, Norte 3.667, CO 3.928) |
| Storefront | `main` em `3c698a5` (PR #69, 12/10); produção `https://www.useorigens.com.br` (canonical); `https://useorigens.com.br` responde 200 com `noindex` |
| Workers | `main` em `15b6a51` (PR #20); produção loader **5.1** nas 3 lojas, 12 features ligadas, escopo `product-catalog`, páginas de casca ativas (`/__origens/health`) |
| Modo de comércio | multi-loja (INK Use Sul / Use Norte / Use Centro); loja única (PR #49) continua desligada e não foi tocada |
| INK (PDPs auditadas) | Sul `feito-em-florianopolis` (cidade), `paranaense-pe-vermelho` (editorial); Norte `assis-brasil-origem-ac`, `ilha-do-bananal-063`; CO `goiania-origem-go`, `e-bem-mato-grosso` |
| Vitrine (páginas) | home, estado, cidade, estampa, coleção e busca de cada região |
| Viewports | 1440×900, 390×844, 375×812 (home, cidade, PDP) e 320×640 (home, cidade, PDP) |
| Ferramenta | Playwright/Chromium (`scripts/qa/conversao-audit.mjs`, `conversao-checkout-entry.mjs`), sessão anônima, tags de analytics bloqueadas; QA do guia com Chrome real + Miniflare (`use-origens-workers/scripts/qa-guide.mjs`) |
| Configuração publicada | Sul com menu de coleções (12 categorias); Norte e CO sem menu publicado (`/api/navbar` com `top: []`, `more: []`); cupons Sul: PRIMEIRACOMPRA, LEVEMAIS, Frete Grátis (sem data de fim); Norte e CO: 1 cupom cada |
| Analytics | Sem acesso ao painel do GA4, ao Clarity nem ao Meta nesta sessão: nenhuma taxa de abandono ou causa foi inferida de dados; tudo abaixo é inspeção e teste |

---

## 3. Auditoria priorizada

Legenda: **[obs]** observado em produção nesta data; **[hip]** hipótese de impacto (sem dado medido); **[med]** resultado medido em laboratório.

| # | Problema | Evidência | Impacto provável | Ajuste | Status |
|---|---|---|---|---|---|
| 1 | **[obs]** Cupom cobre o preço na 1ª visita (celular) e 4 fixos na base | [sul 390 1ª visita](screenshots/conversao-use-origens/sul-pdp-cidade-primeira-visita-mobile-390-antes.png), [norte 390](screenshots/conversao-use-origens/norte-pdp-cidade-primeira-visita-mobile-390-antes.png), [sul 390 no CTA](screenshots/conversao-use-origens/sul-pdp-cidade-cta-variantes-mobile-390-antes.png) | **[hip]** alto: preço e próximo passo são o que o visitante procura nos primeiros segundos | `promo-fab` recolhe enquanto o aviso da INK está na tela (celular) e trata preço e botões do guia como controles que não pode cobrir | **Implementado** (Worker, PR) |
| 2 | **[obs]** PDP inadequada → só "sair para a vitrine"; busca do bloco leva a páginas, não a produtos | bloco "Continue explorando" em todas as PDPs; `origens_explore_storefront_click` leva ao site | **[hip]** alto: troca de domínio, perde o foco de compra, 3+ toques até outro produto | Guia na PDP: cidade → 3 produtos, coleções → 4 produtos, produto abre a PDP na mesma loja | **Implementado** (Worker + storefront, PRs) |
| 3 | **[obs]** Worker aponta para o host não canônico (`useorigens.com.br`, `noindex`) | `curl -I https://useorigens.com.br/sul` → `x-robots-tag: noindex`; URL de chegada nas capturas `vitrine-com-carrinho` | **[hip]** médio: consentimento/favoritos/espelho separados por host; banner de cookies repetido; chegada contada num host que o SEO ignora | Trocar `storefront` em `stores.js` para `https://www.useorigens.com.br` (1 linha + testes que fixam a origem) **ou** redirecionar 301 `useorigens.com.br` → `www` no proxy | **Pendência** (decisão: afeta todos os links e eventos; recomendo o redirect no site + a troca no Worker) |
| 4 | **[obs]** Cabeçalho da INK: "Regiões"/"Demais categorias" e links para coleções da INK; Norte/CO sem categorias | [centro desktop](screenshots/conversao-use-origens/centro-oeste-pdp-cidade-primeira-visita-desktop-1440-antes.png) (só "Regiões ▾ Cidades"); `/api/navbar/norte` → `more: []` | **[hip]** médio: dois vocabulários; no Norte/CO não há como ir a uma coleção pela INK | Worker: "Estados", "Categorias" (`moreLabel`), `url` do site vira o destino; CMS: publicar o menu de coleções no Norte e no CO | **Implementado** no Worker (PR); **pendência** do dono no CMS (Norte/CO) |
| 5 | **[obs]** `product_slug` da chegada só aceitava 5 slugs | `ORIGENS_PRODUCT_SLUGS` fechada; loader roda em todas as PDPs desde 28/09 | **[hip]** médio (medição): chegada à PDP relevante sem produto de origem | Aceitar qualquer slug com formato de catálogo (`^[a-z0-9][a-z0-9_-]{0,127}$`) | **Implementado** (storefront, PR) |
| 6 | **[obs]** Faixa superior da INK com mensagens sobrepostas | todas as capturas `primeira-visita` (ex.: [sul desktop](screenshots/conversao-use-origens/sul-pdp-cidade-primeira-visita-desktop-1440-antes.png)) | **[hip]** baixo: ruído acima do cabeçalho | Tema da INK (fora do nosso código) | **Pendência** (abrir com a INK) |
| 7 | **[obs]** Aviso de cookies da INK cobre as cores e as recomendações (desktop) | [sul desktop](screenshots/conversao-use-origens/sul-pdp-cidade-primeira-visita-desktop-1440-antes.png) | **[hip]** baixo (só até o aceite) | Não alterar o aviso nativo | Sem ajuste |
| 8 | **[obs]** Tamanho pendente: toast "Selecione o modelo" no topo, CTA no fim (celular) | [sul 390](screenshots/conversao-use-origens/sul-pdp-cidade-tamanho-pendente-mobile-390-antes.png) | **[hip]** médio: no celular o aviso fica fora da área olhada | Comportamento nativo da INK; registrado | **Pendência** (INK) |
| 9 | **[obs]** Vitrine, celular: cupom cobre o canto do "COMPRAR" do 1º card da cidade | [sul cidade 390](screenshots/conversao-use-origens/sul-cidade-retorno-mobile-390-antes.png) | **[hip]** baixo-médio | Mover o cupom para a direita no site (na INK ele fica à esquerda por causa do WhatsApp/Ajuda) | **Pendência** (já registrada no catalog-ux-v1; decisão do dono) |
| 10 | **[obs]** Campanha "10/10" | home e cabeçalho de 13/10 sem o link "PARA APROVEITAR O 10/10" | — | Já retirado; cupons publicados sem data de fim seguem válidos | OK (nada vencido no ar) |
| 11 | **[obs]** Página da estampa (site) e cards: preço, "Escolher tamanho na loja", "Tamanho, cor, frete e pagamento você define na loja Use Sul" | [sul estampa 390](screenshots/conversao-use-origens/sul-estampa-retorno-mobile-390-antes.png) | próximo passo claro | — | OK |
| 12 | **[obs]** Volta da INK com carrinho (3 regiões): "Meu carrinho" com itens e "Ir para meu carrinho" | [sul 390](screenshots/conversao-use-origens/sul-pdp-cidade-vitrine-com-carrinho-mobile-390-antes.png), [norte](screenshots/conversao-use-origens/norte-pdp-cidade-vitrine-com-carrinho-mobile-390-antes.png), [CO](screenshots/conversao-use-origens/centro-oeste-pdp-cidade-vitrine-com-carrinho-mobile-390-antes.png) | — | — | OK |
| 13 | **[med]** Largura: a PDP nativa da INK tem 417 px num viewport de 390 (393 no Norte/CO), 382 em 320: a própria INK transborda; nada nosso aumenta isso | `_metricas-antes-*.json` (`docW`×`clientW`); QA do guia "nada nosso passa da largura" | — | — | Registrado (nativo) |
| 14 | **[med]** Loader: 160 KB / 44,6 KB gzip no ar; com o guia 206 KB / 56 KB gzip (+11 KB gzip), `defer`, cacheado por 1 ano por hash | `buildLoaderSource` + `curl` do loader 5.1 | **[hip]** baixo: carregado depois do HTML, fora do caminho da compra | — | Aceito; alternativa futura: guia sob demanda como o `discovery.js` |

---

## 4. Antes / depois

| Página e estado | Antes (produção) | Depois (código novo contra a INK real) | O que melhorou e por quê |
|---|---|---|---|
| PDP Sul, celular, 1ª visita, no CTA | [antes](screenshots/conversao-use-origens/sul-pdp-cidade-cta-variantes-mobile-390-antes.png) | [depois](screenshots/conversao-use-origens/sul-pdp-cidade-guia-convite-primeira-visita-mobile-390-depois.png) | O cupom some enquanto o aviso da INK está na tela (`data-promo-hidden="cookie-notice"`): sobram o aviso e o CTA nativo; nada nosso cobre preço, selos ou botões. |
| PDP Sul, celular, depois do aceite | [antes](screenshots/conversao-use-origens/sul-pdp-cidade-retorno-sem-aviso-mobile-390-antes.png) | [depois](screenshots/conversao-use-origens/sul-pdp-cidade-guia-convite-mobile-390-depois.png) | O bloco "Continue explorando" (texto + 2 botões que levavam para fora) vira o convite com a pergunta certa e três saídas que ficam na loja; o cupom desvia dos botões. |
| PDP Sul, desktop | [antes](screenshots/conversao-use-origens/sul-pdp-cidade-primeira-visita-desktop-1440-antes.png) | [depois](screenshots/conversao-use-origens/sul-pdp-cidade-guia-convite-desktop-1440-depois.png) | Convite compacto abaixo das bandeiras, sem empurrar preço, variantes nem CTA; cabeçalho "Estados ▾ Categorias ▾ Cidades". |
| PDP Centro-Oeste, desktop | [antes](screenshots/conversao-use-origens/centro-oeste-pdp-cidade-primeira-visita-desktop-1440-antes.png) | [depois](screenshots/conversao-use-origens/centro-oeste-pdp-cidade-guia-convite-desktop-1440-depois.png) | Mesmo convite; "Regiões" virou "Estados". (As categorias só aparecem quando o menu da região for publicado no CMS.) |
| PDP Norte, celular | [antes](screenshots/conversao-use-origens/norte-pdp-cidade-cta-variantes-mobile-390-antes.png) | [depois](screenshots/conversao-use-origens/norte-pdp-cidade-guia-convite-mobile-390-depois.png) | Idem Sul, na cor da região. |

Métricas de posição (QA do guia, após o aceite do aviso): convite começa **abaixo** do CTA em todos os viewports (Sul 390: CTA termina em 511 px, convite começa em 697 px; 320: 624 → 814), nunca sobre ele; alvos de 44 px (52 no botão de contexto a 320 px, que quebra em duas linhas).

---

## 5. Guia completo

Posição escolhida após a inspeção: logo depois do `<form>` nativo de compra (abaixo do CTA, dos selos "Primeira troca grátis / Compra segura" e das bandeiras), **fora** do formulário e do turbo-frame que a INK recarrega, exatamente onde ficava o bloco anterior, que ele substitui. Nada abre sozinho; o painel só existe por toque.

### Sul (celular 390, desktop 1440; também 375 e 320)

| Passo | Celular | Desktop |
|---|---|---|
| Convite (1ª visita, aviso da INK na tela) | [390](screenshots/conversao-use-origens/sul-pdp-cidade-guia-convite-primeira-visita-mobile-390-depois.png) · [375](screenshots/conversao-use-origens/sul-pdp-cidade-guia-convite-primeira-visita-mobile-375-depois.png) · [320](screenshots/conversao-use-origens/sul-pdp-cidade-guia-convite-primeira-visita-mobile-320-depois.png) | [1440](screenshots/conversao-use-origens/sul-pdp-cidade-guia-convite-primeira-visita-desktop-1440-depois.png) |
| Convite (retorno) | [390](screenshots/conversao-use-origens/sul-pdp-cidade-guia-convite-mobile-390-depois.png) · [375](screenshots/conversao-use-origens/sul-pdp-cidade-guia-convite-mobile-375-depois.png) · [320](screenshots/conversao-use-origens/sul-pdp-cidade-guia-convite-mobile-320-depois.png) | [1440](screenshots/conversao-use-origens/sul-pdp-cidade-guia-convite-desktop-1440-depois.png) |
| Caminho A: busca "floripa" (cidade + UF, apelido) | [390](screenshots/conversao-use-origens/sul-pdp-cidade-guia-busca-mobile-390-depois.png) · [375](screenshots/conversao-use-origens/sul-pdp-cidade-guia-busca-mobile-375-depois.png) · [320](screenshots/conversao-use-origens/sul-pdp-cidade-guia-busca-mobile-320-depois.png) | [1440](screenshots/conversao-use-origens/sul-pdp-cidade-guia-busca-desktop-1440-depois.png) |
| Estampas de Florianópolis (3 produtos + "Ver todas (8)") | [390](screenshots/conversao-use-origens/sul-pdp-cidade-guia-resultado-cidade-mobile-390-depois.png) · [375](screenshots/conversao-use-origens/sul-pdp-cidade-guia-resultado-cidade-mobile-375-depois.png) · [320](screenshots/conversao-use-origens/sul-pdp-cidade-guia-resultado-cidade-mobile-320-depois.png) | [1440](screenshots/conversao-use-origens/sul-pdp-cidade-guia-resultado-cidade-desktop-1440-depois.png) |
| "Mais estampas de Florianópolis" (contexto do produto, sem busca; o produto aberto fica de fora) | [390](screenshots/conversao-use-origens/sul-pdp-cidade-guia-mais-da-cidade-mobile-390-depois.png) | [1440](screenshots/conversao-use-origens/sul-pdp-cidade-guia-mais-da-cidade-desktop-1440-depois.png) |
| Caminho B: coleções da região (8, com foto e total) | [390](screenshots/conversao-use-origens/sul-pdp-cidade-guia-colecoes-mobile-390-depois.png) | [1440](screenshots/conversao-use-origens/sul-pdp-cidade-guia-colecoes-desktop-1440-depois.png) |
| Coleção escolhida (4 produtos + "Ver a coleção completa") | [390](screenshots/conversao-use-origens/sul-pdp-cidade-guia-resultado-colecao-mobile-390-depois.png) | [1440](screenshots/conversao-use-origens/sul-pdp-cidade-guia-resultado-colecao-desktop-1440-depois.png) |
| Dispensado (linha discreta; lembrado 30 dias) | [390](screenshots/conversao-use-origens/sul-pdp-cidade-guia-dispensado-mobile-390-depois.png) | [1440](screenshots/conversao-use-origens/sul-pdp-cidade-guia-dispensado-desktop-1440-depois.png) |
| Reaberto pela linha (menu das 3 saídas) | [390](screenshots/conversao-use-origens/sul-pdp-cidade-guia-reaberto-mobile-390-depois.png) | [1440](screenshots/conversao-use-origens/sul-pdp-cidade-guia-reaberto-desktop-1440-depois.png) |
| Erro da API (mensagem + Tentar de novo + vitrine) | [390](screenshots/conversao-use-origens/sul-pdp-cidade-guia-erro-api-mobile-390-depois.png) | [1440](screenshots/conversao-use-origens/sul-pdp-cidade-guia-erro-api-desktop-1440-depois.png) |
| Produto do guia aberto (PDP de destino com o próprio convite) | [390](screenshots/conversao-use-origens/sul-pdp-cidade-guia-produto-escolhido-mobile-390-depois.png) | — |

### Norte e Centro-Oeste (entrada e resultados)

| Passo | Norte 390 | Norte 1440 | CO 390 | CO 1440 |
|---|---|---|---|---|
| Convite | [390](screenshots/conversao-use-origens/norte-pdp-cidade-guia-convite-mobile-390-depois.png) | [1440](screenshots/conversao-use-origens/norte-pdp-cidade-guia-convite-desktop-1440-depois.png) | [390](screenshots/conversao-use-origens/centro-oeste-pdp-cidade-guia-convite-mobile-390-depois.png) | [1440](screenshots/conversao-use-origens/centro-oeste-pdp-cidade-guia-convite-desktop-1440-depois.png) |
| Busca ("manaus" / "taguatinga", RA do DF) | [390](screenshots/conversao-use-origens/norte-pdp-cidade-guia-busca-mobile-390-depois.png) | [1440](screenshots/conversao-use-origens/norte-pdp-cidade-guia-busca-desktop-1440-depois.png) | [390](screenshots/conversao-use-origens/centro-oeste-pdp-cidade-guia-busca-mobile-390-depois.png) | [1440](screenshots/conversao-use-origens/centro-oeste-pdp-cidade-guia-busca-desktop-1440-depois.png) |
| Estampas da cidade | [390](screenshots/conversao-use-origens/norte-pdp-cidade-guia-resultado-cidade-mobile-390-depois.png) | [1440](screenshots/conversao-use-origens/norte-pdp-cidade-guia-resultado-cidade-desktop-1440-depois.png) | [390](screenshots/conversao-use-origens/centro-oeste-pdp-cidade-guia-resultado-cidade-mobile-390-depois.png) | [1440](screenshots/conversao-use-origens/centro-oeste-pdp-cidade-guia-resultado-cidade-desktop-1440-depois.png) |
| Coleções / coleção | [390](screenshots/conversao-use-origens/norte-pdp-cidade-guia-colecoes-mobile-390-depois.png) · [coleção](screenshots/conversao-use-origens/norte-pdp-cidade-guia-resultado-colecao-mobile-390-depois.png) | [1440](screenshots/conversao-use-origens/norte-pdp-cidade-guia-colecoes-desktop-1440-depois.png) · [coleção](screenshots/conversao-use-origens/norte-pdp-cidade-guia-resultado-colecao-desktop-1440-depois.png) | [390](screenshots/conversao-use-origens/centro-oeste-pdp-cidade-guia-colecoes-mobile-390-depois.png) · [coleção](screenshots/conversao-use-origens/centro-oeste-pdp-cidade-guia-resultado-colecao-mobile-390-depois.png) | [1440](screenshots/conversao-use-origens/centro-oeste-pdp-cidade-guia-colecoes-desktop-1440-depois.png) · [coleção](screenshots/conversao-use-origens/centro-oeste-pdp-cidade-guia-resultado-colecao-desktop-1440-depois.png) |
| Mais estampas de <cidade> / dispensado / reaberto / erro | [mais](screenshots/conversao-use-origens/norte-pdp-cidade-guia-mais-da-cidade-mobile-390-depois.png) · [dispensado](screenshots/conversao-use-origens/norte-pdp-cidade-guia-dispensado-mobile-390-depois.png) · [reaberto](screenshots/conversao-use-origens/norte-pdp-cidade-guia-reaberto-mobile-390-depois.png) · [erro](screenshots/conversao-use-origens/norte-pdp-cidade-guia-erro-api-mobile-390-depois.png) | [mais](screenshots/conversao-use-origens/norte-pdp-cidade-guia-mais-da-cidade-desktop-1440-depois.png) | [mais](screenshots/conversao-use-origens/centro-oeste-pdp-cidade-guia-mais-da-cidade-mobile-390-depois.png) · [dispensado](screenshots/conversao-use-origens/centro-oeste-pdp-cidade-guia-dispensado-mobile-390-depois.png) · [reaberto](screenshots/conversao-use-origens/centro-oeste-pdp-cidade-guia-reaberto-mobile-390-depois.png) · [erro](screenshots/conversao-use-origens/centro-oeste-pdp-cidade-guia-erro-api-mobile-390-depois.png) | [mais](screenshots/conversao-use-origens/centro-oeste-pdp-cidade-guia-mais-da-cidade-desktop-1440-depois.png) |

Regras cumpridas e verificadas no QA: sem modal automático; quem escolhe modelo/cor/tamanho não vê o guia abrir e o convite não muda; Esc fecha e devolve o foco; Tab fica preso no diálogo (desktop, 25 Tabs); voltar e fechar; `aria-modal`, `role=dialog`, `combobox/listbox` na busca, `aria-label` nos cards; `prefers-reduced-motion` desliga transições; largura pela parte visível do documento; cidade sem estampa → mensagem honesta + 2 saídas (coberto por teste; nenhuma cidade coberta no catálogo chega vazia hoje); imagem ausente → só o fundo cinza; busca/API fora → mensagens honestas e a vitrine a um toque; sem armazenamento → dispensa vale só na página; **nenhum POST** na loja; nenhuma consulta à INK por visitante (o Worker lê o storefront, que lê arquivos sincronizados).

Limitação documentada: a dispensa é lembrada por `localStorage` **neste navegador e neste domínio** (cada loja da INK é um domínio; o storefront é outro). Não reconhece a mesma pessoa em outro aparelho nem sem conta.

---

## 6. Jornada de compra

Com o guia ligado, a compra nativa continua acessível (Sul, desktop 1440, Chrome real, INK real; nada foi finalizado nem pago):

| Passo | Captura | Verificação |
|---|---|---|
| Modelo, cor e tamanho escolhidos (guia fechado, convite intacto, 0 POST nosso) | [variantes](screenshots/conversao-use-origens/sul-pdp-cidade-guia-variantes-escolhidas-desktop-1440-depois.png) | QA: "escolher modelo, cor e tamanho não abre o guia nem mexe no convite" PASS |
| Adicionar ao carrinho (nativo) | [pós-adição](screenshots/conversao-use-origens/sul-pdp-cidade-guia-pos-adicao-desktop-1440-depois.png) | drawer "Produto adicionado" PASS |
| Drawer do carrinho com "Finalizar compra" visível (não clicado) | [carrinho](screenshots/conversao-use-origens/sul-pdp-cidade-guia-carrinho-desktop-1440-depois.png) | `{"text":"Finalizar compra","visible":true}` PASS |
| Entrada do checkout (produção, formulário vazio, sem dados) | [desktop](screenshots/conversao-use-origens/sul-checkout-entrada-desktop-1440-antes.png) · [celular](screenshots/conversao-use-origens/sul-checkout-entrada-mobile-390-antes.png) | `/usesul/checkout/contact_and_shipping_details` (checkout de convidado: e-mail, nome, telefone, CPF, CEP) |
| Volta à vitrine com carrinho (3 regiões) | ver §3 item 12 | "Meu carrinho" + "Ir para meu carrinho" |

Colisões corrigidas: cupom × preço (1ª visita, celular); cupom × botões do guia; cupom × aviso de cookies da INK (celular); recomendações ("Você também pode gostar") agora ancoram **depois** do convite, não entre o formulário e ele (achado do primeiro QA: o convite caía 460 px abaixo do CTA).

---

## 7. Validação

### Comandos e resultados

| Onde | Comando | Resultado |
|---|---|---|
| Storefront | `npx tsc --noEmit` | ok |
| Storefront | `npx eslint .` | 0 erros, 9 avisos (todos já existentes) |
| Storefront | `npx vitest run` | **108 arquivos, 1.386 testes passando** (1.381 na base + 5 novos em `tests/unit/pdp-guide.test.ts`) |
| Storefront | `/api/guia` local (`next dev`, CMS on) | `?produto=4714617` → Florianópolis; `?cidade=sc/florianopolis&produto=…` → 3 itens (sem o 4714617); sem parâmetro → 8 coleções; `?colecao=da-nossa-terra` → 4 itens; cidade/coleção inexistente → 404 JSON; `produto=abc` → 400; RA do DF (`df/taguatinga`) → `kind: "ra"` |
| Workers | `npm test` (workerd + jsdom) | **518/518** (497 na base; +13 `pdp-guide.dom.test.js`, +6 `guide-gateway.workerd.test.js`, +2 navbar) |
| Workers | `scripts/qa-guide.mjs --stores=sul` (Chrome real, INK real, Worker Miniflare, `/api/guia` local) | **67/67** em 1440, 390, 375 e 320 |
| Workers | `scripts/qa-guide.mjs --stores=norte,centro` | **84/84** em 1440 e 390 |
| Produção (antes) | `scripts/qa/conversao-audit.mjs` (3 regiões) + `conversao-checkout-entry.mjs` | 292 capturas; métricas em `_metricas-antes-*.json` |

E2E do storefront com Playwright (`playwright.config.ts`) **não foi rodado nesta rodada**: nenhuma página pública mudou (só uma rota de API nova e uma constante de analytics coberta por unit tests). Falhas já conhecidas na `main` (página do estado no celular; 3 testes do dropdown de região) continuam fora do escopo.

### Cenários manuais/automatizados cobertos

Três regiões; produto de cidade (guia) e editorial (auditoria); chegada direta (URL da PDP) e pela vitrine (home → cidade → card → INK); primeira visita (aviso da INK na tela) e retorno (aceito); seleção de variantes antes do guia; dispensa, recarga e reabertura; erro de busca e erro de API; carrinho existente (volta à vitrine com `cart_ref`, espelho "Meu carrinho"); teclado no desktop (Tab preso, Escape); 320 px sem overflow nosso.

### Desempenho (laboratório)

Ferramenta: Playwright/Chromium neste Mac, rede real sem throttling, `networkidle`, LCP via `PerformanceObserver`; valores de **uma** visita (ISR frio na primeira requisição de uma página explica os ~2,5–3,1 s em algumas páginas: Norte home desktop 3,1 s, Sul coleção 2,5 s; páginas já em cache: 0,35–0,9 s). Não são dados de campo e não foram comparados com o guia (o guia roda na INK, não no site). Loader da INK: 160 KB (44,6 KB gzip) hoje → 206 KB (56 KB gzip) com o guia, `defer`, imutável por 1 ano; o convite é inserido depois do CTA (nenhum deslocamento de preço/variantes) e o painel só é desenhado por toque. `docs/qa/performance-debt.md` (LCP 2,9 s em 4G lento) continua valendo como meta aberta.

---

## 8. Medição

Eventos novos (INK, `gtag` da própria INK, só após o aceite do aviso dela; nunca texto digitado nem dado pessoal). Parâmetros comuns: `send_to`, `region`, `surface=ink`, `entry_point=ink_product_detail`, `feature_version=guide_v1`, `product_slug`, `transport_type=beacon`.

| Evento | Disparo | Parâmetros próprios |
|---|---|---|
| `origens_guide_view` | convite ≥ 50 % visível (IntersectionObserver), 1× por página | — |
| `origens_guide_open` | painel aberto por toque | `guide_path`: `city` \| `prints` \| `city_context` \| `reopen` |
| `origens_guide_dismiss` | ✕ | — |
| `origens_guide_city_select` | cidade escolhida | `city_slug`, `uf` |
| `origens_guide_results` | resultados desenhados | `guide_path`, `result_count`, `has_results` |
| `origens_guide_product_click` | produto do guia clicado | `guide_path`, `position`, `target_product_id` |
| `origens_guide_error` | busca/API falhou | `guide_step` |
| `origens_explore_storefront_click` → `origens_storefront_arrived` (já existiam) | links do guia para o site | `entry_point=ink_product_detail`, `product_slug` (agora qualquer slug de catálogo) |

**Deduplicação verificada:** nenhum `PageView`, `ViewContent`, `AddToCart` ou `Purchase` é enviado pelo guia (teste `pdp-guide.dom.test.js`: só eventos `origens_guide_*` e, nos links para o site, o `origens_explore_storefront_click` existente; sem aceite do aviso da INK, zero eventos). O storefront continua com um `PageViewOrigens`/`page_view` por navegação (sem mudança nesta rodada).

**Como comparar variantes:** a flag é **por loja e por deploy**, não por visitante (o projeto não tem experimentação por visitante e esta rodada não cria uma). Comparações possíveis no GA4 da INK (mesma propriedade por loja, onde também caem `view_item`, `add_to_cart` e `purchase` nativos): (1) antes × depois na mesma loja; (2) loja com guia × loja sem guia no mesmo período (ex.: ligar primeiro no Norte). Métrica principal **compra por visitante elegível** = `purchase` ÷ sessões com `page_view` de PDP, no período, por loja (todos os visitantes, inclusive quem ignorou o guia); secundária **adição ao carrinho por visitante** = `add_to_cart` ÷ as mesmas sessões. Diagnósticos: `origens_guide_view` → `open` → `results` → `product_click` → `view_item` do produto alvo. Proteções: `origens_guide_error`, abandono de PDP (sessões com `view_item` sem `add_to_cart`), LCP de campo (não disponível para nós).

**Depende de acesso/dados:** criar as dimensões personalizadas (`feature_version`, `guide_path`, `guide_step`, `city_slug`, `uf`, `result_count`, `has_results`, `position`, `target_product_id`) e conferir no Realtime/DebugView (sem acesso nesta sessão); a chegada ao site vinda da INK continua sendo um **piso** (consentimento, bloqueadores, gate do aviso da INK). Sem volume suficiente, o resultado será hipótese, nunca "ganho comprovado".

---

## 9. Implementação

### Storefront (`useorigens`, branch `feature/guia-pdp-conversao`, [PR #70](https://github.com/gatomazi/useorigens-storefront/pull/70))

| Commit | Arquivos |
|---|---|
| `feat(api): /api/guia/<region>` | `src/app/api/guia/[region]/route.ts`, `src/lib/guide/pdp-guide.ts`, `tests/unit/pdp-guide.test.ts` |
| `feat(analytics): slug de catálogo no marcador; eventos do guia` | `src/lib/analytics/origens-events.ts`, `tests/unit/origens-events.test.ts`, `docs/analytics-origens-events.md` |
| `test(qa): auditoria de produção` | `scripts/qa/conversao-audit.mjs`, `scripts/qa/conversao-checkout-entry.mjs` |
| `docs: relatório e capturas` | este arquivo, `docs/screenshots/conversao-use-origens/` |

Configuração: nenhuma variável nova. A rota lê catálogo, coleções e `published.json`; 404 para região não lançada (os links são páginas do site). Cache `s-maxage=300`. Rollback: reverter o PR (o Worker trata 404/erro como "API fora": convite com 2 botões e mensagem honesta).

### Workers (`use-origens-workers`, branch `feature/pdp-guide`, [PR #21](https://github.com/gatomazi/worker-lojas/pull/21))

| Commit | Arquivos |
|---|---|
| `feat(worker): pdp-guide (loader 5.2)` | `src/guide-gateway.js`, `src/loader/pdp-guide.js`, `src/features.js`, `src/loader-source.js`, `src/worker.js`, `src/loader/{return-link,tracking,recommendations}.js`, `scripts/lib/store-lib.mjs`, `scripts/qa-guide.mjs`, testes, `docs/pdp-guide.md`, `README.md` |
| `fix(worker): cupom × aviso de cookies, preço e guia` | `src/loader/promo-fab.js` |
| `feat(worker): navbar "Estados"/"Categorias" e páginas de coleção do site` | `src/navbar-gateway.js`, `src/loader/header-nav.js`, testes |

Flag: `WIDGET_FEATURES` ganha `pdp-guide` (fail-closed; **opt-in**: um release de rotina não a liga). Deploy (depois do storefront), uma loja por vez, com as mesmas vars do ar acrescentando `,pdp-guide`; conferir `/__origens/health` (`version 5.2`, `pdp-guide` na lista) e rodar `scripts/qa-guide.mjs --stores=<loja>` com `GUIDE_API=https://www.useorigens.com.br`. Rollback: republicar sem `,pdp-guide` (volta o bloco anterior) ou `wrangler rollback <versão anotada>`. Comandos exatos em `use-origens-workers/docs/pdp-guide.md`. As mudanças do cupom e do cabeçalho entram no mesmo deploy do loader 5.2 (sem flag própria; o cabeçalho só muda de destino quando o CMS manda `url` do site).

---

## 10. Pendências

| Pendência | Motivo | Próximo passo |
|---|---|---|
| Publicar (storefront → Workers) | Dono pediu para avaliar antes de qualquer merge | Revisar os 2 PRs; mergear o do storefront; deploy do Worker loja a loja (§9) |
| Host não canônico nos links do Worker (`useorigens.com.br`) | Decisão de escopo: muda todos os links/eventos de volta ao site | Decidir entre redirect 301 no site e/ou `storefront: https://www.useorigens.com.br` em `stores.js` (ajustar testes que fixam a origem) |
| Menu de coleções do Norte e do Centro-Oeste | Não publicado no CMS: o guia (caminho B) usa o legado (todas as públicas com página) e a navbar da INK fica sem categorias | No CMS, Coleções → Menu de coleções → publicar em cada região (curadoria: tirar coleções de estado) |
| Faixa superior da INK sobreposta; toast "Selecione o modelo" no topo | Tema/comportamento nativo da INK | Abrir com o suporte da INK |
| Posição do cupom na vitrine (cobre o 1º card no celular) | Decisão de design do dono | Mover para a direita no site, se aprovado |
| Dimensões do GA4 e conferência no DebugView | Sem acesso ao painel nesta sessão | Criar as dimensões (§8) e validar uma sessão de teste após o deploy |
| E2E Playwright da vitrine | Não rodado nesta rodada (nenhuma página pública mudou) | Rodar `city-garment-tabs`, `sul`, `tracking-and-nav`, `global-search`, `seo` antes do merge, se quiser a confirmação |

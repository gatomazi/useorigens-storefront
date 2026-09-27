# CMS: hotpages, categorias-pai e personalização

> **Parcialmente substituído** por [`cms-hotpages-personalizacao-release-gate.md`](cms-hotpages-personalizacao-release-gate.md): o fluxo definitivo não tem vínculo com pedido da INK. Onde este relatório fala de "Vincular pedido", estados "vinculada"/"concluída", `CUSTOMIZATION_HANDOFF` ou "produto de destino" do modelo, vale o release gate (esses itens foram removidos do produto; o histórico foi preservado).

Rodada local e autônoma. **Nada foi enviado**: sem push, merge, PR, deploy, migração real, mudança no Railway, DNS, Worker, loja INK, tracking ou políticas. A migration `0004` foi escrita e validada só em Postgres local (PGlite); não foi aplicada em nenhum ambiente.

> As duas imagens de referência do pacote **não estavam disponíveis** nesta sessão. Os mockups dos testes e das capturas são placeholders neutros (imagens pretas). Troque pelos mockups reais em Mídia; nenhuma linha de código depende deles.

## 1. O que existe agora

| Peça | O que faz |
|---|---|
| **Hotpage** `/{região}/h/{slug}` | Página editorial independente da home, feita com as mesmas seções do CMS (coleção, campanha, estados, estilos da cidade) mais um `page-hero` próprio. |
| **Categoria-pai** `/{região}/colecoes/{slug}` | Página que organiza subcoleções da INK por seção; serve de destino de links da vitrine (botão de seção, item de menu). |
| **Modelo de personalização** | Cadastrado no CMS: coleção da INK (pública ou interna habilitada), mockup, até 10 campos de texto com rótulo/ajuda/exemplo/valor inicial/obrigatório/limite, e um grupo de linhas repetíveis (mín / inicial / máx). Tudo é dado do modelo, nada é fixo no código. |
| **Primeiro card reservado** | Em qualquer carrossel de produtos: 1 card "Personalize a sua nesse modelo" + N-1 produtos. O total nunca cresce. |
| **Página de personalização** `/{região}/personalizar/{slug}` | Mobile-first, validação no cliente e no servidor, prévia honesta (mockup fixo + resumo em texto ao vivo; nada desenhado sobre a imagem; aviso "Imagem ilustrativa"). |
| **Solicitações** | Persistidas, com referência opaca para o cliente, fila e detalhe protegidos no painel, vínculo manual com pedido da INK e mudança de estado. |

Rotas são segmentos estáticos; rascunho, arquivada ou região não lançada respondem 404. `slug` é único por região e tipo. Não há rebuild para URL nova: `generateStaticParams` devolve `[]` e a página é ISR (`revalidate = 3600`), com invalidação de cache na publicação. Visita pública não consulta banco nem INK (exceto envio de solicitação e a página de referência).

SEO: título, descrição, canonical e OG por página; `indexable` só o owner altera; prévia, rascunho e página de personalização saem sempre com `noindex` (a de personalização nunca é indexável).

## 2. Arquitetura escolhida e por quê

- **Tudo dentro do documento jsonb da região** (`ScopeDoc.pages`, `ScopeDoc.customizers`), retrocompatível: documento publicado antigo, sem os campos, continua válido e a home do Sul segue idêntica (ver §8). Só as **solicitações** precisam de tabela, por isso a única migration é a `0004`.
- **Publicação por alvo** (`PublishTarget = region | page | customizer`): publicar uma página ou um modelo compõe o documento a partir do head **publicado**, sem tocar na home, em outras páginas ou em outras regiões. Publicar a home mantém as páginas como estão publicadas (rascunho de página não vaza). Reaproveita o protocolo existente (pendente → arquivo → no ar → revalidação, reconciliador, restauração por escopo).
- **Links e cards só apontam para o que está no ar** (`linkProblems`): botão para página em rascunho, arquivada ou de outra região é bloqueado na publicação e a tela Publicar lista o bloqueio; primeiro card com modelo não publicado/desativado/sem mockup também.
- **Leitor tolerante** (`sanitizeBundle`): página ou modelo inválido é descartado individualmente (com diagnóstico); card que apontava para modelo descartado é removido e o carrossel fica só com produtos. A vitrine nunca cai por causa de um item.
- **Validador único** (`src/lib/customization/validate.ts`) usado no cliente (resumo ao vivo) e no servidor (revalidação): NFC, rejeita caracteres de controle/formatação e `<` `>`, chaves em whitelist, limite por campo, grupo de linhas dentro de min/max, linha visível em branco é erro.
- **Fronteira INK explícita**: o texto digitado **não** viaja com um pedido da INK. Adaptador `unavailable | manual | verified`; padrão `manual`; `verified` nunca é honrado (nada prova ainda esse mecanismo). Ver §6.

## 3. Painel

- **Páginas** (`/admin/paginas`): lista com região, tipo, título, endereço, última publicação e estado; criar, duplicar, arquivar, apagar rascunho; editor de identidade/SEO; seções com os mesmos formulários da home (incluindo o `page-hero`); prévia 375/desktop com os componentes reais; publicar **esta página** e restaurar versões dela.
- **Personalização → Modelos** (`/admin/personalizacao`): região, coleção, produto de destino (opcional), nº de campos, mockup, estado; editor com campos dinâmicos (adicionar, remover, reordenar), grupo de linhas, mockup/card, ativar; publicar **a página de personalização** (não é "checkout automático" e a tela diz isso).
- **Personalização → Solicitações**: referência curta, modelo/versão, região, data, estado, pedido INK; detalhe com o que o cliente pediu (rótulos e versão do momento do envio), histórico, vincular pedido e mudar estado.
- Autorização sempre no servidor: cada ação relê a região do registro e checa `canEdit`; formulário forjado para região alheia é recusado e auditado. A tela Publicar mostra também releases de página/modelo (`Página x`, `Modelo y`).

Como abrir o admin local: `npm run cms:dev` → `http://127.0.0.1:3000/admin` (sandbox em `data/admin-dev/`, nada de produção).

## 4. IDs de coleção usados nos testes (catálogo local sincronizado)

| Uso | Coleção |
|---|---|
| Subtemas da categoria "Pais" | Da Nossa Terra `152188` (pública), Fé de Origem `148122` (interna, habilitada na Biblioteca; **não** reativada na INK), Do Nosso Jeito `152187` |
| Modelo "Pai Paranaense" | Fé de Origem `148122` |
| Modelo "Lá de Santiago" | Personalizados `140836` |

Coleção interna mostra os produtos mas **não** gera "Ver todos" (não há página pública na INK). Coleção de outra loja é recusada pelo servidor.

## 5. Primeiro card do carrossel

Na seção de carrossel: "Primeiro card personalizável" (modelo da região, título, botão, descrição, imagem opcional; sem imagem usa o mockup do modelo). O total de cards é o `limit` da fonte. Com `limit = 6` a landing exibe **6 `li`: 1 `data-customizer-card` + 5 produtos**, o card fixo é o primeiro e leva a `/sul/personalizar/pai-paranaense`. Modelo inativo, sem mockup, de outra região ou fora do ar: sem card, o carrossel é só produtos (e a publicação é bloqueada com a razão).

## 6. Persistência e fronteira com a INK

- `customization_request` + `customization_request_event` (migration `0004_customization_requests`, **não aplicada**); em dev, arquivo `requests.json` no sandbox. Mesma interface (`RequestStore`), testada contra as duas implementações.
- Idempotência por `(região, chave)`; referência do cliente = HMAC opaco (só o sha256 fica guardado); "editar e enviar de novo" gera nova solicitação que substitui a anterior. Snapshot do modelo (versão e rótulos) gravado na solicitação: **editar ou restaurar o modelo não reescreve solicitações antigas** (provado no E2E).
- Retenção configurável (`CUSTOMIZATION_RETENTION_DAYS`, padrão 180); estados: Recebida, Aguardando vínculo com o pedido, Em análise, Vinculada a um pedido da INK, Concluída e Cancelada (só transições permitidas pela máquina de estados).
- Vínculo com pedido: manual, número digitado por uma pessoa, com caixa de confirmação; só pedidos da loja INK da própria região; um pedido não pode estar em duas solicitações. A mensagem diz "o vínculo é manual: a INK não recebeu a personalização".
- Copy pública: "Isto registra o seu pedido de personalização com a nossa equipe. Ele **não acompanha automaticamente uma compra** na loja da INK". A página de personalização não tem link de checkout (o produto INK só aparece como link separado, com esse aviso, se o modo for `manual` e o modelo tiver produto exato).
- **Estrito**: o fluxo de *solicitação* funciona ponta a ponta. **Não há checkout personalizado integrado com a INK.** Isso continua dependendo de a INK aceitar receber os textos (ver roadmap).
- Página da solicitação (`/personalizar/solicitacao/{token}`): dinâmica, sem cache, `noindex`, `Referrer-Policy: no-referrer`, com limite de taxa; referência desconhecida = 404 sem enumeração.

## 7. Os dois exemplos locais

**Quatro linhas iniciais, até seis (Pai Paranaense)** — grupo `min 1 / inicial 4 / máx 6 / 16 caracteres`, valores iniciais PAI / PARANAENSE / CHURRASQUEIRO / LENDA. A página abre com 4 linhas, "Adicionar linha (4/6)" chega a 6 e desabilita; `<b>PAI</b>` e linha com mais de 16 caracteres dão erro visível; o envio devolve a referência e o resumo com "Linha 5 / Linha 6". Aparece na fila como `Pai Paranaense v1 · Sul`.

**Cidade + localidade + legenda (Lá de Santiago)** — três campos de texto (Cidade obrigatório, Localidade e Legenda opcionais, limites 30/30/40), sem grupo de linhas. Envio sem cidade dá erro; com cidade e legenda registra e o resumo omite a localidade vazia. Renomear "Cidade" para "Cidade do coração" (v2) não altera a solicitação já feita (continua "Cidade", v1). O mapa da camiseta **não** muda: só o mockup fixo e o resumo em texto.

## 8. Testes (resultados reais desta máquina)

| Verificação | Resultado |
|---|---|
| `tsc --noEmit` | limpo |
| ESLint (`src`, `tests`) | 0 erros, 0 avisos |
| Vitest completo | **49 arquivos, 684 testes, todos passam** (novos: `pages-model`, `pages-reader`, `pages-views`, `customization-validate`, `customizer-form`, `request-store` em PGlite + arquivo) |
| `npm run db:validate` (0004 em PGlite) | ALL CHECKS PASSED |
| `next build` | ok (novas rotas listadas) |
| E2E do admin `hotpages.spec.ts` | **6/6**: A hotpage, B categoria-pai (+ link da vitrine, bloqueio de rascunho, coleção alheia recusada, 404 de rascunho), C Pai Paranaense (+ card 1+5, validações, fila), D Lá de Santiago (+ v2 sem reescrever), E operação (vínculo manual, estados, restauração, cópia honesta, 404 de referência/região/rascunho), F capturas |
| Smoke das regiões (`SMOKE_REGIONS_ONLY=1`) | PASSED (/sul, /norte, /centro-oeste, busca, links da INK da própria loja, 404 das rotas novas inexistentes) |
| `verify-home-equivalence` /sul (ref. sem flag × candidata) | **EQUIVALENT** (HTML, DOM, links e pixels idênticos em 375, 390, 768, 1280, 1920) |
| E2E prod (`e2e-prod`) | 6 de 8 passam, incluindo o novo teste de ação forjada de páginas/modelos para outra região. O teste 7 falha no trecho que espera Meta Pixel/GTM carregarem (rede externa), **igual antes desta rodada**; o 8 não roda depois dele. Um título antigo do teste ("Nova seção" → "Adicionar seção") foi corrigido. |

Ressalvas honestas: não rodei o E2E público completo (`tests/e2e`) nesta rodada, que já tinha 2 falhas de busca/relógio sob carga antes dela; o smoke reduzido e a equivalência cobrem as rotas compartilhadas que mudaram. A prova de autorização por papel (editor de outra região) está no E2E prod acima; no sandbox dev todo mundo é owner.

## 9. Capturas

`docs/screenshots/2026-09-26-hotpages/`: `hotpage-375|desktop`, `categoria-375|desktop`, `personalizar-pai-375|desktop`, `personalizar-santiago-375|desktop` e `solicitacao-375` (confirmação no celular). Geradas por `CAPTURE=1 npx playwright test -c playwright.admin.config.ts tests/e2e-admin/hotpages.spec.ts`. Mockups são placeholders.

## 10. Commits (locais, branch `feature/hotpages-customizacao`)

1. `5672a85` feat(cms): page and personalization models, per-target publishing
2. `be553a2` feat(storefront): hotpage and landing routes, customizer page, request persistence
3. `177147e` feat(admin): Pages, Personalization models and Requests screens
4. `eed0afd` fix(cms): tolerant reader for pages and models, history labels
5. `c1c50ea` test(cms): E2E for hotpages, landings and personalization
6. docs(cms): round report (este arquivo)

## 11. Roadmap curto para produção (nada disto foi feito)

1. Revisar esta rodada e, só então, aplicar `0004_customization_requests` em produção (`npm run db:migrate`, como foi feito com a `0003`). Sem a tabela, o envio de solicitação responde indisponível; páginas e modelos funcionam sem migration.
2. Trocar os placeholders pelos mockups reais e cadastrar os modelos por região; publicar as páginas uma a uma (a flag `SITE_CONFIG_HOME` continua sendo o interruptor da home configurável).
3. **Com a INK**: definir como o texto chega ao pedido (campo/nota do item, API, ou operação manual documentada). Só depois disso considerar o modo `verified`; hoje ele nunca é reportado.
4. Definir política de retenção/LGPD dos textos digitados e quem opera a fila; considerar aviso por e-mail ou Slack para novas solicitações.
5. Validação tipográfica de largura na arte final (o limite de caracteres não garante que o texto caiba na estampa).
6. Se quiser indexar hotpages/categorias, o owner liga `indexable` por página; nada é indexável por padrão.

## 12. Variáveis novas (opcionais, só servidor)

`CUSTOMIZATION_RETENTION_DAYS` (7 a 3650, padrão 180) e `CUSTOMIZATION_HANDOFF` (`manual` padrão, ou `unavailable`). Documentadas em `.env.example`. A referência do cliente usa o `ADMIN_SESSION_SECRET` já exigido em produção.

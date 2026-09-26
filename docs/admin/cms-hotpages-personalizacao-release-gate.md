# Hotpages e personalização: release gate (contato manual)

Revisão local sobre `docs/admin/cms-hotpages-personalizacao-round.md`. **Nada foi enviado**: sem merge, push, PR, deploy, migração real, mudança no Railway/DNS/Worker/INK nem mensagem automática. A migration `0005` foi escrita e validada só em Postgres local (PGlite). A versão anterior desta revisão, com `whatsapp-webhook-go`, **não foi executada** e não existe código para ela.

## 1. Fluxo definitivo

1. O cliente abre uma hotpage, uma categoria-pai ou um carrossel, clica no primeiro card "Personalize a sua nesse modelo" e preenche os campos do modelo.
2. Informa **nome** e **pelo menos um contato** (WhatsApp ou e-mail; pode ser os dois) e marca a autorização de contato (desmarcada por padrão).
3. **Enviar solicitação** valida no navegador e de novo no servidor, grava a solicitação e devolve uma referência curta. Ela aparece na hora na **fila que já existia** no CMS (Personalização → Solicitações).
4. A equipe cria a estampa **manualmente**, fora do sistema. Se precisar, esclarece dúvidas com o cliente e anota na solicitação.
5. Com a arte pronta e o produto preparado na loja INK, a equipe **entra em contato** pelo canal informado (por clique humano) e orienta a compra, com o link do produto se quiser.
6. O CMS acompanha **a solicitação e o contato**. Não há número de pedido, pagamento, checkout, sincronização com a INK nem envio automático de nada.

**Não existe**: `whatsapp-webhook-go`, alertas por WhatsApp, outbox, retries, notificação automática ao cliente, API de pedido da INK, vínculo com pedido, "handoff verificado".

## 2. O que muda no produto

### Formulário público (`/{região}/personalizar/{slug}`)
- Texto de abertura: "Envie sua ideia de personalização. Nossa equipe prepara a estampa e entra em contato pelo canal informado quando ela estiver pronta para você realizar a compra. Esta etapa não é uma compra nem reserva um produto."
- Seção **"Como podemos entrar em contato com você?"**: Nome (obrigatório, sem exigir sobrenome), WhatsApp, E-mail e a caixa "Autorizo a equipe a usar este contato para falar sobre esta solicitação." com o aviso "Usamos o nome e o contato só para confirmar a estampa e, quando ela estiver pronta, orientar a sua compra na loja. Não é uma inscrição para receber ofertas."
- Regra: nome + ao menos um canal válido + autorização. Sem CPF, endereço, conta ou senha. Se algo falha, os valores digitados ficam.
- O botão é **"Enviar solicitação"**. Não há "Comprar", "Finalizar compra" nem link de produto na página. O antigo link opcional "abrir na loja (sem personalização)" foi removido.
- Confirmação: "Solicitação recebida! Sua referência é **XXXXXXXX**. Vamos preparar sua estampa e entrar em contato pelo WhatsApp ou e-mail informado quando ela estiver pronta para comprar. Nenhuma compra foi realizada nesta etapa." Mostra o resumo e os contatos **mascarados** (`WhatsApp final 8888`, `a***@exemplo.com`). Sem prazo de criação ou entrega prometido; nada diz que a INK recebeu algo. A imagem continua "Imagem ilustrativa".
- A referência curta (8 caracteres) é a mesma que a equipe vê na fila. O acesso privado ("Ver minha solicitação") continua por um código longo não adivinhável, com `noindex`, sem cache e sem referrer, e mostra só o andamento em palavras simples e o contato mascarado.

### Normalização de contato (no servidor, com a mesma função do navegador)
- **WhatsApp**: aceita espaços, parênteses, hífen e `+`; celular com DDD vira `+55…`; com `+` aceita outros países (8 a 15 dígitos). **Não adivinha**: número sem DDD, com zero antes do DDD, celular sem o 9, ou com letras é recusado com a forma de escrever.
- **E-mail**: aparado, domínio em minúsculas, validação simples (sem espaço, `<>`, vírgula, aspas nem pontos duplos).
- **Nome**: 2 a 80 caracteres, letras, espaço, apóstrofo, ponto e hífen; sem marcação nem caracteres invisíveis.
- Autorização: só `true` vale; a data e a versão do aviso (`2026-09-v1`) ficam gravadas.

### Persistência e privacidade
- Campos novos na solicitação: `customer_name`, `customer_whatsapp`, `customer_email`, `contact_confirmed_at`, `contact_notice_version`, `contacted_at`, `product_link*`. O snapshot imutável do modelo (rótulos, limites, versão) e os valores continuam intactos.
- Contato completo só no CMS autenticado e só para quem edita a região da solicitação (a checagem usa a região **gravada**, nunca um campo de formulário; região alheia = 404 na tela e recusa e auditoria na ação).
- O contato não vai para URL, analytics, logs, SEO, prévia pública nem mensagem de erro. A busca da fila cobre referência, nome, modelo e texto digitado, **nunca** telefone ou e-mail.
- Retenção: a existente (`CUSTOMIZATION_RETENTION_DAYS`, padrão 180). Solicitações em criação ou com arte pronta não são apagadas por idade. O aviso público não inventa contato jurídico, prazo nem base legal.

### Fila (a mesma tela)
- **Estados**: Recebida → Em criação → Arte pronta → Cliente contatado → Encerrada; Cancelada a qualquer momento útil. Encerrada e Cancelada são fechamentos administrativos: **não** dizem nada sobre compra ou pagamento. Encerrada reabre em Em criação; Cancelada volta a Recebida. Ninguém pula a criação da arte.
- **Listagem**: referência, cliente, indicadores de WhatsApp/E-mail (nunca o número), modelo/versão, região, data, estado; contagem de pendentes (recebidas, em criação, arte pronta) na própria tela, no menu lateral e na Visão geral; filtros por região e estado; busca.
- **Detalhe**: contato completo, mockup e textos com os rótulos da versão enviada, andamento, observações internas, histórico e:
  - **Conversar no WhatsApp**: abre `wa.me` com o número e a mensagem sugerida (editável) **só ao clicar**; nova aba.
  - **Enviar e-mail**: `mailto:` com assunto de referência, também só ao clicar.
  - **Copiar mensagem**: copia o texto (com o link do produto, se houver).
  - **Link do produto pronto para compra** (opcional): https e **exatamente** o host da loja INK da região (Sul `www.usesul.com.br`, Norte `www.usenorte.com.br`, Centro-Oeste `www.usecentro.com.br`); recusa outro host, host parecido, credenciais no endereço, porta, http, `javascript:`, espaço e marcação. É orientação de compra, **não vínculo com pedido**, e nada é verificado na INK.
  - **Cliente contatado** exige a caixa "eu mesmo(a) falei com o cliente" e grava a data. Clicar em WhatsApp/e-mail **não** muda o estado; nada infere contato, compra ou silêncio.
- Removidos do produto: "Vincular pedido", número de pedido, unicidade de pedido, estados "vinculada ao pedido"/"concluída" com semântica de compra, campo "Produto de destino" do modelo e a variável `CUSTOMIZATION_HANDOFF`.

### Histórico preservado
Solicitações anteriores (que podem ter status e vínculo do fluxo antigo) continuam legíveis: `submitted`/`awaitingOrderLink` → Recebida, `inReview` → Em criação, `linkedToInkOrder`/`fulfilled` → Encerrada. Sem contato, mostram "sem contato (anterior ao formulário)". O número de pedido, se existir, permanece na tabela/arquivo apenas como registro; o produto não o lê, não o mostra e a linha do histórico vira "Registro de um vínculo de pedido feito antes da mudança de fluxo".

## 3. Migrations

| Migration | Estado |
|---|---|
| `0004_customization_requests` | já commitada e **não alterada**. Nesta sessão nunca foi aplicada em banco algum; confirme com `db:status` antes de qualquer decisão de ordem. |
| `0005_customization_contact_workflow` | **nova, aditiva, local**. Colunas de contato/produto/contatado com constraints (contato coerente, WhatsApp `+dígitos`, e-mail, link do produto só na loja da própria região), renomeia estados **no lugar** (sem apagar), amplia os eventos (`note`, `product-link`) e a auditoria (`request.note`, `request.product`), índice de pendentes. Colunas antigas de pedido ficam para uma migration futura de limpeza. |

`npm run db:validate` cobre: up, down, up; cada constraint nova aceitando e rejeitando; e um banco em `0004` com linhas legadas passando para `0005` (estados renomeados, número de pedido e evento `linked` preservados, sem contato). `down` da `0005` mantém todas as solicitações.

**Ordem futura em produção (com autorização)**: `0004` e `0005` juntas, na mesma janela. A tela da fila e o contador do menu tratam tabela ausente sem quebrar o painel ("as solicitações ainda não estão disponíveis"), e o envio público responde indisponível.

## 4. Hotpages e categorias-pai

Nada foi reescrito. Verificações fechadas nesta rodada (E2E, cenários A e B): hotpage com hero, SEO e seções reordenáveis de coleções reais; categoria-pai com coleção pública e **interna habilitada** (sem "Ver todos" inválido); link da vitrine para a categoria-pai no storefront, bloqueado enquanto a página não está no ar; rascunho, arquivada e região alheia = 404; prévia protegida e `noindex` (a página pública também sai `noindex` até o owner ligar `indexable`); publicar/restaurar uma página não altera a home, outras páginas nem outras regiões.

## 5. Primeiro card e mockups

- Card fixo 1 + N-1 (6 no total: 1 personalizável + 5 produtos), título/microcopy/CTA/imagem configuráveis, sem imagem própria usa o mockup do modelo, aponta para `/{região}/personalizar/{slug}`, não parece produto comprável (selo "Personalizável", sem CTA de compra). Modelo inativo, sem mockup ou de outra região omite o card e o admin explica.
- **Mockups reais**: o E2E lê `referencias/pai-paranaense-churrasqueiro-lenda.png` e `referencias/la-de-santiago.png`, sobe pelo fluxo de mídia do CMS (sem tocar em bucket de produção), confere que a imagem é decodificada e mantém a proporção do arquivo no card, no formulário e na prévia 375/desktop.
- **BLOQUEIO REAL**: esses dois arquivos **não estavam disponíveis nesta sessão** (o ZIP com a pasta `referencias/` não chegou; procurei em Downloads, Desktop, Documents e no repositório). Nenhuma imagem foi inventada: os testes e as capturas usam duas imagens pretas neutras e o Playwright registra a anotação `missing-reference-mockup` com o nome exato do que falta. Para fechar: colocar os dois arquivos em `referencias/` na raiz do repositório e rodar `npx playwright test -c playwright.admin.config.ts tests/e2e-admin/hotpages.spec.ts` (com `CAPTURE=1` para refazer as capturas). Nada mais precisa mudar.

## 6. Testes

Ver a seção 9 (resultados reais desta máquina).

## 7. Como operar (procedimento da equipe)

1. Abra **Personalização → Solicitações** (o número no menu é o de pendentes da região escolhida).
2. Abra a solicitação. Confira o pedido do cliente e o mockup. Se faltar informação, fale com o cliente (botões de WhatsApp/e-mail) e registre uma **observação**.
3. Marque **Em criação** e crie a estampa fora do CMS.
4. Prepare o produto na loja INK da região. Quando a arte estiver validada, marque **Arte pronta**. Se quiser, cole o **link do produto** (ele entra na mensagem).
5. Fale com o cliente: **Conversar no WhatsApp** (edite o texto e envie você mesmo) ou **Enviar e-mail**, ou **Copiar mensagem**.
6. Depois de falar, marque **Cliente contatado** com a confirmação. Ao finalizar, **Encerrada** (ou **Cancelada**).
7. O que o CMS **não** faz: não sabe se o cliente comprou, não cobra, não cria pedido, não avisa ninguém sozinho.

## 8. Rollout (preparado, não executado)

**A. Hotpages e categorias-pai**: publicar o código e depois só as páginas aprovadas (uma a uma, com prévia 375/desktop). Não depende da tabela de solicitações nem das migrations. Rollback: arquivar ou restaurar a página.

**B. Formulário de personalização + operação manual**: depende de (1) migrations `0004` + `0005` aplicadas com autorização, (2) mockups reais enviados e conferidos, (3) equipe definida para a fila e o procedimento acima, (4) o contato visível só no CMS. Rollback operacional: desativar o modelo/card (a solicitação nova deixa de ser possível), manter as já registradas e o acesso do painel para atendê-las. Nenhum rollback destrutivo de banco.

**Checklist futuro (nada disso foi executado)**
- [ ] `db:status` em produção; disponibilidade e backup do banco.
- [ ] Aprovação explícita e `db:migrate` de `0004` + `0005`.
- [ ] Trocar placeholders pelos mockups reais; conferir card, formulário e prévia.
- [ ] Ligar as páginas aprovadas (hotpages/categorias) e só depois o modelo/card.
- [ ] Smoke do formulário real (sem compra): enviar, ver a solicitação na fila, checar contato só no painel.
- [ ] Conferir cada link de produto INK que a equipe for usar.
- [ ] Confirmar quem atende a fila e o texto do aviso de contato com o jurídico, se a empresa quiser.

## 9. Resultados dos testes (reais, nesta máquina)

| Verificação | Resultado |
|---|---|
| `tsc --noEmit` | limpo |
| ESLint (`src`, `tests`) | 0 erros, 0 avisos |
| Vitest completo | **52 arquivos, 749 testes, todos passam** (novos: contato/WhatsApp/e-mail/estados/link do produto, action de envio com validação no servidor, permissões por região, lojas de solicitações em PGlite e arquivo incluindo dados legados) |
| `npm run db:validate` (0001 a 0005) | ALL CHECKS PASSED (inclui 0004→0005 sobre linhas legadas e o `down`) |
| `next build` | passa (com IDs de tracking fictícios, para o E2E de produção) |
| E2E admin, todos os specs | 12 de 19 passam numa execução única; **7 não passam por acoplamento de estado entre specs** (o sandbox é compartilhado: o cenário B habilita "Fé de Origem" e antes dele o hero cria a home do Norte). `roundtrip` e `scopes` rodados sozinhos, em sandbox limpo: **7/7**. `hotpages` (A a F): **6/6**; `hero`, `navbar`, `structured`: passam |
| E2E de produção (`e2e-prod`) | **8/8**, incluindo os testes 7 e 8 que estavam inconclusivos (ver abaixo) |
| E2E público (`tests/e2e`, 3 regiões, busca, links INK, carrinho) | **144/144** |
| Smoke das regiões (`SMOKE_REGIONS_ONLY=1`) | PASSED |

**Cenários cobertos no E2E** (`hotpages.spec.ts`): hotpage e categoria-pai com coleção pública e interna, links válidos, rascunho/arquivada/região alheia = 404 e prévia `noindex`; card fixo 1 + 5; formulário de 4 linhas (até 6) e de Cidade + Localidade + Legenda, versão antiga preservada após editar o modelo; nome + só WhatsApp, só e-mail, ambos, nenhum, contato inválido, confirmação ausente, duplo clique gerando uma solicitação; fila com contato protegido (só selos de canal, nunca o número; busca por telefone não encontra), contador de pendentes no menu, visão geral e fila; sequência Recebida → Em criação → Arte pronta → Cliente contatado (exige confirmação humana) → Encerrada; `wa.me` só abre por clique (o teste intercepta e prova que nada é requisitado antes), `mailto` só existe se houver e-mail, copiar mensagem; link do produto salvo e cinco variações maliciosas recusadas; nenhum campo, botão ou estado de pedido; página pública sem CTA de compra e sem link de produto; página privada da solicitação com contato mascarado, `noindex` e 404 em outra região.

**Testes 7 e 8 de produção**: a falha vinha do build sem os IDs de tracking (`NEXT_PUBLIC_*`) e da espera por hosts externos. Agora o teste **serve stubs locais** para Meta e GA, registra cada requisição e confirma: nada antes do consentimento; depois dele, o `fbevents.js` e o `gtag/js?id=G-…` são requisitados e o `fbq('init', <id>)` está na fila. O build de teste usa IDs fictícios (comando no cabeçalho de `playwright.prod.config.ts`). Nenhum ID, política ou modo de consentimento real foi alterado.

**Limitações reais**
- Os dois mockups de referência continuam ausentes (seção 5). As capturas e as verificações de "arte não alterada" rodaram com as imagens neutras; a checagem de proporção e de decodificação vale igual para os arquivos reais.
- A prova de "editor de outra região não abre solicitação alheia" é por teste unitário do `canEdit` sobre a região gravada e pela recusa de ações forjadas (páginas/modelos) no E2E de produção; **não** há E2E de produção com uma solicitação real no Postgres.
- `wa.me` foi interceptado (nenhuma mensagem real foi aberta ou enviada em nenhum teste).
- Capturas: `docs/screenshots/2026-09-26-hotpages/` (hotpage, categoria, os dois personalizadores, formulário de contato 375, confirmação 375, fila e detalhe da solicitação no painel).

## 10. Commits locais (branch `feature/hotpages-customizacao`)

1. `08e01c0` feat(customization): manual-contact workflow model, stores and migration 0005
2. `0be3766` feat(storefront): contact section, request confirmation and no purchase CTA
3. `436e5ae` feat(admin): request queue as the manual production workbench
4. `ccc0492` test(cms): E2E for the contact flow, queue and deterministic tracker stubs
5. docs(cms): release gate (este arquivo) e aviso no relatório anterior

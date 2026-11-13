# Spec: Correções da análise de UX da loja

Status: approved · Date: 2026-11-13

Origem: análise de UX de 13/11/2026 (19 achados, celular 390 e desktop 1440, 1ª visita). O relatório e as capturas entram no repo na tarefa 1 (`docs/qa/analise-ux-loja-2026-11-13.md`). Os números `#n` abaixo são os do relatório.

## Goal
Corrigir os achados da análise que são de código (site e Worker), em PRs pequenos e abertos, sem merge nem deploy. Quem decide merge e publicação continua sendo o dono.

## Requirements

Site (repo `useorigens`):
- R1 (#7): Quando a página da estampa mostra onde finalizar a compra, o texto deve usar o nome da loja vigente: na loja única, "na nossa loja online"; em modo multiloja, "na loja Use <Região>". Nenhum "Use Sul" fixo para outra região. Os valores enviados ao analytics não mudam.
- R2 (#18): Quando Minhas Estampas está vazia, "Explorar estampas" deve ter aparência de botão.
- R3 (#6): Quando a busca não acha nada, a mensagem "Não encontramos nada" deve vir antes do link "Ver todos os produtos…".
- R4 (#6): O campo de busca deve ter uma só borda visível, em repouso e em foco.
- R5 (#10): Quando o cliente abre o Natal em Família no celular, o campo do sobrenome deve aparecer na primeira tela ou logo abaixo do título, antes do mockup. No desktop a ordem atual não muda.
- R6 (#6): Quando o termo não bate nem exato nem por apelido, a busca deve oferecer "Você quis dizer <cidade>?" pelo nome mais próximo, com link. Sem proximidade suficiente, mantém a mensagem atual.
- R7 (#19): O gatilho do popup da oferta deve ser lido e o comportamento (espera ou não o aceite de cookies) registrado no relatório. Só se houver defeito entra correção.

Worker (repo `worker-lojas`), só em preview:
- R8 (#1): Quando o banner de cookies da INK está visível no celular, a barra fixa "Adicionar ao carrinho" deve ficar acima dele, sem cobrir o banner e sem cortar o preço. Ao aceitar, a barra volta ao fundo.
- R9 (#3): **retirado** por decisão do dono em 2026-11-13. O checkout da INK fica como está hoje (o Worker segue só com CSS ali). O pedido de `autocomplete` e de teclado numérico no CEP vai para a INK, na lista do PR de docs.
- R10 (#5): Quando o cliente toca em "Adicionar ao carrinho" na PDP da INK, o botão deve mostrar "Adicionando…" na hora e ignorar novo toque até a resposta. Se a resposta falhar, o botão volta ao normal.

Host:
- R11 (#8): Quando uma página é pedida em `useorigens.com.br` (sem www) por GET, deve responder 301 para o mesmo caminho e query em `www.useorigens.com.br`. APIs, MCP, OAuth, webhooks e feeds ficam fora do redirect. A busca da INK e o `storefront` do Worker passam a apontar para o `www`.

Entrega:
- R12: O relatório, as capturas citadas e esta spec ficam versionados no repo, com links relativos (nada de caminho de scratchpad).
- R13: Cada PR tem descrição em pt-BR. PR visual leva capturas 1440 e 390 em `docs/screenshots/<feature>/`. Nenhum merge, deploy, release do Worker ou publicação no painel.

## Non-functional
- Sem nova dependência. A busca por proximidade roda sobre o índice que a busca já carrega, sem chamada de rede extra.
- Sem piora de LCP e CLS nas páginas tocadas.
- Falha segura: se a busca por proximidade der erro, cai na mensagem atual. Se o patch do Worker não achar o elemento, não faz nada (a página da INK segue como hoje).

## Edge cases
- Modo multiloja: o texto de R1 ainda diz "loja Use <Região>".
- Busca: acento, maiúscula, termo com 1 a 2 letras, termo que empata entre duas cidades.
- Cookies: o banner some após aceitar; a barra não pode ficar flutuando no vazio (R8).
- Turbo: envio do carrinho com erro de rede devolve o botão ao estado normal (R10).
- Apex: query string e caminho preservados; sem laço www → apex (R11).

## Out of scope
Não é código, vai para o dono em lista no PR de docs:
- #2 caixa de marketing pré-marcada (decisão de LGPD; não desmarcar pelo Worker).
- #3 `autocomplete` e teclado numérico do CEP no checkout (decisão do dono: o checkout não muda; vira pedido à INK).
- #4 endereço da loja no painel da INK.
- #5 latência do servidor da INK, #17 ordem dos controles da PDP da INK.
- #9, #13, #14 (painel e campanha sazonal).
- #12 rótulo do botão do card (decisão de texto).
- #15 texto de 10 px em "% OFF" (decisão de design da #172) e alvos de toque (revisar depois).
- Texto do rodapé `SiteChrome.tsx:297` (decisão de texto).
- #16 salto de layout (só investigar se reproduzir).
- Release do Worker, publicação no painel, deploy.

## Open questions / assumptions
- ASSUMPTION: 5 PRs. (1) docs: relatório, capturas e `specs/`; (2) site: R1 a R5 e R7; (3) busca: R6; (4) Worker: R8 e R10; (5) host: R11.
- ASSUMPTION: R6 só sugere "Você quis dizer…". Não troca os resultados sozinho.
- ASSUMPTION: R5 move o campo para cima do mockup só no celular.
- ASSUMPTION: R11 entra como código só para GET de páginas, depois de um inventário de quem chama o apex (MCP, OAuth, webhooks, feed do Merchant, catálogo Meta). Se o dono preferir regra no Cloudflare, o PR entrega só a regra escrita.
- ASSUMPTION: o Worker é verificado só no preview (`wrangler.preview.toml`), sem tocar produção.
- ASSUMPTION: #19 é só leitura de código; o teste ao vivo de 10 s já foi feito.

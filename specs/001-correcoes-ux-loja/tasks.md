# Tarefas: correções da análise de UX da loja

Spec: [spec.md](spec.md) · Plano: [plan.md](plan.md)

Regra de todas: ao fim de cada tarefa, rodar o build e os testes da área, ler o próprio diff e só então commitar (`<tipo>: <título>`). Nenhum merge, deploy ou release. PR aberto só com o corpo em pt-BR e as capturas.

## PR 1 · docs (`docs/analise-ux-loja`, worktree `useorigens-analise-ux`)

- [ ] **T1. Relatório e capturas no repo** (R7, R12)
  - How: copiar só as capturas citadas (E1 a E14) para `docs/screenshots/analise-ux-2026-11-13/`, reduzindo as de página inteira com `sharp`, e reescrever cada caminho do scratchpad como link relativo.
  - How: no relatório, retirar o #19 (o popup está em 25 s, não depende de cookies), marcar R9 como pedido à INK e acrescentar a lista "para o dono" (#2, #3, #4, #5 e #17 da INK, #9, #13, #14, #12, #15, texto do rodapé e do SEO).
  - Verify: nenhum caminho `/private/tmp` no arquivo; todo link relativo abre; PNGs somam menos de 6 MB.
- [ ] **T2. Abrir o PR 1** (R12, R13)
  - How: commit, push da branch e `gh pr create` com o corpo em pt-BR; atualizar a nota de memória da análise.
  - Verify: `gh pr view` mostra o PR aberto e os arquivos esperados.

## PR 2 · site, correções rápidas (`fix/ux-loja-rapidos`, worktree `useorigens-ux-rapidos`)

- [ ] **T3. Worktree pronta** · How: `git worktree add` da `origin/main`; copiar `data/generated`, `data/admin-dev` e `.env.local`; clonar `node_modules` com `cp -cR`. · Verify: `npm run typecheck` (ou o `tsc` do projeto) e o vitest da área rodam.
- [ ] **T4. Frase da loja vem do modo de compra** (R1)
  - How: `VariantPicker` recebe `finishIn` no lugar de `storeName`; a página da estampa e a de privacidade passam `checkoutStoreFor(region).finishIn`. Texto: "Tamanho, cor, frete e pagamento você define {finishIn}."
  - Verify: teste de unidade da frase nos dois modos (loja única: "na nossa loja online"; multiloja: "na loja Use Sul"); `grep` não acha mais `Use ${…name}` nesses dois pontos.
- [ ] **T5. "Explorar estampas" como botão** (R2) · How: `Link` com a classe `btn` já usada nos CTAs, em `MeusLugaresView.tsx`. · Verify: captura 1440 e 390 da tela vazia; e2e de Minhas Estampas continua verde.
- [ ] **T6. Busca: mensagem antes do link e borda única** (R3, R4)
  - How: em `GlobalSearch.tsx`, o bloco "Não encontramos nada…" vem antes do "Ver todos os produtos…"; em `globals.css`, `.search-input:focus-visible` deixa o sublinhado transparente e mantém o quadro de foco.
  - Verify: teste (DOM) da ordem dos blocos sem resultado; capturas em repouso e com foco, 1440 e 390; o e2e `global-search` continua verde.
- [ ] **T7. Natal: campo do sobrenome antes da prévia no celular** (R5)
  - How: classes `order-*` no `CustomizerForm.tsx` só abaixo de `lg:`; a ordem de desktop não muda.
  - Verify: medir em 390 a posição do campo (meta: dentro da primeira tela, abaixo do título); captura 1440 igual à de antes; testes da personalização verdes.
- [ ] **T8. Validação local e PR 2** (R13) · How: `next dev` na worktree, abro duas janelas (1440 e 390) nas páginas tocadas; capturas em `docs/screenshots/ux-loja-rapidos/`; `graphify update .`; PR aberto. · Verify: **você valida local** antes de qualquer merge.

## PR 3 · site, "Você quis dizer…" (`feature/busca-quis-dizer`)

- [ ] **T9. `suggestPlace` pura, com testes** (R6)
  - How: distância de edição limitada (1 letra até 5 caracteres, 2 acima), sobre nomes e apelidos normalizados de lugares; só um candidato vencedor, empate ou termo de até 3 letras = nada.
  - Verify: unit com `florianopolsi`, `curitba`, termo sem par, 3 letras, empate, acento; orçamento de tempo sobre o índice real.
- [ ] **T10. Contrato e servidor** (R6) · How: `GlobalSearchResponse.suggestion?: string`, calculado em `searchGlobal` só com `total === 0` e `others` vazio. · Verify: os testes de busca existentes seguem verdes; novo teste da rota `/api/busca`.
- [ ] **T11. Interface e PR 3** (R6, R13) · How: `GlobalSearch` mostra "Você quis dizer **X**?" como botão que refaz a busca; capturas 1440 e 390; PR aberto. · Verify: no navegador, `florianopolsi` leva a Florianópolis; **você valida local**.

## PR 4 · Worker (`fix/ux-pdp-barra`, worktree em `worker-lojas`, a partir da `origin/main`)

- [ ] **T12. Worktree e sonda do Turbo** (R10) · How: worktree nova (o checkout atual do Worker tem trabalho em andamento e não é tocado); sonda de leitura em Playwright: versão do Turbo, e se o botão muda de estado durante o POST. · Verify: resultado registrado no PR; decide o desenho do R10.
- [ ] **T13. Barra "Adicionar" acima do aviso de cookies** (R8)
  - How: em `theme-ui.js`, observador mede `.cookie-acceptance` (celular) e grava `--o-cookie-h`; em `theme.js`, a barra ganha `bottom: var(--o-cookie-h, 0px)`.
  - Verify: DOM test (altura simulada, aviso aparece e some); `npm test` verde; prévia real `--headed` em 390 na primeira visita.
- [ ] **T14. "Adicionando…" imediato e sem toque duplo** (R10)
  - How: só escuta `turbo:submit-start` e `turbo:submit-end` (ou o equivalente que a sonda mostrar); não desabilita o botão antes do submit.
  - Verify: DOM test com envio, erro de rede e segundo toque; prévia real.
- [ ] **T15. Validação local e PR 4** (R13) · How: `preview-tema.mjs --headed` nas duas janelas; capturas em `docs/evidence/`; PR aberto, **sem release**. · Verify: **você valida local**.

## PR 5 · host sem www (`fix/host-sem-www`)

- [ ] **T16. Inventário do apex** (R11) · How: procurar `useorigens.com.br` sem `www` no repo, no Worker, nas docs de MCP/OAuth/webhooks/Merchant/Meta e nas variáveis de ambiente; tabela no corpo do PR. · Verify: cada uso classificado (API, página, config externa).
- [ ] **T17. `decideApexRedirect` + `proxy.ts`** (R11) · How: função pura em `lib/seo/canonical-host.ts`; só apex exato, GET/HEAD, fora de `/api`, `/.well-known`, `/admin`, `/media`, `/troca-foto`, `/estampas`, `/_next`; destino sempre do `siteUrl()`. · Verify: unit (apex, www, `/api`, POST, query) e `curl -I` com `Host:` forjado contra o servidor local.
- [ ] **T18. Texto da regra do Cloudflare e PR 5** (R11, R13) · How: o PR traz também a regra equivalente para o Cloudflare e a pendência do painel da INK (busca que posta no apex). · Verify: **você valida local**; merge só com seu pedido.

## Fechamento

- [ ] **T19.** Conferir cada R<n>: teste passando ou motivo escrito; listar o que ficou de fora.

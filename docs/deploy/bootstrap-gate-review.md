# Gate pré-deploy: bootstrap, sincronização e revalidação

Executa `CLAUDE_RAILWAY_BOOTSTRAP_PREDEPLOY_REVIEW.md`. Complementa `docs/deploy/infra-audit-review.md` (a
arquitetura em si — IBGE estático + snapshot INK em Volume + sync autenticado no próprio serviço — segue
aceita e não foi redesenhada).

## 1. O que já estava coberto e o que exigiu mudança

| Preocupação do gate | Situação antes | O que mudou | Arquivo/função |
|---|---|---|---|
| §1 Réplicas + Volume | Relatório afirmava (incorretamente) que réplicas compartilhariam o Volume | Corrigido nos dois documentos; registrado que redeploys têm breve indisponibilidade mesmo com healthcheck | `docs/deploy/infra-audit-review.md` §3, `docs/deploy/railway.md` |
| §2 Bootstrap com Volume vazio | Documentado em teoria (503/200 esperados), nunca demonstrado | Demonstrado de ponta a ponta contra `next start` real, com evidência reproduzível | `scripts/verify-bootstrap.mts` (novo) |
| §2 Vitrine vazia parecendo "funcionando" | Não existia gate — página renderizava normalmente com zero produtos | Novo `src/proxy.ts`: intercepta páginas públicas quando não pronto, responde 503 + `noindex`, nunca bloqueia health/ready/sync | `src/proxy.ts` (novo) |
| §2 Mount path presumido `/app` | Caminho fixo, hardcoded, nunca logado | Configurável (`CATALOG_SNAPSHOT_DIR`) e sempre logado por extenso no boot e em `/api/ready` | `src/lib/config/env.ts` (`catalogSnapshotDir`), `src/instrumentation.ts`, `src/app/api/ready/route.ts` |
| §3 "mtime invalida tudo" | Afirmação incorreta — só invalidava o objeto em memória, não o HTML/RSC do ISR | `revalidatePath` chamado após cada promoção bem-sucedida; provado com um teste real de antes/depois | `src/app/api/admin/catalog-sync/route.ts` (`revalidateCatalogPages`) |
| §4 Duração do sync via HTTP síncrono | Rota original fazia `await syncCatalog()` antes de responder — risco real de exceder os 5 min do proxy do Railway | Reescrita como job assíncrono (`after()`), resposta 202 imediata, status via `GET` | `src/app/api/admin/catalog-sync/route.ts`, `src/lib/catalog/sync-job.ts` (novo) |
| §4 Duas sincronizações simultâneas | Só a escrita atômica do arquivo protegia (não a decisão de "já tem uma rodando") | Lock explícito em memória, 409 na segunda tentativa | `src/lib/catalog/sync-job.ts` (`beginSyncJob`) |
| §5 "ready" fraco (1 produto, 1 cidade) | `ready: true` bastava ter qualquer cobertura > 0 | Critério de cobertura mínima (≥50% dos municípios da região), não uma contagem fixa | `src/lib/catalog/readiness.ts` (novo) |
| §5 Sincronização parcial sobrescrevendo dado bom | Qualquer fetch "bem-sucedido" (mesmo com poucos produtos) substituía o anterior | Guarda de regressão por loja: uma queda suspeita (>50%, ou ir a zero) é recusada, o dado anterior é mantido | `src/lib/catalog/sync-service.ts` (`shouldPromoteStore`) |
| §5 Volume não gravável | Erro genérico do Node (`EACCES`/`ENOTDIR`/etc.), fácil de perder no log | Erro rewrapped nomeando o caminho resolvido e perguntando se o volume está montado | `src/lib/catalog/snapshot-file.ts` (`SnapshotWriteError`) |
| §6 Checklist executável, backup/restore | `railway.md` documentava a arquitetura, não um passo a passo operacional | Reescrito com sequência de primeiro deploy, backup/restore, distinção healthcheck×monitoramento contínuo | `docs/deploy/railway.md` (reescrito) |
| §7 Performance vs. infraestrutura | Já registrado como investigação separada | Mantido — nenhuma alteração de performance feita nesta rodada (ver §7 abaixo) | — |

Uma descoberta não prevista na lista do gate, mas encontrada ao construir a prova do §2/§3 (ver §2 abaixo):
**um bug real e severo** em `compareIds` (`src/lib/catalog/ranking.ts`) — um `inkProductId` não-numérico
derrubava a construção do catálogo **inteiro** (não só daquele produto) com um erro não tratado. Corrigido e
coberto por teste — ver §5.

## 2. Bootstrap com Volume vazio — resultado reproduzível

`npm run verify:bootstrap` (requer `npm run build` antes) roda contra um `next start` real, aponta
`CATALOG_SNAPSHOT_DIR` para um diretório temporário genuinamente vazio (nunca toca nos dados de
desenvolvimento) e nunca chama a INK real. Execução mais recente, log completo:

```
Fixture covers 715/1191 Sul municipalities (>50% readiness bar).
Simulated empty Volume: /var/folders/.../verify-bootstrap-rKobhc

=== Step 1: bootstrap with an empty Volume ===
  OK   GET /api/health -> 200
  OK   GET /api/ready -> 503
  OK   reason mentions never synced
  OK   GET /sul/sc/tijucas -> 503 (maintenance gate, not a normal empty page)
  OK   maintenance response has X-Robots-Tag: noindex
  OK   maintenance response is not the normal page shell

=== Step 2: first sync (fixture A) via POST /api/admin/catalog-sync ===
  OK   POST (fixture A) -> 202
  OK   job finished with status succeeded
  OK   GET /api/ready -> 200 after sync

=== Step 3: warm a page with A, sync fixture B, confirm it serves B WITHOUT rebuild/restart ===
  OK   PDP now renders (ready)
  OK   PDP shows fixture A's price
  OK   search index route responds before second sync
  OK   POST (fixture B) -> 202
  OK   fixture B job succeeded
  OK   PDP now shows fixture B's price (ISR cache was actually invalidated)
  OK   PDP no longer shows fixture A's price

=== Step 4: concurrency lock — two syncs at once ===
  OK   exactly one 202 and one 409

=== Step 5: auth ===
  OK   POST with no Authorization -> 401
  OK   POST with wrong token -> 401

ALL CHECKS PASSED
```

**Por que a fixture cobre 715 cidades, não 1**: a primeira tentativa usou 1 cidade (Tijucas) e o próprio
critério de prontidão novo (§5, ≥50% de cobertura) corretamente a recusou como "not ready" — o que é o
comportamento certo (um sync de 1 produto realmente não deveria passar por pronto), mas significa que provar
o fluxo completo exige uma fixture que cubra o suficiente para ser um sync plausível, como um sync real faria.
A fixture usa ids reais de municípios do Sul (de `data/geo/municipios.json`, já versionado — nenhum dado
inventado) associados a um produto fictício.

## 3. Prova de atualização do HTML/ISR após mudança de snapshot

A afirmação anterior ("mtime invalida tudo") estava errada — `revalidate = 3600` é uma camada de cache
separada do arquivo em disco, e escrever um arquivo novo não a invalida sozinha. Corrigido chamando
`revalidatePath('/[region]', 'layout')` (cobre home, estado, cidade e PDP de uma vez, sem enumerar por
cidade) e `revalidatePath('/api/cidades/<região>')` por região habilitada, dentro da própria rota de sync,
logo após a promoção do snapshot ter sucesso.

**Prova, não afirmação**: o Passo 3 do log acima é exatamente esse teste — visita a PDP de Tijucas com a
fixture A (mostra "100"), sincroniza a fixture B (mostra "250") **sem rebuild nem restart do processo**, e a
mesma PDP já serve o preço novo na requisição seguinte. A busca (`/api/cidades/sul`) foi confirmada como
"aquecida" antes da segunda sincronização (mesma camada de cache, mesma rota `revalidatePath` cobre).

## 4. Duração da sincronização e decisão sobre endpoint

**Medição**: sem chamar a INK real (proibido para este teste), a duração foi estimada a partir de métricas já
conhecidas da execução real do catálogo (`/api/ready` numa sincronização anterior real mostrou
`use-sul: 9834 produtos`) e da paginação conhecida do cliente (`PER_PAGE = 100`, `PACE_MS = 1500` entre
páginas, sem paralelismo dentro de uma loja — `src/lib/ink/client.ts`): `use-sul` sozinha precisaria de
~99 páginas, ou **~2,5 minutos só de pacing** entre páginas (mais a latência real de cada requisição, e mais
qualquer backoff de `429`, que sozinho já soma 15–60s por ocorrência). As três lojas sincronizam em paralelo
entre si (`Promise.allSettled`), então a duração total é dominada pela maior loja, não pela soma — mas mesmo
assim, uma estimativa de ~3–4 minutos no caminho feliz está desconfortavelmente perto do limite de 5 minutos
do proxy do Railway, e qualquer variação real (rate limit, latência de rede) poderia ultrapassá-lo.

**Decisão**: dado que a duração estimada está perto o suficiente do limite para não ser segura, a rota foi
reescrita como um **job assíncrono** (`after()`, resposta 202 imediata, status via `GET`) em vez de uma
chamada HTTP síncrona — exatamente a opção descrita no gate como necessária "se a duração ou
imprevisibilidade ultrapassar limites seguros". Nenhum serviço de armazenamento novo foi adicionado só por
causa disso: o estado do job vive em memória, válido porque esta arquitetura é de instância única por
construção (§1).

## 5. Testes de falha, concorrência e persistência

Todos com teste automatizado (não só descrito em prosa):

- **Ausência de snapshot nunca é catálogo válido**: `snapshotStatus()` retorna `present: false` explícito;
  `/api/ready` responde 503 com o motivo; comprovado ao vivo no Passo 1 do bootstrap.
- **Falha total da INK não apaga o snapshot anterior**: `syncCatalog` usa `Promise.allSettled` — uma loja
  rejeitada mantém o que já estava no snapshot (`tests/unit/sync.test.ts`, e já era verdade antes desta
  rodada).
- **Falha parcial preserva as lojas não afetadas**, com resultado por loja observável em `GET
  /api/admin/catalog-sync` (`outcomes`).
- **Quantidade mínima e integridade antes de promover**: `shouldPromoteStore` recusa uma loja cujo fetch
  tecnicamente teve sucesso mas veio com queda suspeita (>50%, ou foi a zero enquanto antes tinha produtos) —
  7 testes em `tests/unit/sync.test.ts` cobrindo esses casos e o "piso" que evita falso-positivo em lojas
  pequenas.
- **Arquivo truncado/corrompido**: `readSnapshotSync`/`snapshotStatus` já tratavam isso como "presente, zero
  lojas" em vez de travar (comportamento de antes desta rodada, recoberto por teste).
- **`ready: true` reflete cobertura real**: critério de ≥50% dos municípios da região, não uma contagem fixa
  que impediria crescimento legítimo (`tests/unit/sync.test.ts`, `describe("readiness threshold")`).
- **Volume ausente/não gravável**: `writeSnapshot` relança o erro do Node com o caminho resolvido e uma
  pergunta direta ("is the volume mounted and writable?") em vez do erro genérico original — testado com um
  caminho cujo "diretório pai" é na verdade um arquivo, forçando um `ENOTDIR` determinístico
  (`tests/unit/sync.test.ts`).
- **Persistência após restart simulado**: o próprio `verify-bootstrap.mts` reaproveita o mesmo diretório entre
  a sincronização e as leituras seguintes sem reiniciar o processo; a garantia mais forte — que o Volume real
  sobrevive a um redeploy do Railway — é estrutural (o Volume não é apagado por um redeploy, só desmontado
  brevemente, ver `railway.md`), não algo que este ambiente consiga simular sem o Railway de verdade.
- **Nenhum segredo em resposta/log**: o erro de job (`finishSyncJobFailure`) grava só `err.message`, nunca o
  objeto de erro bruto; a comparação de token é `timingSafeEqual` (tempo constante); nenhuma rota loga o
  header `Authorization`.

Fluxo mantido estritamente **read-only** contra a INK — a única chamada é `fetchStoreProducts` (GET),
inalterada nesta rodada.

## 6. Correção documental e guia atualizado

- `docs/deploy/infra-audit-review.md` §3: a linha sobre "duas instâncias compartilhando o Volume" foi
  substituída pela citação exata do Railway ("Replicas cannot be used with volumes") e a nota sobre breve
  indisponibilidade em redeploy.
- `docs/deploy/railway.md`: reescrito — limitações do Volume logo no topo, tabela de variáveis com
  `CATALOG_SNAPSHOT_DIR` novo (e `ALLOW_FIXTURE_SYNC` deliberadamente **fora** da tabela, com aviso de nunca
  configurá-la em produção), seção de backup/restore, distinção healthcheck×monitoramento contínuo, sequência
  de primeiro deploy em endereço temporário antes do domínio definitivo, e a lista de troubleshooting
  ampliada com os novos modos de falha (409, cobertura insuficiente, escrita recusada).

## 7. Performance: não confundida com infraestrutura

Nenhuma mudança de performance/renderização foi feita nesta rodada. A investigação da rodada anterior
permanece válida e não foi re-medida aqui (o gate não pediu remedição, e refazer uma medição de Lighthouse sem
mudança de código real só adicionaria ruído): o LCP mobile do hero segue ~5s, dominado por atraso de
renderização (JS/hidratação), não por imagem, fonte ou chamada externa — INK/IBGE seguem com contribuição
zero, confirmado de novo nesta rodada pelos testes de interceptação de rede (`tests/e2e/infra.spec.ts`). O
achado de `fetchPriority`/preload ausente no banner do hero continua registrado como candidato a uma rodada de
otimização separada — nenhum Volume, cache ou mudança desta rodada afeta ou alega afetar esse número.

## 8. Resultados de testes

Todos executados após todas as correções acima:

- `npx tsc --noEmit --incremental false` — limpo.
- `npx eslint src scripts tests` — limpo.
- `npx vitest run` — **90/90 testes passando** (11 arquivos: os 6 já existentes + `tests/unit/sync.test.ts`,
  novo, com 20 testes de `shouldPromoteStore`, `promoteSnapshot`, `isCoverageReady` e o lock de concorrência;
  mais 3 testes de regressão em `tests/unit/indexer-ranking.test.ts` para o bug do `compareIds`).
- `npx playwright test` — **50/50 testes passando** (38 já existentes + 12 em `tests/e2e/infra.spec.ts`, 2 a
  mais que a rodada anterior: status da rota admin sem auth, e confirmação de que uma instância já pronta
  nunca mostra a tela de manutenção).
- `npx next build` — build de produção concluído com sucesso; a nova rota fica marcada dinâmica e o Proxy
  aparece na saída do build:
  ```
  ├ ƒ /api/admin/catalog-sync
  ├ ƒ /api/health
  └ ƒ /api/ready
  ƒ Proxy (Middleware)
  ```
- `npm run verify:bootstrap` — **todas as verificações passaram** (log completo em §2).

### Uma limitação honesta

Nenhum ambiente aqui reproduz um Railway real (réplicas, o proxy público de verdade, o comportamento exato de
um redeploy com Volume anexado). O que foi provado é o comportamento da **aplicação** sob essas condições
simuladas o mais fielmente possível localmente (`next start` real, Volume vazio real, sem rede real para a
INK); o que depende do Railway em si (montar o Volume no caminho certo, configurar o healthcheck, etc.) está
listado no §9 do "Retorno" e precisa ser confirmado no ambiente real na primeira vez.

## 9. Riscos residuais e recomendação GO/NO-GO

### Riscos residuais (conhecidos, não bloqueantes para um deploy em endereço temporário)

- **Duração real da sincronização não foi medida contra a INK de verdade** (só estimada analiticamente, §4).
  Recomendação: no primeiro sync real em produção, observar a duração efetiva via `GET
  /api/admin/catalog-sync` e ajustar a expectativa de agendamento se necessário.
- **Mount path do Volume depende de confirmação manual** no dashboard do Railway — o código loga o caminho
  resolvido, mas não pode adivinhar o mount real antes do primeiro deploy.
- **Nenhum monitoramento contínuo de `/api/ready`** está configurado (o healthcheck do Railway só cobre o
  rollout) — recomendado como próximo passo operacional, não bloqueante para o endereço temporário.
- **`fetchPriority` ausente no banner do hero** (achado de performance, não desta rodada) segue pendente de
  uma rodada de otimização à parte.

### Recomendação: **GO para o primeiro deploy no endereço temporário do Railway.**

A arquitetura foi corrigida onde estava errada (§1), o bootstrap com Volume vazio foi demonstrado com
evidência reproduzível (§2), a invalidação do ISR foi provada, não só afirmada (§3), a sincronização foi
redesenhada para respeitar os limites reais do proxy do Railway (§4), e as lacunas de integridade/prontidão
foram fechadas e testadas (§5) — incluindo um bug real e severo encontrado e corrigido no processo (§1, tabela).
Os riscos residuais listados acima são observáveis e operacionais (dependem de confirmação no dashboard e de
monitoramento contínuo), não de uma lacuna de código desconhecida. **Não é recomendação de GO para domínio
público/tráfego de produção** — isso depende da sequência do §9 acima (`docs/deploy/railway.md` — primeiro
sync no endereço temporário, `/api/ready` confirmado, só então o domínio real) ser executada manualmente pelo
usuário.

## 10. Passos manuais no Railway, em ordem (nada executado)

1. Confirmar/criar o serviço web a partir deste repositório (build: `npm run build`, start: `npm run start`);
   confirmar o diretório de trabalho real em Settings → Build.
2. Criar o Volume, mount path confirmado contra esse diretório real (não presumir `/app`).
3. Configurar as variáveis: `NEXT_PUBLIC_SITE_URL` (no build), `ADMIN_SYNC_TOKEN`, `INK_TOKEN_SUL` — e
   `CATALOG_SNAPSHOT_DIR` somente se o mount path não for o default. **Nunca `ALLOW_FIXTURE_SYNC`.**
4. Configurar o healthcheck apontando para `/api/health`.
5. Deploy no endereço temporário do Railway.
6. Conferir no log de boot o caminho do snapshot resolvido contra o mount do Volume.
7. Chamar `POST /api/admin/catalog-sync` uma vez; confirmar `succeeded` via `GET`.
8. Confirmar `/api/ready` 200 com cobertura real.
9. Configurar backup do Volume (schedule diário sugerido).
10. Só então: configurar o agendamento externo de sincronização periódica, e só então apontar o domínio
    público/tráfego real.

## 11. Confirmações finais

- **Nenhum Volume, serviço ou variável foi criado no Railway.**
- **Nenhum commit, push ou deploy.**
- **Nenhum domínio de produção ou tráfego real ativado.**
- **Nenhuma alteração na INK** além de leitura (mesma chamada `fetchStoreProducts`, inalterada).
- Todo o trabalho desta rodada rodou localmente: `next build`, `next start` (inclusive com Volume simulado
  vazio), `next dev`, `vitest`, `playwright`.

**Parar aqui para revisão humana, como pedido.**

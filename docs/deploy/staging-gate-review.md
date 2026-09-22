# Preflight de staging: preparação do primeiro deploy temporário no Railway

Executa `CLAUDE_USE_ORIGENS_RAILWAY_STAGING_GATE.md`. O gate local de bootstrap
(`docs/deploy/bootstrap-gate-review.md`) segue aceito — nenhuma arquitetura foi refeita nesta rodada, só
lacunas comprovadas foram corrigidas.

## (a) Estado real do git — o que o Railway realmente receberia hoje

```
$ git branch --show-current
main
$ git rev-list --left-right --count origin/main...HEAD
0	0
$ git log -1 --oneline
93b0ac6 docs(sul): commands, ADR 0003, editorial validation and audits
```

**`HEAD` está exatamente em `origin/main` — zero commits locais além do que já está no remoto.** Isso quer
dizer que **todo o trabalho desta sessão** (a reversão de mesorregiões, as correções do QA integrado, e toda a
arquitetura de infraestrutura/cache/Railway das três rodadas anteriores) existe **só como alterações não
commitadas na árvore de trabalho**. Se o Railway fizer deploy a partir do repositório agora, nada disso
estaria presente — a versão implantada seria exatamente o commit `93b0ac6`, sem o snapshot em Volume, sem
`/api/health`/`/api/ready`, sem `src/proxy.ts`, sem nada.

### Conjunto exato de arquivos, se for autorizado a commitar

**Código relevante para o deploy** (26 arquivos já rastreados, modificados; 13 novos):

<details>
<summary>26 arquivos modificados (rastreados)</summary>

```
.env.example
data/geo/municipios.json
package.json
scripts/build-geo.mts
scripts/sync-catalog.mts
src/app/[region]/[uf]/[city]/[family]/page.tsx
src/app/[region]/[uf]/[city]/page.tsx
src/app/[region]/[uf]/page.tsx
src/app/api/cidades/[region]/route.ts
src/components/city/StateCityBrowser.tsx
src/components/home/Campaign.tsx
src/components/home/RegionHero.tsx
src/components/home/StateCards.tsx
src/components/search/SearchDialog.tsx
src/lib/catalog/ranking.ts
src/lib/catalog/repository.ts
src/lib/catalog/snapshot-file.ts
src/lib/format.ts
src/lib/geo/cities.ts
src/lib/home.ts
src/lib/ink/config.ts
src/lib/search/rank.ts
src/lib/site.ts
tests/e2e/sul.spec.ts
tests/unit/editorial.test.ts
tests/unit/indexer-ranking.test.ts
```

</details>

<details>
<summary>13 arquivos de código novos (não rastreados)</summary>

```
scripts/verify-bootstrap.mts
src/app/api/admin/catalog-sync/route.ts
src/app/api/health/route.ts
src/app/api/ready/route.ts
src/instrumentation.ts
src/lib/catalog/readiness.ts
src/lib/catalog/sync-job.ts
src/lib/catalog/sync-service.ts
src/lib/config/env.ts
src/proxy.ts
tests/e2e/infra.spec.ts
tests/unit/infra.test.ts
tests/unit/sync.test.ts
```

</details>

**Documentação/artefatos não essenciais ao deploy** (podem ir num commit separado, ou ficar de fora, critério
do usuário):

```
docs/commands/CLAUDE_STOREFRONT_RAILWAY_CACHE_ENVS.md   (arquivo de comando, colocado pelo usuário — não gerado por mim)
docs/commands/CLAUDE_SUL_INTEGRATED_FINAL_QA.md          (idem)
docs/decisions/0004-editorial-mesoregion-navigation.md
docs/deploy/bootstrap-gate-review.md
docs/deploy/infra-audit-review.md
docs/deploy/railway.md
docs/deploy/staging-gate-review.md                       (este arquivo)
docs/design/screenshots/sul-integrated-final/ (20 imagens)
docs/design/sul-integrated-final-review.md
```

Nada foi commitado nesta rodada nem em nenhuma anterior — a lista acima é só a identificação pedida em §5(a),
não uma ação.

## (b) Avaliação com evidência: riscos de `after()` e de um restart/redeploy no meio de um sync

### O que foi medido/testado, e como

Não é seguro presumir que `POST 202` garante execução até o fim — testado diretamente:
`scripts/verify-bootstrap.mts`, passo 6, inicia um sync com um atraso artificial controlado
(`fixtureSyncDelayMs`, só disponível com `ALLOW_FIXTURE_SYNC=true`, nunca em produção) e mata o processo **no
meio** do job, antes de qualquer escrita.

**Uma descoberta real durante a construção desse teste** (não hipotética — reproduzida e corrigida): a
primeira versão do script matava o processo via `npx next start` (um wrapper) com `SIGKILL`. O
`next-server` real **sobreviveu como órfão**, terminou a sincronização sozinho em segundo plano, e o teste
"passou" relatando um estado que não correspondia ao cenário pretendido (processo morto). Causa: `SIGKILL`
nunca é encaminhado de um processo pai para os filhos que ele criou — isso é comportamento normal do Unix,
não um defeito específico do `npx`, e nenhuma camada de wrapper "resolve" isso sozinha. Corrigido matando o
**grupo de processos inteiro** (`detached: true` + `process.kill(-pid, ...)`), o análogo mais próximo, num
host compartilhado, do que o Railway faz de fato: derrubar o **container inteiro** (todo processo dentro dele
de uma vez) no redeploy, não um PID isolado.

### Limites efetivos pesquisados (não presumidos)

- **Duração máxima de uma requisição HTTP pelo proxy público do Railway**: 5 minutos sem transferir dados (até
  15 min se dados continuarem fluindo). Fonte:
  [specs and limits](https://docs.railway.com/networking/public-networking/specs-and-limits). Isso já
  motivou a rota ser assíncrona (rodada anterior) — sem mudança nesta rodada, só confirmação.
- **Carência de desligamento num redeploy**: por padrão, **0 segundos** entre `SIGTERM` e `SIGKILL`
  (`RAILWAY_DEPLOYMENT_DRAINING_SECONDS`). Na prática, um redeploy pode encerrar o container quase
  instantaneamente, sem qualquer garantia de tempo para o `after()` terminar. Fonte:
  [RAILWAY_DEPLOYMENT_DRAINING_SECONDS](https://station.railway.com/questions/railway-deployment-draining-seconds-and-b76587af).
- **`after()` em si**: documentado como rodando "pelo tempo padrão ou configurado da rota" — não tem uma
  garantia própria de sobreviver além da vida do processo; num servidor Node.js persistente (Railway, não
  serverless) ele roda normalmente enquanto o processo existir, e é interrompido junto se o processo morrer.
  Fonte: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md` (deste repositório).

### O que acontece se o processo reiniciar/houver redeploy durante o job (documentado e testado)

- **Lock e status em memória se perdem** — de propósito. Um processo novo sempre começa `{"status":"idle"}`,
  nunca herda um "running" que nunca vai terminar. **Provado**: passo 6 do script, `GET
  /api/admin/catalog-sync` no processo reiniciado voltou `idle`.
- **O snapshot anterior nunca é corrompido.** Escrita sempre em `.tmp` + `rename` atômico; um processo morto
  antes do `rename` nunca tocou o arquivo real. **Provado**: bytes do arquivo idênticos antes/depois do
  `SIGKILL` no meio do job.
- **Um novo sync pode começar imediatamente após o restart**, sem nenhum passo manual de limpeza. **Provado**:
  passo 6, um sync normal rodado logo após o restart simulado teve sucesso e a PDP passou a mostrar o dado
  novo.
- **Nenhuma resposta ficou "enganosa"**: `/api/ready` no processo reiniciado refletiu corretamente o último
  dado bom (não o job interrompido), sem inconsistência entre o que o snapshot tem e o que a API relata.

### Bug encontrado — não hipotético, real e corrigido

Ao montar a fixture inicial para provar esse cenário, um `inkProductId` sintético não-numérico derrubou
`compareIds()` (`BigInt()` lançando `SyntaxError`), o que **quebrava a construção do catálogo inteiro** (todas
as cidades, não só o produto com o id ruim) — coberto e corrigido na rodada anterior
(`docs/deploy/bootstrap-gate-review.md` §1), reconfirmado aqui como ainda corrigido (testes de regressão
passando).

### Nenhum Redis/banco/serviço adicionado só por precaução

Conforme pedido explicitamente — a mitigação para tudo acima foi 100% dentro do que já existia: escrita
atômica (já existia), lock em memória (rodada anterior), e a correção do harness de teste. Nenhuma
infraestrutura nova.

## (c) Checklist do Railway (sem valores)

| Item | Ação |
|---|---|
| Serviço | Confirmar o serviço existente, repositório e branch de origem (`main`) |
| Build | `npm run build` |
| Start | `next start` (direto — **não** `npm run start`; ver `docs/deploy/railway.md`, "Por que o Start Command roda `next start` direto") |
| Working directory | Confirmar em Settings → Build; **não presumir `/app`** |
| Volume | Mount path = working directory confirmado + `/data/generated`; se divergir, definir `CATALOG_SNAPSHOT_DIR` (caminho absoluto) em vez de mudar o mount |
| `NEXT_PUBLIC_SITE_URL` | Runtime **e build** — apontar para o **domínio definitivo real**, não para o endereço temporário do Railway (é esse descompasso que mantém o staging fora de indexação) |
| `INK_TOKEN_SUL` | Runtime — necessária só para o primeiro sync real |
| `ADMIN_SYNC_TOKEN` | Runtime — sem ela a rota de sync fica desabilitada (503) |
| `INK_API_BASE_URL` | Runtime, só se precisar divergir do default |
| `COMMERCE_STORE_PRIORITY` | Runtime, só se precisar divergir do default (`regional`) |
| `PORT` | **Não definir manualmente** — o Railway injeta |
| `ALLOW_FIXTURE_SYNC` | **Nunca definir** — não é uma variável operacional, existe só para os scripts de verificação local |
| Healthcheck | `/api/health` |
| Gate de tráfego | `/api/ready` — 503 esperado logo após o primeiro deploy, antes do primeiro sync |
| Réplicas | Nenhuma — Volume implica instância única; esperar breve indisponibilidade em cada redeploy |
| Backup do Volume | Configurar (schedule diário sugerido) antes de qualquer sync real |

## (d) Procedimento detalhado — NÃO executar nesta rodada

1. Com autorização, decidir e commitar/pushar o conjunto de arquivos de §(a).
2. Com autorização, configurar Volume, variáveis (tabela em §(c)) e healthcheck no dashboard; publicar **só**
   no endereço temporário do Railway.
3. Verificar, nessa ordem: log de boot (caminho do snapshot resolvido) → `GET /api/health` 200 →
   `GET /api/ready` 503 → `GET /sul` 503 com `X-Robots-Tag: noindex` presente.
4. Com autorização, `POST /api/admin/catalog-sync` **uma vez**, read-only contra a INK real. Acompanhar com
   `GET` na mesma URL até `"status":"succeeded"` ou `"status":"failed"` — **nunca** interpretar o `202` inicial
   como conclusão. Anotar a duração real (`finishedAt` − `startedAt`) e examinar `outcomes` por loja.
5. Exigir `GET /api/ready` → `200` com cobertura real reportada em `coverageByRegion` — conferir os números
   contra o baseline conhecido do catálogo (não só que `ready: true` apareceu; o limiar de 50% é uma proteção
   mínima contra sync catastroficamente parcial, não o critério de "a loja está boa o suficiente para
   liberar", que é uma decisão humana olhando os números reais).
6. Validar manualmente: home, busca, estado, cidade e PDP — imagens, preços, slugs e links reais. Confirmar
   que uma segunda visita à mesma página (sem restart) já reflete o sync (mesmo mecanismo provado em
   `verify-bootstrap.mts`); confirmar persistência após um restart/redeploy planejado do próprio serviço.
7. Configurar backup do Volume e um monitoramento contínuo de `/api/ready` (o healthcheck nativo do Railway só
   cobre o rollout, não monitora depois).
8. Só então configurar o agendamento externo de sincronização periódica — o agendador deve sempre acompanhar
   `GET` até um status terminal, tratar `409` (sync já em andamento) sem erro, e alertar se um job ficar
   "running" por tempo anormalmente longo.
9. Só então apontar o domínio definitivo — o que faz `NEXT_PUBLIC_SITE_URL` e o `Host` real coincidirem e o
   `noindex` deixar de ser aplicado automaticamente.

## (e) Testes adicionados nesta rodada

- `scripts/verify-bootstrap.mts`, passo 6 (novo): kill em pleno job (`fixtureSyncDelayMs`, test-only),
  confirma snapshot intacto, job reseta para `idle` após restart, dado antigo continua servido, e um sync novo
  funciona normalmente depois — tudo com evidência de log, não só descrito.
- `tests/e2e/infra.spec.ts`: novo teste confirmando que um Host não-canônico (o caso real de um endereço
  temporário) recebe `X-Robots-Tag: noindex` mesmo com o catálogo pronto; teste existente de "página pronta
  não mostra manutenção" ajustado (a asserção de ausência de `noindex` não fazia mais sentido depois de §3 —
  ver abaixo).
- `src/proxy.ts`: nova lógica de comparação de Host (`isCanonicalHost`) — coberta pelo teste e2e acima, já que
  é fundamentalmente sobre comportamento HTTP real, não uma função pura isolada que valesse a pena testar via
  unidade separadamente.

Resultados depois de tudo:

- `npx tsc --noEmit --incremental false` — limpo.
- `npx eslint src scripts tests` — limpo.
- `npx vitest run` — **90/90**.
- `npx playwright test` — **51/51** (50 anteriores + 1 novo).
- `npx next build` — sucesso, `Proxy (Middleware)` e as 3 rotas dinâmicas presentes na saída.
- `npm run verify:bootstrap` — **todas as verificações passaram**, incluindo o novo passo 6 (log completo
  disponível sob pedido; resumo: bootstrap vazio, primeiro sync, prova de revalidação do ISR, lock de
  concorrência, autenticação, e agora também sobrevivência a um kill no meio do job — todos verdes).

## (f) Pendências e ponto de aprovação

### Pendências (nenhuma bloqueante para os passos §(d) que dependem só de mim — já feitas; as que restam
dependem do usuário)

- Decidir se/quando commitar o conjunto de arquivos listado em §(a).
- Confirmar o `NEXT_PUBLIC_SITE_URL` definitivo antes do primeiro build de deploy (é build-time).
- Gerar o `ADMIN_SYNC_TOKEN` real (ex. `openssl rand -hex 32`) fora deste chat.
- Decidir o valor de capacidade/monitoramento do Volume e a cadência do backup.
- Decidir o mecanismo de agendamento externo (serviço de Cron do Railway fazendo só uma chamada HTTP, ou outro
  agendador) — nenhum foi criado.

### Ponto explícito de aprovação

Este documento **não** autoriza, e eu não vou executar sem uma instrução explícita nova:

1. `git add` / `git commit` / `git push` de qualquer arquivo listado em §(a).
2. Criar Volume, variáveis ou qualquer recurso no dashboard do Railway.
3. Qualquer deploy, mesmo no endereço temporário.
4. Qualquer chamada real a `POST /api/admin/catalog-sync` contra a INK de produção.
5. Apontar qualquer domínio, temporário ou definitivo.

**Aguardando autorização explícita para cada um dos itens acima, separadamente.** Parando aqui para revisão.

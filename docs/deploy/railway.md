# Deploy no Railway

Este documento descreve como o storefront `/sul` (Next.js) é preparado para rodar no Railway: uma única
aplicação web, sem banco de dados ou Redis, com o catálogo INK servido de um snapshot local em disco. Nada
aqui foi executado — é o roteiro para o usuário aplicar no dashboard do Railway.

> **Correção desta rodada (gate pré-deploy):** uma versão anterior deste documento sugeria que réplicas do
> serviço web poderiam compartilhar o Volume. Isso está **errado** — a documentação do Railway afirma
> expressamente "Replicas cannot be used with volumes". Esta arquitetura é de **instância única por
> construção**, não por escolha. Ver "Limitações do Volume" abaixo.

## Visão geral da arquitetura

- **Um serviço Railway, uma única instância** (sem réplicas — ver limitação acima). A aplicação Next.js
  (`next start`), sempre no ar.
- **Nenhum banco de dados, nenhum Redis, nenhum serviço adicional.** Ver "Por que não Redis/DB" abaixo.
- **Um Volume** anexado a esse mesmo serviço, montado exatamente no caminho onde a aplicação lê/escreve o
  snapshot do catálogo. O caminho é resolvido pelo próprio código (`src/lib/config/env.ts`,
  `catalogSnapshotDir()`) e **logado por extenso no boot** (`src/instrumentation.ts`) e em `GET /api/ready` —
  nunca presuma `/app`, confira o valor real nos logs do primeiro deploy. Por padrão é `data/generated` dentro
  do diretório de trabalho do processo; se o mount real precisar ser outro, defina `CATALOG_SNAPSHOT_DIR`
  (caminho absoluto) sem precisar mudar código.
- **Sincronização do catálogo INK**: acionada manualmente (ou por um agendador externo) chamando
  `POST /api/admin/catalog-sync` (autenticada por token) na PRÓPRIA aplicação — não um serviço separado. A
  sincronização roda como um **job assíncrono em background** dentro do processo (não uma requisição HTTP
  síncrona de vários minutos) — ver "Sincronização do catálogo" abaixo para o motivo e o contrato exato.
- **Geografia do IBGE**: já é um arquivo versionado no repositório (`data/geo/municipios.json`, gerado por
  `npm run geo:build`, agora com verificação de schema e guarda de cobertura) — nada a configurar no Railway
  para isso. Ver ADR 0004.
- **Gate de bootstrap**: enquanto o catálogo não tiver cobertura suficiente (ver "Critério de prontidão"),
  `src/proxy.ts` intercepta toda página pública e responde com uma tela de indisponibilidade (503, `noindex`)
  em vez de deixar a loja parecer "funcionando" com zero produtos. Nunca bloqueia `/api/health`,
  `/api/ready` ou `/api/admin/catalog-sync`.

```
┌──────────────────────────────────────────────────────┐
│ Railway: serviço "web" (Next.js, instância única)     │
│                                                        │
│  data/geo/municipios.json      ← no bundle (git)      │
│  <CATALOG_SNAPSHOT_DIR>/catalog-snapshot.json ← Volume│
│                                                        │
│  src/proxy.ts: não pronto? → 503 "só um instante"     │
│    (nunca intercepta as rotas abaixo)                 │
│  GET  /sul, /sul/:uf, /sul/:uf/:city, PDP             │
│    → lê o snapshot local (nunca chama INK)            │
│  GET  /api/health   → liveness, sem I/O               │
│  GET  /api/ready    → readiness real (cobertura ≥50%) │
│  POST /api/admin/catalog-sync (autenticado)           │
│    → única rota que chama a INK; async job + lock     │
│    → escreve no mesmo Volume acima + revalida o ISR   │
│  GET  /api/admin/catalog-sync (autenticado)           │
│    → status do último/atual job de sync               │
└──────────────────────────────────────────────────────┘
```

## Limitações do Volume (confirmadas na documentação do Railway)

- **Réplicas não são suportadas com Volume anexado.** Esta arquitetura nunca escala horizontalmente sobre o
  Volume atual — é de instância única por construção. Se escala for necessária no futuro, será com outra
  estratégia de armazenamento (fora do escopo atual).
- **Redeploys de um serviço com Volume têm uma breve indisponibilidade**, mesmo com healthcheck configurado:
  o Railway impede duas versões ativas montadas no mesmo Volume ao mesmo tempo ("we prevent multiple
  deployments from being active and mounted to the same service"). Planeje deploys fora de pico se isso
  importar; não há como evitar com a arquitetura atual.
- Fonte: [Volumes reference](https://docs.railway.com/volumes/reference).

## Variáveis de ambiente

| Nome | Finalidade | Obrigatória? | Build ou runtime | Serviço | Exemplo (não sensível) |
|---|---|---|---|---|---|
| `PORT` | Porta em que o servidor escuta | Injetada automaticamente pelo Railway — **nunca fixar um valor** | Runtime | web | *(não definir manualmente)* |
| `NEXT_PUBLIC_SITE_URL` | URL pública, usada em canonical/OG **e** para decidir quando marcar `noindex` (`src/proxy.ts`) | Recomendada (tem fallback) | **Build** (prefixo `NEXT_PUBLIC_` é embutido no bundle do cliente — confirme o domínio alvo antes do build) | web | `https://sul.useorigens.com.br` |
| `INK_API_BASE_URL` | Base da API da INK | Não (tem default) | Runtime | web (só é lida pelo caminho de sync) | `https://api.reserva.ink` |
| `INK_TOKEN_SUL` | Credencial da loja Use Sul na INK | Sim, para sincronizar o Sul | Runtime | web (só é lida pelo caminho de sync) | *(segredo — não preencher aqui)* |
| `INK_TOKEN_NORTE` | Credencial da loja Use Norte | Não (Norte não está habilitado) | Runtime | web | *(segredo)* |
| `INK_TOKEN_CENTRO` | Credencial da loja Use Centro-Oeste | Não (não está habilitado) | Runtime | web | *(segredo)* |
| `ADMIN_SYNC_TOKEN` | Token Bearer que autoriza `POST`/`GET /api/admin/catalog-sync` | Sim, para poder sincronizar em produção (sem ela a rota fica desabilitada, 503) | Runtime | web | *(segredo — gerar com `openssl rand -hex 32`)* |
| `CATALOG_SNAPSHOT_DIR` | Diretório do snapshot (onde o Volume deve ser montado) | Não (default `data/generated` no working directory) | Runtime | web | *(caminho absoluto, ex. `/app/data/generated` — só definir se o default não bater com o mount real)* |
| `COMMERCE_STORE_PRIORITY` | Override da prioridade de loja entre regiões | Não (default `regional` já é o comportamento certo hoje) | Runtime | web | `regional` |
| `NEXT_PUBLIC_META_PIXEL_ID` | Meta Pixel ID do storefront `/sul` (`CLAUDE_USE_ORIGENS_META_PIXEL_INK_ESTADOS.md`) | Não (sem ela, `MetaPixel` não renderiza nada — sem `<Script>`, sem request — independente do consentimento; a loja continua 100% funcional) | **Build** (prefixo `NEXT_PUBLIC_` é embutido no bundle do cliente — definir onde o BUILD roda, não só onde o container inicia) | web | `1558923262073052` |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | GA4 Measurement ID do storefront `/sul` (`CLAUDE_GA4_STOREFRONT_TRACKING.md`) | Não (sem ela, `GoogleAnalytics` não renderiza nada — mesma regra do Pixel acima; a loja continua 100% funcional) | **Build** (prefixo `NEXT_PUBLIC_` é embutido no bundle do cliente — definir onde o BUILD roda, não só onde o container inicia) | web | `G-8GYTEJ1F77` |

Mesmo com `NEXT_PUBLIC_META_PIXEL_ID`/`NEXT_PUBLIC_GA_MEASUREMENT_ID` definidas, o Pixel e o GA4 só carregam
depois que a pessoa aceita o banner de consentimento (`src/lib/consent`) — nenhuma das duas variáveis sozinha
dispara rastreamento. Nenhuma delas é um segredo (são embutidas no HTML/bundle do cliente de qualquer forma),
mas seguem documentadas aqui como as demais variáveis de build.

No endereço temporário do Railway (`*.up.railway.app`), o GA4 pode ficar configurado para validação técnica,
mas evite poluir a propriedade real com eventos de um domínio de staging se não for estritamente necessário —
prefira validar localmente com o Pixel Helper/DebugView e mock de rede sempre que possível. Se for preciso
testar eventos reais no Railway, deixe registrado que são eventos de teste (ex. um segmento/anotação no GA4),
e não crie um novo stream/filtro sem autorização.

**Nunca definir `ALLOW_FIXTURE_SYNC` em produção.** Existe só para o script de verificação local
(`npm run verify:bootstrap`) provar que a sincronização e a invalidação de cache funcionam sem chamar a INK
de verdade — quando ativa, `POST /api/admin/catalog-sync` aceita promover um snapshot arbitrário enviado no
corpo da requisição. Não está na tabela acima de propósito; não deve fazer parte de nenhum ambiente do
Railway.

**Nenhuma variável da INK é necessária para a aplicação web servir páginas.** Ela só lê o arquivo local do
snapshot. As `INK_TOKEN_*` e `INK_API_BASE_URL` só importam no momento em que `POST /api/admin/catalog-sync`
é efetivamente chamado.

Nenhum valor secreto está neste arquivo, em `.env.example` ou em qualquer log/resposta da aplicação — apenas
os nomes e exemplos não sensíveis.

## Build e start

- **Build command**: `npm run build` (padrão do Nixpacks para Next.js — nada a mudar). **Confirme o diretório
  de execução real** em Settings → Build do serviço antes de configurar o Volume (a seção seguinte assume
  `/app`, mas isso é uma convenção do Nixpacks, não uma garantia).
- **Start command**: `next start` (direto, **não** `npm run start`) — ver "Por que o Start Command roda `next
  start` direto" abaixo. O Next.js já lê `PORT` do ambiente e já faz bind em `0.0.0.0` por padrão nesta versão
  (confirmado na documentação da própria versão instalada,
  `node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md`) — nenhuma mudança de código foi
  necessária para isso. **Nunca fixar `PORT`** manualmente nas variáveis do serviço.
- Next.js 16.3.5.

### Por que o Start Command roda `next start` direto

`npm run start` funciona (é só um wrapper que executa `next start`), mas insere uma camada de processo entre o
que o Railway supervisiona e o `next-server` de fato — `npm` → shell → `next start` → `next-server`. Testado
localmente (`npm run start`, depois `SIGTERM` no processo do `npm`): funcionou, o sinal propagou corretamente
até o `next-server` e todos morreram juntos. Mas ao reproduzir o cenário de "processo morto no meio de um
sync" para `scripts/verify-bootstrap.mts`, uma variante do teste que passava por `npx` (uma camada a mais)
**não** propagou o `SIGKILL` — o `next-server` real sobreviveu como órfão, terminou a sincronização sozinho em
segundo plano, e o teste passou a mentir sobre "a instância antiga morreu". Isso é comportamento normal de
Unix (`SIGKILL` nunca é encaminhado de um processo para os filhos que ele mesmo criou — nenhuma camada de
wrapper "conserta" isso sozinha), não um bug específico do `npx`.

Duas mitigações, uma para o Railway e uma para quem testar isso localmente de novo:

- **No Railway**: apontar o Start Command para `next start` diretamente elimina uma camada de indireção (o
  processo que o Railway já supervisiona e mata é o `next` em si). Isso por si só não garante que um
  `next-server` filho morra junto de um `SIGKILL` — mas o Railway não mata processo por processo: ele derruba
  o **container inteiro** no redeploy (todo o cgroup, não um PID isolado), o que é diferente do meu teste local
  num host compartilhado onde um órfão pode sobreviver fora da árvore de processos do script. Ainda assim,
  apontar direto para `next start` é estritamente mais simples e não tem contrapartida — sem motivo para manter
  a camada extra do `npm`.
- **Neste repositório**: `scripts/verify-bootstrap.mts` foi corrigido para spawnar o binário do `next`
  diretamente (não mais via `npx`) **e** em `detached: true`, matando pelo **grupo de processos**
  (`process.kill(-pid, ...)`) em vez de um único PID — a forma correta de simular "tudo nesse deploy morre
  junto", já que nenhum sinal Unix propaga de pai para filho automaticamente. Ver
  `docs/deploy/staging-gate-review.md` §2 para o log da reprodução e da correção.

## Configurando o Volume (ação manual no dashboard)

1. No serviço web do Railway, abrir a aba **Volumes** → criar um novo Volume.
2. Definir o **mount path** confirmando primeiro o diretório de trabalho real do serviço (Settings → Build);
   tipicamente `/app/data/generated` num build Nixpacks padrão, mas **verifique**, não presuma.
3. Se o mount path não puder ser exatamente esse, defina `CATALOG_SNAPSHOT_DIR` (caminho absoluto) apontando
   para onde o Volume foi de fato montado — o código lê essa variável em runtime, sem precisar de rebuild.
4. Redeploy do serviço para o mount surtir efeito. **No log desse deploy**, procure a linha
   `[boot] catalog snapshot: ...` — ela sempre imprime o caminho absoluto que a aplicação está checando.
   Confirme que bate com o mount path configurado.
5. **Capacidade e monitoramento**: comece com o tamanho mínimo do Railway (o snapshot atual tem ~8MB; folga
   generosa mesmo com o catálogo crescendo bastante). Acompanhe o uso na aba do Volume; o Railway atualiza o
   tamanho incremental com atraso de até algumas horas, não é um medidor em tempo real.
6. **Backup**: configurar um schedule de backup do Volume (Backups tab do serviço) — diário é razoável dado o
   tamanho pequeno e a baixa frequência de mudança. Restaurar: localizar o backup pela data na aba Backups e
   clicar Restore; o Railway monta um novo Volume com o conteúdo daquele backup no mesmo path, o anterior fica
   desmontado (não apagado) até você confirmar. Útil antes de um sync que trocaria um schema/formato do
   snapshot, ou antes de um rollback de versão do app que espera um schema antigo. Fonte:
   [Volumes backups](https://docs.railway.com/volumes/backups).

**Por que não um serviço de Cron separado com um Volume compartilhado**: Railway não permite anexar um mesmo
Volume a mais de um serviço. Um serviço de Cron rodaria em uma instância própria, com seu próprio disco vazio
(ou nenhum), desconectado do que o serviço web já tem gravado. Por isso a sincronização acontece **dentro do
próprio processo web** (via a rota autenticada), que já está no mesmo disco que os leitores.

## Sincronização do catálogo

`POST /api/admin/catalog-sync` chama a mesma função que `npm run catalog:sync` usa localmente
(`src/lib/catalog/sync-service.ts` — uma implementação só, nunca duas concorrentes).

### Por que é assíncrona, não uma chamada HTTP síncrona

O proxy público do Railway fecha uma requisição HTTP após **5 minutos sem transferir dados** (até 15 minutos
se dados continuarem fluindo, como heartbeats — o que não é o caso de uma chamada unária simples). Uma
sincronização completa, paginada a 1,5s por página (respeitando o rate limit da INK, `src/lib/ink/client.ts`),
pode facilmente se aproximar ou ultrapassar 5 minutos dependendo do tamanho do catálogo e de eventuais
backoffs por `429` — não é seguro assumir que uma chamada síncrona sempre completaria dentro do limite.
Fonte: [specs and limits](https://docs.railway.com/networking/public-networking/specs-and-limits).

Por isso, `POST /api/admin/catalog-sync`:

1. Valida autenticação e corpo da requisição.
2. Recusa com **409** se já houver uma sincronização em andamento nesta instância (lock em memória,
   `src/lib/catalog/sync-job.ts` — não depende só do `rename` atômico do arquivo).
3. Inicia o trabalho de fato via [`after()`](https://nextjs.org/docs/app/api-reference/functions/after) (roda
   depois da resposta ser enviada, ainda dentro do ciclo de vida da requisição do Next.js — funciona
   corretamente num servidor Node.js persistente como este, sem nenhuma ponte de `waitUntil` de plataforma
   serverless) e responde **202** imediatamente, com `startedAt`.
4. **Um agendador deve tratar 202 como "aceito", nunca como "concluído"** — precisa fazer `GET` na mesma URL
   (mesmo token) para confirmar o resultado:

```
GET /api/admin/catalog-sync
→ {"status":"running","startedAt":"...","storeKeys":[...]}
→ {"status":"succeeded","startedAt":"...","finishedAt":"...","result":{"outcomes":[...]}}
→ {"status":"failed","startedAt":"...","finishedAt":"...","error":"..."}
```

### Se o processo reiniciar ou houver redeploy durante um sync

`after()` não sobrevive além da vida do processo — nada aqui promete completar um job "não importa o quê". O
que é garantido, e testado (`scripts/verify-bootstrap.mts`, passo 6):

- **O snapshot anterior nunca é corrompido.** A escrita é sempre em um arquivo `.tmp` seguida de `rename`
  atômico; se o processo morre antes do `rename`, o arquivo real nunca foi tocado — o pior caso é um `.tmp`
  órfão, ignorado por qualquer leitor.
- **O lock em memória não sobrevive ao processo** — de propósito. Um processo novo sempre começa com
  `{"status":"idle"}`, nunca herda um "running" travado de uma tentativa anterior que nunca vai terminar.
- **O Railway não mata processo por processo**: um redeploy derruba o container inteiro (todo processo dentro
  dele, de uma vez), diferente de matar um PID isolado num host compartilhado — não há cenário em que "parte"
  do trabalho antigo sobrevive fora do container depois que o Railway decide substituí-lo. Por padrão, o
  Railway dá **0 segundos** de carência entre `SIGTERM` e `SIGKILL` num redeploy
  (`RAILWAY_DEPLOYMENT_DRAINING_SECONDS`, default 0) — na prática, equivalente a matar o container na hora,
  sem chance de limpeza. Fonte:
  [RAILWAY_DEPLOYMENT_DRAINING_SECONDS](https://station.railway.com/questions/railway-deployment-draining-seconds-and-b76587af).
- **Depois de um redeploy no meio de um sync**: o snapshot fica exatamente como estava antes da tentativa
  interrompida (o "último dado bom"), `/api/ready` reflete isso normalmente, e um novo sync pode ser iniciado
  imediatamente — não é necessário nenhum passo manual de "limpeza" além de rodar o sync de novo.
- Não é seguro presumir uma janela de execução maior que zero para o job depois que a resposta 202 foi
  enviada — se o redeploy acontecer no meio, o trabalho é perdido (não corrompido, só perdido) e precisa ser
  repetido.

### O que acontece após uma sincronização bem-sucedida

- **Último dado bom conhecido por loja**: uma loja que falhar mantém seus dados anteriores intactos
  (`sync-service.ts`, `Promise.allSettled`). Além disso, uma loja cujo fetch tecnicamente funcionou mas voltou
  com uma queda suspeita de produtos (mais de 50% a menos que antes, exceto lojas muito pequenas) **também não
  é promovida** — é tratada como uma resposta parcial da INK, não como um catálogo legitimamente menor
  (`shouldPromoteStore`, `src/lib/catalog/sync-service.ts`).
- **Escrita atômica** no Volume (`writeSnapshot`: escreve em `.tmp`, depois `rename`).
- **Invalidação do ISR** (`revalidatePath`): escrever o arquivo novo, sozinho, **não** atualiza o HTML/RSC já
  cacheado pelas páginas (`revalidate = 3600` é uma camada de cache separada do arquivo em disco — uma versão
  anterior deste documento afirmava, incorretamente, que a invalidação por `mtime` do cache em processo
  bastava; não basta). Após promover o snapshot com sucesso, a rota chama `revalidatePath('/[region]', 'layout')`
  **uma vez** (cobre home, estado, cidade e PDP de todas as regiões habilitadas, sem enumerar cidade por
  cidade) e `revalidatePath('/api/cidades/<região>')` para cada região habilitada (hoje só `sul` — uma
  chamada). Nunca milhares de chamadas.
- **Prova reproduzível**: `npm run verify:bootstrap` (ver abaixo) sincroniza um snapshot de fixture A, visita
  uma PDP, sincroniza um snapshot B diferente **sem rebuild nem restart**, e confirma que a mesma PDP já serve
  B na próxima requisição — a evidência de que a invalidação realmente funciona, não só a teoria.

### Como agendar

Nenhuma das opções abaixo foi criada por mim — decisão do usuário no dashboard:

1. **Um serviço de Cron do Railway que só faz uma chamada HTTP** (não guarda estado, não precisa de Volume):
   `curl -X POST -H "Authorization: Bearer $ADMIN_SYNC_TOKEN" https://<url-do-serviço-web>/api/admin/catalog-sync`,
   com o cron schedule configurado no próprio serviço (mínimo de 5 em 5 minutos no Railway; o catálogo não
   muda tão rápido, algo como a cada poucas horas é razoável) — mas o agendador deve fazer um segundo `curl`
   em `GET` na mesma URL para confirmar `succeeded` antes de considerar concluído.
2. **Qualquer agendador externo** (GitHub Actions com `schedule:`, cron-job.org, etc.) fazendo a mesma chamada
   e a mesma checagem de status.

**Só configure o agendamento depois de confirmar manualmente que um sync completo funciona** (chamar uma vez,
conferir `GET` até `succeeded`, conferir `/api/ready`).

## Critério de prontidão (`/api/ready`)

`ready: true` exige, para cada região habilitada, que pelo menos **50% dos municípios** tenham ao menos um
produto (`src/lib/catalog/readiness.ts`, `READY_COVERAGE_THRESHOLD`) — não apenas "existe 1 produto e 1
cidade". Esse limiar é uma razão, não uma contagem fixa: cresce com o catálogo real (hoje 1191/1191 no Sul,
bem acima do limiar) sem quebrar por causa de crescimento legítimo, mas ainda barra uma sincronização
catastroficamente parcial. `GET /api/ready` sempre mostra o detalhe por região (`coverageByRegion`).

Enquanto não estiver pronto, `src/proxy.ts` intercepta toda página pública (nunca `/api/health`, `/api/ready`
ou `/api/admin/catalog-sync`) e responde 503 com `X-Robots-Tag: noindex` e uma mensagem simples de
indisponibilidade — nunca uma vitrine "funcionando" com zero produtos.

## Noindex no endereço temporário de staging

O 503/`noindex` acima só cobre a janela em que o catálogo não está pronto. **O endereço temporário do Railway
(`*.up.railway.app` ou o que for atribuído) precisa continuar fora de indexação mesmo depois de `/api/ready`
virar 200** — essa é uma exigência separada, sempre ativa enquanto o domínio definitivo não estiver no ar.

`src/proxy.ts` resolve isso comparando o `Host` de cada requisição contra o host de `NEXT_PUBLIC_SITE_URL`:
quando não bate, toda resposta (pronta ou não) ganha `X-Robots-Tag: noindex`; quando bate, nenhum header é
adicionado. **Importante**: `NEXT_PUBLIC_SITE_URL` deve continuar apontando para o domínio definitivo real
durante o staging, não para o endereço temporário do Railway — é exatamente esse descompasso que mantém o
endereço temporário noindexado. Só quando o domínio definitivo estiver de fato servindo o tráfego é que os
dois coincidem e o header some.

## Health checks e monitoramento

- **Liveness** — `GET /api/health`: sempre `200 {"status":"ok"}`, sem nenhuma leitura de disco ou chamada
  externa. Configurar como o healthcheck do Railway (Settings → Healthcheck Path).
- **Readiness** — `GET /api/ready`: ver acima.
- **O healthcheck do Railway só roda durante o rollout de um deploy, não continuamente depois** ("Railway does
  not monitor the healthcheck endpoint after the deployment has gone live" —
  [Healthchecks](https://docs.railway.com/deployments/healthchecks)). Ou seja: ele garante que o deploy só
  fica ativo se `/api/health` responder 2xx na hora do rollout, mas não avisa se o serviço cair depois. Para
  monitoramento contínuo (inclusive de `/api/ready` — idade do snapshot, cobertura), é necessária uma
  ferramenta externa (o próprio Railway sugere algo como Uptime Kuma).

## Sequência recomendada de primeiro deploy

1. Deploy do serviço web no **endereço temporário** que o Railway atribui (nunca o domínio definitivo ainda);
   `NEXT_PUBLIC_SITE_URL` continua apontando para o domínio definitivo real, não para o endereço temporário
   (ver "Noindex no endereço temporário de staging" acima).
2. Confirmar `/api/health` 200 e, no log de boot, o caminho do snapshot resolvido.
3. Confirmar `/api/ready` 503 (`"no catalog snapshot on disk (never synced)"`), que uma página real (`/sul`)
   mostra a tela de indisponibilidade (não uma loja vazia), e que o header `X-Robots-Tag: noindex` está
   presente nessa resposta.
4. Chamar `POST /api/admin/catalog-sync` uma vez (manualmente); acompanhar com `GET` até `succeeded` — nunca
   tratar o `202` inicial como conclusão. Anotar a duração real observada (`finishedAt` − `startedAt`).
5. Confirmar `/api/ready` 200 com cobertura real (`coverageByRegion.sul.ratio` bem acima de 0.5) e que as
   páginas mostram produtos de verdade — e que o `X-Robots-Tag: noindex` **continua presente** mesmo com tudo
   pronto (endereço ainda é o temporário).
6. Validar home, busca, estado, cidade e PDP manualmente (imagens, preços, slugs, links) contra o baseline
   conhecido do catálogo.
7. Só depois disso: configurar backup do Volume e monitoramento contínuo; só depois disso, um agendamento
   externo de sincronização periódica (que sempre confere o `GET` até status terminal, nunca só o `202`); e só
   depois disso, apontar o domínio definitivo — o que faz o `NEXT_PUBLIC_SITE_URL` e o `Host` real coincidirem
   e o `noindex` deixar de ser aplicado.

## Verificação local reproduzível (`npm run verify:bootstrap`)

`scripts/verify-bootstrap.mts` automatiza exatamente essa sequência contra um `next start` real, com o
diretório do snapshot apontado para um diretório temporário genuinamente vazio (nunca toca nos dados de
desenvolvimento) — sem chamar a INK real (`fixtureSnapshot` + `ALLOW_FIXTURE_SYNC=true`, só nesse processo
filho). Cobre: bootstrap com Volume vazio, tela de indisponibilidade, primeiro sync, prova de invalidação do
ISR (sincroniza A, visita a página, sincroniza B, confirma que a mesma página já mostra B sem rebuild/restart),
trava de concorrência (duas sincronizações ao mesmo tempo → uma 202 e uma 409) e autenticação. Requer
`npm run build` antes. Resultado da última execução: **todas as verificações passaram** — ver
`docs/deploy/infra-audit-review.md` para o log completo.

## Rollback

Sem banco de dados, um rollback de código no Railway (voltar para o deploy anterior) não perde nem precisa
recriar dados: o Volume com o snapshot continua o mesmo, independente de qual versão do código está rodando
sobre ele — a menos que o schema do snapshot (`CatalogSnapshot.version`) mude entre versões; nesse caso,
restaure o Volume a partir de um backup anterior ao rollback (ver "Backup" acima) antes de reverter o código.

## Por que não Redis / banco de dados

- A única coisa que precisa sobreviver entre deploys é o snapshot do catálogo — um objeto de poucos MB, lido
  inteiro a cada rebuild do cache em processo. Um Volume + arquivo já resolve isso sem operar um serviço a
  mais, e sem os problemas de compartilhamento entre serviços que um Cron separado teria de qualquer forma.
- "Último dado bom conhecido por loja" e a guarda contra sincronizações parciais já estão implementados no
  nível do arquivo, sem precisar de TTLs, invalidação por chave ou qualquer feature que só um Redis/DB
  ofereceria.
- Tráfego é predominantemente leitura, com cache HTTP via ISR — não há padrão de escrita concorrente de alta
  cardinalidade que justifique um banco.
- Se um dia a INK oferecer webhooks em tempo real, ou o catálogo crescer a um tamanho que não caiba mais ler o
  arquivo inteiro por cache-miss, essa é a hora de reavaliar — não agora.

## Troubleshooting

| Sintoma | Causa provável | O que checar |
|---|---|---|
| `/api/ready` sempre 503, `reason` diz "never synced" | Volume não montado, ou nunca sincronizado | Log de boot (caminho do snapshot); Volumes do serviço no dashboard; chamar `POST /api/admin/catalog-sync` uma vez |
| `/api/ready` 503 com `reason` de "insufficient catalog coverage" | Sincronização terminou mas cobriu poucos municípios (partial sync real, ou a guarda de regressão recusou uma ou mais lojas) | `GET /api/admin/catalog-sync` para ver os `outcomes` por loja; rodar de novo |
| `POST /api/admin/catalog-sync` → 503 "not configured" | `ADMIN_SYNC_TOKEN` não definida | Definir a variável no serviço web |
| `POST /api/admin/catalog-sync` → 401 | Token errado no header `Authorization: Bearer ...` | Conferir o valor exato configurado no Railway |
| `POST /api/admin/catalog-sync` → 409 | Já existe uma sincronização em andamento | `GET` para ver o status; aguardar concluir |
| `POST /api/admin/catalog-sync` → 500 com mensagem sobre token INK | Nenhuma `INK_TOKEN_*` configurada | Definir ao menos uma |
| `POST /api/admin/catalog-sync` → 500 "could not write snapshot" | Volume não montado no caminho esperado, ou sem permissão de escrita | Conferir `CATALOG_SNAPSHOT_DIR` (ou o default) contra o mount real do Volume |
| Catálogo "voltou" a um estado antigo depois de redeploy | Volume não estava montado antes do deploy — o snapshot ficou só na instância anterior, agora descartada | Confirmar o Volume no dashboard antes de redeployar |
| Home mostra menos produtos que o esperado | Uma ou mais lojas falharam ou tiveram queda suspeita no último sync (dado anterior mantido) | `GET /api/admin/catalog-sync` lista `outcomes` por loja com o motivo |
| Página continua mostrando dados antigos logo após um sync bem-sucedido | Não deveria acontecer (revalidatePath roda como parte da promoção) — se acontecer, é uma regressão | Reproduzir com `npm run verify:bootstrap`, que testa exatamente esse caminho |

## Fontes consultadas para as decisões acima

- Railway — Volumes não podem ser usados com réplicas, e redeploys de um serviço com Volume têm breve
  indisponibilidade mesmo com healthcheck: [Volumes reference](https://docs.railway.com/volumes/reference).
- Railway — um Volume não pode ser anexado a mais de um serviço:
  [Shared Volumes (Central Station)](https://station.railway.com/feedback/shared-volumes-a4053215),
  [Allow Multiple Services to Mount Volume](https://station.railway.com/feedback/allow-multiple-services-to-mount-volume-be2ef425).
- Railway — Cron Jobs rodam o start command da instância em um schedule e depois encerram (não é um processo
  contínuo, mínimo de 5 em 5 minutos): [Cron Jobs | Railway Docs](https://docs.railway.com/cron-jobs).
- Railway — backups de Volume (manuais e agendados, restauração):
  [Volumes backups](https://docs.railway.com/volumes/backups).
- Railway — healthcheck só roda durante o rollout, não monitora continuamente depois:
  [Healthchecks](https://docs.railway.com/deployments/healthchecks).
- Railway — limites de rede pública: requisições fecham após 5 minutos sem transferir dados (até 15 min com
  dados fluindo): [specs and limits](https://docs.railway.com/networking/public-networking/specs-and-limits).
- Railway — no redeploy, a deployment antiga recebe `SIGTERM` e depois `SIGKILL`, com 0 segundos de carência
  por padrão (`RAILWAY_DEPLOYMENT_DRAINING_SECONDS`):
  [RAILWAY_DEPLOYMENT_DRAINING_SECONDS (Central Station)](https://station.railway.com/questions/railway-deployment-draining-seconds-and-b76587af).
- Next.js (versão instalada, 16.3.5) — `PORT`/hostname default de `next start`:
  `node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md` (dentro deste repositório).
- Next.js — `after()`, `revalidatePath`, e a renomeação de `middleware` para `proxy` (Node.js runtime por
  padrão a partir da v16): `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`,
  `.../revalidatePath.md`, `.../03-file-conventions/proxy.md` (dentro deste repositório).

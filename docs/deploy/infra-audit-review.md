# Infraestrutura do storefront: cache, sincronização e Railway

Executa `CLAUDE_STOREFRONT_RAILWAY_CACHE_ENVS.md`. Guia complementar de operação: `docs/deploy/railway.md`.

## 1. Diagnóstico — antes (o que o código realmente fazia)

Auditoria feita lendo o código, não presumindo nada. Resultado: **nenhuma chamada a quente à INK ou ao IBGE
acontecia em nenhuma rota** — mas o motivo era mais frágil do que parecia (ver "Falha atual" abaixo).

| Fonte | Quem consome | Quando consulta hoje | Cache/snapshot atual | TTL/invalidação | Falha atual | Ajuste necessário |
|---|---|---|---|---|---|---|
| IBGE | `scripts/build-geo.mts` | Só nesse script, executado manualmente (`npm run geo:build`) | `data/geo/municipios.json` — **versionado no git**, importado como JSON estático em `src/lib/geo/cities.ts` (embutido no bundle em `next build`, nunca lido do disco em runtime) | Nenhum TTL: é um dado de build, atualizado só quando o script roda de novo | Nenhuma — o script falha alto (`throw`) se o IBGE responder algo inesperado; a página nunca depende do IBGE estar no ar | Nenhum ajuste estrutural. Endurecido: verificação de schema + guarda de cobertura para nunca sobrescrever com um payload parcial/quebrado (ver §2) |
| INK: catálogo | Todas as rotas de página, via `getCatalog()` (`src/lib/catalog/repository.ts`) | **Nunca em request** — `getCatalog()` só lê `data/generated/catalog-snapshot.json` do disco local (`readFileSync`/`statSync`), cacheado em processo pela data de modificação do arquivo | O mesmo arquivo, escrito só por `npm run catalog:sync` (agora `src/lib/catalog/sync-service.ts`) | Sem TTL — o arquivo só muda quando o sync roda | **`data/generated/` está no `.gitignore`** — um deploy novo no Railway (a partir do git) não teria esse arquivo. `readSnapshotSync`/`readSnapshot` capturam o erro e devolvem silenciosamente um catálogo vazio (`EMPTY_SNAPSHOT`), sem log, sem erro visível: o site subiria com todas as páginas "funcionando" mas zero produtos em qualquer cidade | Persistência entre deploys (Volume) + sincronização acionável a partir da própria aplicação + observabilidade honesta (§3, §4, §5) |
| INK: preço/disponibilidade/slug/imagem | Idem — todos vêm de dentro do mesmo snapshot | Idem — nunca em request | Idem | Idem | Idem | Idem |

**Ponto exato onde uma chamada a quente *poderia* ter acontecido, e não acontece**: `src/lib/ink/client.ts`
(o único arquivo que faz `fetch` contra a INK) tinha, antes desta rodada, um único importador:
`scripts/sync-catalog.mts`. Nenhuma rota (`src/app/**`), nenhum componente, nenhuma função chamada durante o
render de página importa `ink/client.ts`, direta ou indiretamente — confirmado por busca textual no repositório
inteiro e agora também por teste automatizado (`tests/unit/infra.test.ts`, "no network calls while serving
pages": `fetch` é substituído por uma função que lança erro, e ler a geografia + o catálogo não dispara nada).
Isso também foi comprovado em nível de rede real: `tests/e2e/infra.spec.ts` intercepta toda requisição de rede
do navegador em `/sul`, `/sul/sc`, `/sul/sc/tijucas`, na PDP e na busca, e afirma que nenhuma delas contém
`reserva.ink` ou `servicodados.ibge.gov.br` — nem na primeira carga, nem numa segunda carga da mesma página
(cache quente).

## 2. Diagnóstico — depois (o que mudou)

Nada na *leitura* mudou (já era correta). O que mudou foi tornar a arquitetura **seguramente implantável e
observável**, corrigindo a lacuna real encontrada:

- `data/generated/` continua fora do git (correto — não devia ser versionado; é dado de produto, não de
  código, e são ~8MB binários/dinâmicos). Em vez disso, ganhou uma estratégia explícita de persistência via
  Volume do Railway (§3) e uma forma segura de popular/atualizar esse Volume a partir da própria aplicação
  (rota autenticada, §3).
- A falha silenciosa de "snapshot ausente → catálogo vazio, sem aviso" agora é observável em três lugares
  sem se tornarem chamadas de rede nem I/O pesado: log de boot (`src/instrumentation.ts`), `GET /api/ready`
  (503 explícito com o motivo) e a resposta de erro clara da rota de sync se for chamada sem nenhum token INK
  configurado.
- `scripts/build-geo.mts` ganhou verificação de schema (amostra da resposta do IBGE) e uma guarda de
  cobertura genérica (nunca escreve se o total caiu mais de 1% em relação ao arquivo já commitado, e nunca
  escreve se algum município do Sul ficar sem mesorregião) — antes disso, uma resposta parcial do IBGE teria
  sido aceita e commitada sem aviso.
- Config de ambiente, antes espalhada (`process.env.X` direto em 4 arquivos diferentes, sem validação),
  agora centralizada e validada (`src/lib/config/env.ts` + reforço em `src/lib/ink/config.ts`) — erros de
  configuração (URL inválida, chave de loja desconhecida em `COMMERCE_STORE_PRIORITY`) agora falham alto com
  mensagem clara, em vez de produzir um comportamento errado silencioso.

## 3. Arquitetura escolhida

**Um serviço Railway (a aplicação web), um Volume anexado a ele, zero serviços adicionais.** Diagrama e
variáveis completos em `docs/deploy/railway.md`; aqui vai o porquê.

### Por que não um serviço de Cron separado

A primeira ideia óbvia — um serviço de Cron do Railway rodando `npm run catalog:sync` periodicamente — **não
funciona neste caso**: Railway não permite anexar o mesmo Volume a mais de um serviço (limitação confirmada
na documentação/fórum oficial do Railway, sem previsão de suporte — fontes em `railway.md`). Um serviço de
Cron teria seu próprio disco vazio, desconectado do que o serviço web já tem gravado — o sync rodaria, mas o
resultado nunca chegaria a quem serve as páginas.

### Arquitetura escolhida: sync dentro do próprio processo web

`POST /api/admin/catalog-sync` (nova rota, autenticada por Bearer token) roda a mesma função que
`npm run catalog:sync` sempre rodou (`src/lib/catalog/sync-service.ts` — extraída para ser a única
implementação, usada pelos dois lugares). Por rodar **dentro do mesmo processo que lê o snapshot**, a escrita
cai no mesmo disco/Volume que os leitores já usam, e a leitura seguinte já enxerga o dado novo automaticamente
(o cache em processo de `getCatalog()` já invalida pela data de modificação do arquivo — nada precisou mudar
aí). Quem aciona essa rota, e com que frequência, fica de fora deste código: pode ser um serviço de Cron do
Railway que só faz uma chamada HTTP (sem Volume próprio, sem estado), ou qualquer agendador externo. Detalhes
em `railway.md`.

### Por que não Redis nem banco de dados

- O único dado que precisa sobreviver a deploys/reinícios é o snapshot inteiro do catálogo — não há padrão de
  leitura por chave individual, alta concorrência de escrita, nem necessidade de TTL por campo que
  justificasse um Redis.
- O comportamento "último dado bom conhecido por loja" (uma falha numa loja não apaga as outras) já está
  implementado no próprio arquivo, sem precisar de nenhuma feature de banco.
- As páginas já têm cache HTTP via ISR (`revalidate = 3600`) — a maior parte do tráfego nem chega a re-executar
  a leitura do snapshot.
- Um Volume + arquivo atende exatamente a necessidade real encontrada na auditoria, com uma peça de
  infraestrutura a menos para operar, monitorar e pagar. Se um dia a INK oferecer webhooks de mudança de
  produto/preço em tempo real, ou o catálogo crescer a um tamanho que não caiba mais ler o arquivo inteiro por
  requisição de cache-miss, essa é a hora de reavaliar — não agora.

### Caminho de leitura e atualização

```
Leitura (toda página, toda requisição):
  page.tsx → getCatalog() → readSnapshotSync(SNAPSHOT_PATH) → arquivo local no Volume
  (cacheado em processo até a mtime do arquivo mudar — nenhuma chamada de rede)

Atualização (acionada manualmente ou por um agendador externo):
  POST /api/admin/catalog-sync (Bearer ADMIN_SYNC_TOKEN)
    → syncCatalog() → fetchStoreProducts() por loja (paginado, 1 req/1.5s, backoff em 429)
    → writeSnapshot() atômico no mesmo Volume
  (a próxima leitura já vê o arquivo novo — sem restart)
```

### Comportamento em cada cenário (pedido explicitamente pelo comando)

| Cenário | Comportamento |
|---|---|
| Primeira carga (Volume vazio, nunca sincronizado) | Páginas carregam, mas sem produtos em nenhuma cidade. `/api/ready` → 503 com o motivo. Log de boot avisa. |
| Cache hit (arquivo não mudou) | `getCatalog()` devolve o objeto já construído em memória — nem `readFileSync` de fato relê o conteúdo além do `stat` para checar a mtime. |
| Cache expirado / arquivo mudou (novo sync rodou) | Próxima chamada de `getCatalog()` detecta a mtime nova, reconstrói o índice em memória a partir do arquivo. Sem downtime, sem restart. |
| Falha da INK durante um sync | A loja que falhou mantém seus dados anteriores no snapshot (implementado em `sync-service.ts`, `Promise.allSettled` + só sobrescreve a loja que teve sucesso); a rota responde com o detalhe de qual loja falhou. |
| Rebuild/deploy | `data/geo` (git) chega no bundle normalmente. `data/generated` (Volume) sobrevive ao deploy **se o Volume estiver montado** — se não estiver, volta ao cenário "primeira carga". |
| Duas instâncias simultâneas | **Correção (rodada de gate pré-deploy): não se aplica — Railway não permite réplicas em um serviço com Volume anexado.** A documentação do Railway afirma expressamente "Replicas cannot be used with volumes". Esta arquitetura é, portanto, **de instância única por construção**, não por escolha — não há cenário de duas instâncias lendo o mesmo Volume ao mesmo tempo para se preocupar. Se escala horizontal for necessária no futuro, será com outra estratégia de armazenamento (fora do escopo atual). Ver também: redeploys de um serviço com Volume têm uma breve indisponibilidade mesmo com healthcheck configurado ("we prevent multiple deployments from being active and mounted to the same service") — fonte: [Volumes reference](https://docs.railway.com/volumes/reference). |

## 4. Variáveis de ambiente

Tabela completa com serviço de destino, build vs. runtime e exemplos não sensíveis: `docs/deploy/railway.md`
(seção "Variáveis de ambiente"). Resumo:

- **Sem nenhuma variável obrigatória para a aplicação web servir páginas** — tudo tem um default seguro.
- `INK_TOKEN_SUL`/`NORTE`/`CENTRO` e `INK_API_BASE_URL` só são lidas pelo caminho de sincronização (a rota
  admin ou o script local) — nunca pela renderização de página.
- `ADMIN_SYNC_TOKEN` é nova: sem ela, `POST /api/admin/catalog-sync` fica desabilitada (503), nunca aberta.
- `NEXT_PUBLIC_SITE_URL` é a única que precisa existir no momento do **build** (convenção do Next.js para
  `NEXT_PUBLIC_*`), todas as outras são só runtime.
- `PORT` é injetada pelo próprio Railway; a aplicação já lê e faz bind em `0.0.0.0` corretamente (comportamento
  padrão desta versão do Next.js, `next start` — nenhuma mudança de código foi necessária).

Nenhum valor secreto aparece neste documento, em `railway.md` ou em `.env.example` — só nomes e exemplos não
sensíveis.

## 5. Arquivos alterados nesta rodada (infra/cache/env)

Novos:
- `src/lib/config/env.ts` — configuração validada (site URL, prioridade de loja, token admin, exigência de
  ao menos um token INK para sincronizar).
- `src/lib/catalog/sync-service.ts` — a única implementação de "sincronizar com a INK", usada pelo script e
  pela rota admin.
- `src/app/api/health/route.ts` — liveness.
- `src/app/api/ready/route.ts` — readiness, honesta, sem tocar em INK/IBGE.
- `src/app/api/admin/catalog-sync/route.ts` — sync manual autenticado.
- `src/instrumentation.ts` — log de boot do estado do snapshot (nunca bloqueia o início do servidor).
- `tests/unit/infra.test.ts` — 12 testes novos (config, status do snapshot, ausência de chamadas de rede).
- `tests/e2e/infra.spec.ts` — 10 testes novos (health, ready, rota admin sem auth, zero chamadas externas em
  4 rotas reais + busca + cache quente).
- `docs/deploy/railway.md` — guia operacional completo.
- `docs/deploy/infra-audit-review.md` — este documento.

Editados:
- `scripts/sync-catalog.mts` — agora um wrapper fino sobre `sync-service.ts` (mesmo comportamento observável).
- `scripts/build-geo.mts` — verificação de schema + guarda de cobertura (não sobrescreve com dado
  parcial/quebrado); nenhuma mudança no formato de saída.
- `src/lib/catalog/snapshot-file.ts` — nova `snapshotStatus()` (para health checks e o log de boot); pequena
  correção de borda (idade do snapshot nunca fica negativa por arredondamento de mtime).
- `src/lib/catalog/repository.ts` — lê a prioridade de loja através do config validado, em vez de
  `process.env` direto.
- `src/lib/ink/config.ts` — `INK_API_BASE_URL` agora validada como URL.
- `src/lib/site.ts` — `SITE_URL` agora validada como URL, através do config centralizado.
- `.env.example` — `ADMIN_SYNC_TOKEN` adicionada; comentários deixando claro o que é build-time vs. runtime e
  o que a aplicação web realmente precisa (nada da INK).

**Fora do escopo desta rodada** (arquivos já alterados e reportados na rodada de QA anterior,
`docs/design/sul-integrated-final-review.md`): a reversão para mesorregiões editoriais e as duas correções de
texto (PDP e diálogo de busca) — não tocados de novo aqui.

## 6. Testes e resultados

Executados nesta máquina, sem nenhum deploy:

- `npx tsc --noEmit --incremental false` — limpo.
- `npx eslint src scripts tests` — limpo.
- `npx vitest run` — **67/67 testes passando** (55 já existentes + 12 novos em `tests/unit/infra.test.ts`).
- `npx playwright test` — **48/48 testes passando** (38 já existentes + 10 novos em `tests/e2e/infra.spec.ts`).
  Numa primeira rodada, 3 testes falharam por timeout/URL não atualizada sob uma carga de sistema anormal
  desta máquina (load average chegou a 148 durante o teste, por processos completamente alheios a esta sessão
  — outras abas do Chrome, outras sessões do Claude Code rodando outros projetos); numa rerrodada isolada logo
  em seguida, com a carga ainda alta, 2 dos 3 ainda falharam; a suíte completa rodada de novo depois (carga já
  normalizada, load average 29) veio **48/48**, incluindo exatamente os mesmos testes que haviam falhado. Não
  toquei em nenhum código de navegação/busca nesta rodada — a leitura mais honesta é que foi instabilidade do
  ambiente, não uma regressão; documentado aqui em vez de omitido.
- `npm run geo:build` — reexecutado para validar a nova guarda de schema/cobertura: `municipios written: 2109`,
  sem lançar erro (cobertura do Sul intacta, sem queda de linhas em relação ao arquivo já commitado).
- `npx next build` — build de produção concluído com sucesso; as 3 novas rotas aparecem corretamente marcadas
  como dinâmicas (`ƒ`, nunca pré-renderizadas/cacheadas como estáticas):
  ```
  ├ ƒ /api/admin/catalog-sync
  ├ ƒ /api/health
  └ ƒ /api/ready
  ```

### Comportamento em indisponibilidade, verificado ao vivo (não só em teste)

Servidor de produção real (`next build` + `next start -p 3100`) rodando com o snapshot real já sincronizado:

```
GET /api/health  → 200 {"status":"ok"}
GET /api/ready   → 200 {"ready":true,"snapshot":{"present":true,"totalProducts":17394,...},
                        "coveredCitiesByRegion":{"sul":1191}}
POST /api/admin/catalog-sync (sem Authorization) → 503 "sync endpoint disabled: ADMIN_SYNC_TOKEN is not configured"
```

(`ADMIN_SYNC_TOKEN` não está configurada nesta máquina de desenvolvimento — por isso 503 em vez de 401; o
comportamento é o mesmo que produção teria sem essa variável definida, o que é intencional: a rota nunca fica
aberta por acidente.)

### Medições reproduzíveis de chamadas externas

`tests/e2e/infra.spec.ts` mede isso a cada execução (não é uma alegação pontual): intercepta toda requisição
de rede do Chromium em `/sul`, `/sul/sc`, `/sul/sc/tijucas`, na PDP, na busca, e numa segunda carga da mesma
página (cache quente) — e afirma zero requisições para `reserva.ink` ou `servicodados.ibge.gov.br` em todos os
casos. Isso já era verdade antes desta rodada (a auditoria não encontrou nenhuma chamada a quente); o que esta
rodada adiciona é a prova automatizada e repetível disso, em vez de uma inspeção manual pontual.

## 7. Desempenho mobile (LCP) — investigação, não otimização

O QA anterior mediu **LCP de 5,3s** (Lighthouse, mobile, throttling simulado padrão) em `/sul`. Investigado a
fundo nesta rodada, sem nenhuma alteração de código de performance (fora de escopo — ver §9).

### Elemento LCP real

Confirmado por duas fontes independentes (PerformanceObserver do próprio navegador via CDP, e o audit
`lcp-discovery-insight`/`lcp-breakdown-insight` do Lighthouse): o elemento LCP é a **imagem de fundo do hero**
(`section.relative > div.absolute > picture > img.absolute`, o banner `/banners/sul/hero-mobile.png`) — não o
texto do headline (que pinta antes, mas é menor) e não um card de produto.

### Quanto vem de cada coisa

| Fator | Contribuição | Evidência |
|---|---|---|
| **Chamadas externas (INK/IBGE)** | **Zero** | Confirmado estruturalmente (nenhum código no caminho de render as chama) e por medição de rede real (§6) — não é candidato a explicação para o LCP, ponto. |
| **Fontes** | **Zero** | `font-display-insight` do Lighthouse: 0ms de "wasted time"; o headline já pinta com uma fonte carregada aos 820ms, antes mesmo da imagem virar o elemento LCP. |
| **Bytes da imagem (rede)** | **Pequeno** | LCP breakdown do Lighthouse: TTFB 78ms + atraso de início 55ms + duração do download 34ms = **167ms**. A imagem já otimizada tem ~45KB — não é o gargalo. |
| **Prioridade de carregamento da imagem** | **Real, mas parcial** | `lcp-discovery-insight`: `fetchpriority=high should be applied` → **false**. A própria imagem do hero (`RegionHero.tsx` já passa `priority` para `RegionalPhotoSection`) não está recebendo `fetchPriority="high"` nem um `<link rel="preload">`, diferente dos cards de produto do mesmo hero, que corretamente têm os dois (confirmado lendo o HTML servido). Isso adia a descoberta do recurso pelo scanner de preload do navegador — mas como o download em si já é rápido (167ms), corrigir isso sozinho não fecharia a maior parte da diferença. |
| **Renderização / JavaScript** | **Dominante** | LCP breakdown do Lighthouse: **"element render delay" = 2072ms** — a imagem já teria os bytes prontos bem antes disso; o navegador simplesmente não pinta/compõe o elemento até ~2,2s. Consistente com: 1 requisição de CSS render-blocking (~161ms, `render-blocking-insight`) e 3 "long tasks" observadas (128+107+57 ≈ 292ms) via CDP, sob throttling de CPU 4×. Sob o throttling mais agressivo do Lighthouse (padrão mobile), esse mesmo trabalho de JS/hidratação/composição é ampliado — é a explicação mais plausível para a maior parte dos 5s de LCP. |

**Resumo**: o gargalo do LCP **não é imagem pesada, não é fonte, não é chamada externa** — é o tempo até o
navegador conseguir efetivamente pintar/compor o elemento (hidratação + trabalho de main thread), com uma
contribuição real mas secundária de a imagem do hero não estar marcada como prioritária.

### Antes/depois, nas mesmas condições

| Métrica (Lighthouse, mobile, throttling simulado) | Antes (rodada de QA anterior) | Depois (agora, mesmas condições) |
|---|---|---|
| LCP | 5,3s | 5,0s |
| FCP | 2,3s | 0,9s |
| Speed Index | 9,3s | 4,4s |
| Total Blocking Time | 470ms | 10ms |
| Performance score | 0,57 | 0,79 |

**Isso não é uma melhoria de código** — nenhuma linha de renderização da home foi tocada entre as duas
medições (só as novas rotas de API, o módulo de config e o script de sync, que não entram no caminho da home).
A diferença bate exatamente com a diferença de carga do sistema no momento de cada medição: `load average`
estava em ~148–175 durante a primeira rodada (esta mesma máquina, sob o peso de outras abas/sessões alheias a
este trabalho) e em ~29 durante a segunda. O LCP em si — dominado pelo "element render delay", medido de forma
mais robusta a ruído externo — variou pouco (5,3s → 5,0s); as métricas mais sensíveis a disputa de CPU do host
(FCP, Speed Index, TBT) variaram muito. Reportando os dois números com essa ressalva em vez de atribuir
qualquer ganho a este trabalho, como pedido explicitamente.

### Recomendação para uma rodada futura (não aplicada agora)

Adicionar `fetchpriority="high"` / preload à imagem de fundo do hero (hoje só os cards de produto do hero têm
isso) é uma correção pequena, objetiva e já evidenciada — mas por ser uma mudança de performance/renderização
fora da lista de correções explicitamente autorizadas nesta rodada, não foi aplicada. Fica registrada aqui como
o candidato mais concreto para a próxima rodada, junto com um perfil de CPU/JS mais profundo para explicar o
"element render delay" de ~2s, que é o fator dominante.

## 8. Verificações pontuais pedidas

### "Feito Para Você" — imagens vazias na captura full-page desktop

Confirmado: a captura full-page em 1440px de uma rodada anterior mostrava 4 de 6 cards de "Feito Para Você"
com a área de imagem em branco (mesmo padrão já visto em "Fala daqui" na rodada de QA anterior). Refeito o
teste com uma rolagem real (não uma captura instantânea de página inteira): **zero imagens quebradas** depois
do scroll — captura em `docs/design/screenshots/sul-integrated-final/19-feito-para-voce-after-real-scroll-1440.png`.
Mesma causa raiz de antes: `loading="lazy"` nativo não é acionado por uma captura de página inteira sem
rolagem real — não é um bug, é o comportamento esperado de lazy-loading.

### Rodapé — data de atualização de preços/disponibilidade

Verificado o código (`src/components/layout/SiteChrome.tsx:85`, função `Footer`): a data **não é fixa/hardcoded** —
é calculada a partir do `syncedAt` real de cada loja no snapshot (`catalog.syncedAt`, o mais recente entre as
lojas), formatada com `Intl.DateTimeFormat`. O texto nunca diz "agora"/"hoje" — diz exatamente "atualizados em
[data real]", o que é honesto mesmo quando o dado está velho. Hoje ele mostra "20 de setembro de 2026" porque
esse é, de fato, o último `npm run catalog:sync` já rodado (confirmado pela idade do arquivo e por
`/api/ready`, que reporta a mesma data por loja) — 2 dias antes da data de hoje. Captura ao vivo:
`docs/design/screenshots/sul-integrated-final/20-footer-price-date-1440.png`. **Nenhuma correção de código foi
necessária** — o mecanismo já é o correto; assim que um sync real rodar (manual ou pelo agendamento descrito em
`railway.md`), a data no rodapé acompanha automaticamente.

## 9. Pendências que dependem de ação no dashboard do Railway (em ordem, nada executado)

1. Confirmar/criar o serviço web a partir deste repositório (build: `npm run build`, start: `npm run start`).
2. Criar um Volume nesse serviço, montado em `/app/data/generated` (ajustar `/app` se o working directory do
   build for outro — ver `railway.md`).
3. Configurar as variáveis de ambiente da tabela em `railway.md` — pelo menos `NEXT_PUBLIC_SITE_URL` (no
   momento do build) e `ADMIN_SYNC_TOKEN` (gerado com `openssl rand -hex 32` ou equivalente); `INK_TOKEN_SUL`
   quando quiser popular o catálogo pela primeira vez.
4. Configurar o healthcheck do serviço apontando para `/api/health`.
5. Fazer o primeiro deploy.
6. Chamar `POST /api/admin/catalog-sync` uma vez (com o `ADMIN_SYNC_TOKEN` configurado) para popular o Volume
   recém-criado — sem isso, `/api/ready` fica em 503 e as páginas sobem sem produtos.
7. Decidir e configurar como esse endpoint será chamado periodicamente depois (serviço de Cron do Railway
   fazendo só uma chamada HTTP, ou um agendador externo) — nenhuma das duas opções foi criada por mim.
8. Confirmar em `/api/ready` que `ready: true` antes de considerar o ambiente pronto para tráfego real.

## 10. Confirmações finais

- **Nenhum deploy foi feito.** Todo o trabalho rodou localmente (`next build`, `next start -p 3100`,
  `next dev`), nunca contra o Railway.
- **Nenhum commit, nenhum push.**
- **Nenhuma alteração na INK** além de leitura (a nova rota admin só chama `fetchStoreProducts`, que é GET —
  o mesmo cliente HTTP já existente, sem nenhuma escrita).
- **Nenhum serviço, banco de dados, Redis, domínio ou Volume foi criado no Railway** — tudo listado no §9
  fica pendente de ação do usuário no dashboard.
- **Nenhuma alteração de layout, ordem de seções ou curadoria do `/sul`** — as duas verificações pontuais
  pedidas (§8) não exigiram nenhuma mudança de código; o resto do trabalho foi infraestrutura/observabilidade
  pura.

**Parar aqui para revisão, como pedido, antes de qualquer passo em direção à produção.**

# Cobertura integral do índice de peças — relatório de cobertura e execução

> **Estado final (2026-09-28):** coleta **completa nas três lojas** (Sul 1.073/1.073 páginas, Norte 309/309,
> Centro-Oeste 385/385). Revalidação de cache implementada e provada em modo produção. **Publicado em produção
> em 2026-09-28** (PR #29, merge `9c55076`, deploy `df9a2503`); índice promovido às 15:42:58Z. O que foi realmente
> executado no Railway está na **§15**; procedimento e rollback nas §11 e §12.

Continuação de `feature/city-garment-tabs` (piloto aprovado, commits `8a1fead`, `3c8d376`, `9d01623`).
Mesma worktree/branch (`.claude/worktrees/city-garment-tabs`), `origin/main` não avançou desde a rodada
anterior. Spec: `CLAUDE_RODADA_CATALOGO_PECAS_COBERTURA_TOTAL.md`. Commits **somente locais** — nenhum
push/PR/merge/deploy, nenhuma alteração na INK.

## 1. Confirmação do estado de base

- `docs/storefront/city-garment-tabs-round.md` (rodada anterior) lido integralmente antes de começar.
- Git verificado antes de qualquer mudança: branch a 3 commits de `origin/main`, `origin/main` sem
  movimento desde então (`git merge-base --is-ancestor origin/main feature/city-garment-tabs` confirma).
  Nenhum trabalho concorrente de hotpages/personalização/favoritos/cart-mirror/tracking/CMS nesta branch
  para preservar — ela já nasce depois do merge de `feature/hotpages-customizacao` (PR #23).
- `pieceLabel` (opcional, aditivo em `FamilyCard`/`FamilyGrid`), `?peca=`, ARIA tablist/tab/tabpanel, trilho
  mobile e o evento `GoToInk` com `garment_type` — todos da rodada anterior — **não foram tocados nesta
  rodada**. Nenhum componente de UI foi redesenhado; só a fonte de dados do índice mudou.
- `CityDesignBinding.productClusterId` já era capturado pelo indexer principal (`indexer.ts`) para **todo**
  binding canônico sempre que a INK devolve `product_cluster_id` num produto visível/publicado — não é
  exclusivo dos 3 fixtures da rodada passada. O `npm run catalog:sync` de rotina (visível apenas, 176 GETs) foi
  executado depois da autorização e populou o campo em todo o catálogo (§2 do bloco de execução, §7 abaixo).

## 2. Alternativas de coleta — tabela objetiva

| Alternativa | Requisições estimadas/loja | Campos disponíveis | Risco de rate-limit | Detecta alterações? | Veredito |
|---|---|---|---|---|---|
| **Crawl completo sem filtro** `GET /v1/stores/products?per_page=100&page=N` (sem `visible_in_store`) | Sul **1.066** págs (106.507 produtos totais em 2026-09-27; eram 106.358 uma semana antes — catálogo cresce ~150/semana), Norte **309** págs (30.814), Centro **385** págs (38.403) | Objeto completo por produto: imagem, preço, `product_type`, `product_cluster_id`, url, status — mesmo shape do sync atual | Baixo a 1,5s/req (~40/min vs limite de 100/min) | Sim, via nova varredura completa | **Vencedor para descoberta inicial**: ~1.760 requisições nas 3 lojas, ~27min de parede (Sul é o gargalo, lojas em paralelo) |
| `GET /v1/stores/product_clusters?product_id=<id>` por binding canônico | ~1 lookup/binding (9.531 Sul + 3.584 Norte + 3.829 Centro ≈ 17k) **+ até 9 GETs de detalhe por sibling ainda não visto** | Só devolve a lista de `product_ids` do cluster — não imagem/preço/url | Baixo por chamada, mas o volume total é o problema | Sim, sob demanda, cidade a cidade | Perdedor para cobertura em massa (~77k+ requisições só no Sul: 9.531 lookups + ~8 detalhes cada); ótimo como ferramenta de **verificação/reparo pontual de UM cluster**, nunca como mecanismo de sync em lote |
| `begin_date=YYYY-MM-DD` (documentado; `created_at` como filtro) no mesmo endpoint de listagem | ~7 páginas/loja por atualização típica (testado ao vivo: `begin_date=2026-09-20` no Sul devolveu 650 produtos contra 106.507 sem filtro) | Mesmo shape completo do crawl sem filtro | Mínimo | Sim — é o próprio mecanismo de incremento | **Vencedor para atualização incremental**: depois do crawl completo inicial, cada resync seguinte só busca produtos criados após o `created_at` mais recente já visto |
| `GET /v1/stores/product_types` | 1 requisição/loja | Catálogo autoritativo de tipos de peça (`id`, `name`) | Nenhum | Não aplicável (catálogo estático) | Confirmado ao vivo nas 3 lojas: `total_count: 10`, mesmos ids/nomes já hardcoded em `src/lib/catalog/garments.ts` desde a rodada anterior — **essa tabela já está completa e correta, não precisou mudar** |

**Estratégia implementada, exatamente a conclusão da tabela acima**: sync inicial = crawl completo paginado
sem filtro; sync incremental subsequente = mesmo crawl com `begin_date=<watermark do último sync completo>`;
`product_clusters?product_id=` disponível como utilitário pontual de verificação, nunca como mecanismo de
descoberta em massa — não implementado como caminho de produção por ser estruturalmente mais caro que a
alternativa vencedora.

Não foi encontrado nenhum parâmetro de filtro por `product_cluster_id` na listagem (testado ao vivo: o
parâmetro é silenciosamente ignorado pela API), nem endpoint de busca em lote por múltiplos ids, nem webhook
de catálogo (webhooks da INK cobrem só pedidos/pagamentos/trocas) — confirmado tanto por teste ao vivo quanto
pela documentação oficial (`developers.reserva.ink`). Nenhum parâmetro foi inventado; o que não está
documentado e não foi confirmado ao vivo não foi assumido como existente.

## 3. Amostra de completude de cluster (representativa, não generalização cega)

24 combinações reais (8 famílias × 3 lojas, cidades e famílias diferentes das 3 já usadas na rodada
anterior — Tijucas/Xambioá/Água Boa ficaram de fora da amostra desta seção de propósito, para não repetir os
mesmos exemplos), consultadas via `product_clusters?product_id=` (1 requisição por combinação, 24 no total):

- **21/24 (87,5%)** clusters completos (10 membros: canônico + 9 peças).
- **2/24 (8,3%)** sem `product_cluster_id` algum — ex.: Sul/Tipografia/Ibarama, Norte/Coordenadas/Itupiranga.
  Bate com o ADR 0001 (~1.400 Sul / ~500 Norte / ~110 Centro produtos visíveis sem cluster).
- **1/24 (4,2%)** cluster existe mas com **1 membro só** (o próprio canônico, sem peças) —
  Norte/Ponto de Origem/Juruti.

Esta é uma amostra real, cross-família e cross-loja — não uma generalização automática a partir dos 3
exemplos da rodada anterior, nem uma alegação de que ela representa exatamente a proporção do catálogo
inteiro (24 pontos é uma amostra pequena; a proporção real só é conhecida com certeza após o crawl completo).

## 4. Vendabilidade — divergência documentação vs. realidade

A documentação oficial da INK (`developers.reserva.ink`) afirma: *"Quando `main_image_url` estiver
preenchida e `status` for `published`, o produto está no ar"* — implicando que `not_published` = fora do ar.

**Isso não bateu com o teste real.** Nesta rodada e na anterior, **5 produtos ocultos** (`not_published`,
`visible_in_store: false`) foram verificados por `curl` público real (nunca a API admin da INK), cobrindo as
**3 lojas** e **5 tipos de peça distintos** (Algodão Peruano/Sul, Infantil/Norte, Regata/Norte, Infantil/Centro,
Oversized/Centro): todos devolveram HTTP 200 com o botão "Adicionar" funcional, nenhum sinal de esgotado ou
indisponível.

**Conclusão prática, mantida da rodada anterior e agora reforçada por amostra maior**: `status`,
`visible_in_store` e `approval_status` nunca decidem vendabilidade, nem no sentido positivo nem no negativo.
A única coisa que decide, no código: imagem https válida, preço numérico e host de compra permitido (mesma
regra de `commerce.ts`). Quando esses três sinais não bastam para uma inferência segura (ex.: preço nulo,
host desconhecido), a peça é omitida — nunca exibida com fallback inventado.


## 5. O que foi implementado

**Coleta (rodada anterior de código, endurecida nesta execução)**
- `src/lib/ink/garment-client.ts` — crawl paginado de `GET /v1/stores/products` **sem** `visible_in_store`, com
  `begin_date` opcional, retomável por página, teto de GETs por chamada. Nesta execução ganhou: retry (com
  jitter) de **erros de rede e 5xx**, não só 429; **todo retry conta no teto**; se uma falha persistir depois de
  algumas páginas lidas, devolve as páginas já lidas como truncamento retomável (`interruptedBy`) em vez de
  perder a chamada inteira; contador de produtos rejeitados por validação.
- `src/lib/catalog/garment-sync-service.ts` — passada retomável por loja, upsert por `inkProductId`, last-known-good
  por loja, poda de clusters órfãos **só** ao fim de uma passada completa, watermark incremental com **1 dia de
  sobreposição** (o fuso do `begin_date` não é documentado; re-ver produtos é idempotente), estatísticas de
  exclusão acumuladas no checkpoint (`exclusions`), trava `assertCanonicalClusterCoverage` (recusa iniciar sem
  gastar requisição se <50% dos canônicos da loja têm cluster).
- `src/lib/catalog/garments-link.ts` — `linkGarmentBindings` (vínculo por `product_cluster_id` + loja) devolve
  também a causa de cada descarte (`noClusterId`, `classicType`, `unknownType`, `noCanonicalForCluster`,
  `noPrice`, `unsellableUrl`, `urlShape`).
- `catalog:sync` ganhou `--cap <loja>=<n>` (teto rígido por loja; estourar falha a loja e preserva o snapshot
  anterior) e relata os GETs reais por loja. Nada muda sem a flag.

**Armazenamento: índice compacto próprio (`garment-index.json`)** — feito depois de medir que embutir as peças no
snapshot base o inflava de 8 MB para 64,7 MB e elevava o RSS de ~119 MB para ~345 MB:

| | Snapshot base | `garment-index.json` | RSS após `getCatalog()` |
|---|---:|---:|---:|
| Antes da coleta (sem peças) | 8,1 MB | — | ~119 MB |
| Peças embutidas no snapshot | 64,7 MB | — | ~345 MB |
| **Índice compacto (atual)** | **8,4 MB** | **15,6 MB** (107.438 peças) | **~194 MB** |

Cada peça é uma tupla `[tipo, idInk, slug, imagem, preço]` sob `loja → product_cluster_id`; a URL de compra é
reconstruída (`base da loja + slug`) e o vínculo à cidade/família vem do canônico da própria loja, nunca
armazenado. Na migração, 107.438 peças → 0 exclusões e 0 duplicatas. A primeira chamada de
`garmentTabsForCity` por processo carrega o índice (~170–210 ms medidos em máquina com load >200); o
`getCatalog()` do resto da loja não o lê. **Índice ausente ou corrompido nunca derruba nada**: as abas somem e
a página cai na grade clássica (testado, incl. E2E).

**Regras de escolha (corrigidas nesta execução)** — `garmentTabsForCity` busca as peças **pelo cluster do
principal** da família (o vínculo é o próprio cluster), e duplicatas do mesmo tipo dentro de um cluster
desempatam pelo **menor id INK**, independente da ordem da API. Antes, o resultado podia depender da ordem de
chegada das páginas quando uma família tinha mais de um produto canônico (variantes regional/localidade).
`garmentCoverageByStore` passou a contar **tipos distintos por cluster** (antes somava linhas por cidade+família e
podia chamar de completo um cluster parcial).

**Interface** — só uma mudança, sem redesenho: `CityGarmentTabs` atualiza `?peca=` com
`window.history.replaceState` em vez de `router.replace` (a troca de aba já era local e instantânea; a URL agora
também, e o servidor deixa de receber uma requisição por clique de aba).

**Revalidação de cache** — ver §10 (rota autenticada + passo final do CLI).

**Comandos**
- `npm run catalog:sync -- --cap use-sul=110 --cap use-norte=45 --cap use-centro=50`
- `npm run garments:sync -- --plan` (zero requisições; estimativa, checkpoint, cobertura, pré-requisitos)
- `npm run garments:sync -- [--store <loja>] --max-requests-per-store <N> [--force-full]`
- `npm run garments:coverage` (leitura local, zero requisições; mesma resolução da página da cidade)
- `npm run garments:migrate-index` (uma vez: move peças de um snapshot antigo para o índice, com backup)
- `npm run garments:revalidate [-- --store <loja>]` (marca as cidades afetadas para revalidação no servidor em execução; zero requisições à INK)
- `npm run verify:garment-revalidation` (prova em modo produção que o ISR pega o índice novo e que índice ausente/corrompido cai na grade clássica)

## 6. Execução autorizada — GETs efetivos por loja

Duas autorizações, GET apenas, snapshots **locais** (`CATALOG_SNAPSHOT_DIR` não definido: o Volume de produção nunca
foi tocado). Backups prévios em `data/generated/backups/` (antes de cada etapa).

| Etapa | Sul | Norte | Centro-Oeste |
|---|---:|---:|---:|
| `catalog:sync` (teto 110/45/50) | 99 | 37 | 40 |
| Gate de `productClusterId` nos canônicos (≥50%) | 85,7% (8.166/9.531) | 87,4% (3.132/3.584) | 97,3% (3.725/3.829) |
| `garments:sync`, 1ª autorização (teto 1.100/350/420) | ≤ 1.090 (750 salvos + 1 bloco perdido) | 309 | 385 |
| `garments:sync`, 2ª autorização (teto 340, só Sul) | **325** | — | — |
| Passada final | **completa, 1.073/1.073** | completa, 309/309 | completa, 385/385 |
| Retries observados (429/rede) | 1 (2ª autorização) | 0 | 0 |

**1ª autorização (resumo):** blocos de 250 GETs; o 4º bloco do Sul caiu com `TypeError: terminated` e foi descartado
(o cliente de então não repetia erro de rede nem gravava páginas parciais); o teto foi respeitado e parei o Sul.
Depois disso o cliente passou a repetir erros de rede/5xx contando no teto e a salvar as páginas já lidas (§5).

**2ª autorização (esta execução):** `npm run garments:sync -- --store use-sul --max-requests-per-store 340`, retomando
do checkpoint (página 749).
- **Páginas lidas:** 750 → 1.073 = **324 páginas**; **325 GETs** (1 retry); teto de 340 **não** atingido, sem queda de
  conexão; 15 min 49 s (09:38:25 → 09:54:14), ~2,9 s por GET com a máquina em load ~180–360.
- `total_pages` do Sul subiu de 1.068 para 1.073 entre as duas execuções (catálogo cresceu); as ~5 páginas de
  sobreposição foram absorvidas pelo upsert por `inkProductId`: 47.105 peças anteriores + 25.001 vinculadas −
  71.674 no índice final = 432 duplicatas sobrescritas, não somadas.
- **Contabilidade do checkpoint:** Sul `requestsUsedAllTime` = 1.079 (inclui 4 GETs de verificação da rodada
  anterior), fora o bloco perdido (≤ 340). Norte 313 e Centro-Oeste 389 (mesmo critério; 309 e 385 nesta autorização).
- **Fora da leitura:** produtos criados depois do início do crawl (watermark `2026-09-27T21:39:05-03:00`, ~5 páginas
  no topo da listagem) não foram lidos. Eles só têm peça ligável depois de um novo `catalog:sync` (o canônico precisa
  existir) e entram no próximo `garments:sync` incremental (§11, passo 7).

## 7. Cobertura final (saída de `npm run garments:coverage`, sem requisições)

**Camisetas principais (canônicas) por loja** — "completo" = as 9 peças no cluster:

| Loja | Canônicas | Com cluster | Sem cluster | **9 peças** | **Parciais** | **Sem peças** | Peças indexadas |
|---|---:|---:|---:|---:|---:|---:|---:|
| Sul | 9.531 | 8.166 | 1.365 (14,3%) | **7.921 (97,0%)** | 78 (1,0%) | 167 (2,0%) | 71.674 |
| Norte | 3.584 | 3.132 | 452 (12,6%) | 2.993 (95,6%) | 19 (0,6%) | 120 (3,8%) | 27.006 |
| Centro-Oeste | 3.829 | 3.725 | 104 (2,7%) | 3.672 (98,6%) | 42 (1,1%) | 11 (0,3%) | 33.327 |

(Percentuais de completo/parcial/sem peças sobre as canônicas **com cluster**.) Total: **132.007 peças** nas três
lojas, distribuídas quase por igual entre os 9 tipos (Sul ~7,96 mil de cada; Norte ~3,0 mil; Centro ~3,7 mil).

**Cidades — o que a página da cidade realmente mostra:**

| Região | Cidades com catálogo | Com ≥1 aba de peça | Peças em **todas** as famílias | Famílias com peças (média por cidade) |
|---|---:|---:|---:|---:|
| Sul | 1.191 | 1.191 (100%) | 7 (0,6%) | **83,8%** (era 55,0% com a passada parcial) |
| Norte | 450 | 450 (100%) | 4 (0,9%) | 84,1% |
| Centro-Oeste | 468 | 468 (100%) | 437 (93,4%) | 98,7% |

"Todas as famílias" é raro em Sul/Norte por causa dos canônicos **sem cluster** (Sul 14,3%, Norte 12,6%; no Sul quase
sempre Traço e Tipografia): a INK não devolve cluster para eles e, pela regra "associação só por
`product_cluster_id`", ficam só com a camiseta clássica. É a lacuna que só a INK fecha; nenhuma heurística foi usada.
Cidade com uma família sem peça mostra essa família apenas na aba clássica, nunca um card falso nas outras.

**Exclusões — Sul, páginas 750–1.073 (passada que já registra as causas no checkpoint):**

| Causa | Produtos |
|---|---:|
| Candidatos lidos | 32.322 |
| **Vinculados** | **25.001** |
| Camiseta clássica (já é o canônico; descarte legítimo) | 3.140 |
| Sem `product_cluster_id` | 2.661 |
| Cluster sem canônico na loja Sul (rascunhos/desenhos que a loja não vende, produtos novos ainda sem `catalog:sync`) | 1.520 |
| Tipo de peça desconhecido | 0 |
| Sem preço | 0 |
| URL fora do host permitido | 0 |
| URL fora do formato `<base>/<slug>` | 0 |
| Rejeitados na validação de campos (sem imagem/URL https) | 17 |

Ou seja: entre os produtos com cluster ligável, **nenhuma exclusão por link, preço ou tipo inválido**. Para as páginas 1–749
do Sul e para Norte/Centro-Oeste (passadas anteriores à instrumentação) as causas não foram registradas; a evidência
indireta continua sendo que os clusters completos têm exatamente 9 peças.

## 8. Validação dirigida de cidades do Sul em pontos diferentes do crawl

**Agudos do Sul/PR** reúne todos os casos numa cidade (classificação feita comparando o índice **anterior** a esta
execução, guardado em `backups/pre-sul-finish-*`, com o índice final):

| Família | Cluster | Peças | Ponto do crawl |
|---|---|---:|---|
| Gentílico, Feito em, Legado, Território | com | 9 cada | já coberta **antes** desta execução |
| Ponto de Origem | com | 9 | estava na parte **ainda não coletada**, coletada nesta execução |
| Coordenadas | com, **incompleto** | 8 (falta Moletom Suéter) | coletada nesta execução |
| Traço, Tipografia | **sem cluster** | 0 | nunca ligável |

`tests/e2e/garment-crawl-points.spec.ts` (esperados derivados dos arquivos de dados, não da app) abre cada aba dessa
cidade e confere: contagem da aba = famílias com aquela peça (`Moletom Suéter · 5`, demais `· 6`), href e preço
exatos de cada card, nenhum card para as famílias sem peça (nem em aba alguma) e, na aba clássica, Traço e
Tipografia ainda apontando direto para a INK. **Passou.** Observação da análise: 1.167 das 1.191 cidades do Sul misturam
famílias coletadas antes e depois desta execução, por isso o teste usa uma cidade que cobre todos os casos de uma vez.

## 9. Tamanho e memória com o índice carregado

| | Valor |
|---|---:|
| `garment-index.json` final | **20.062.869 B (19,1 MiB)** — era 16,3 MB antes desta execução |
| `catalog-snapshot.json` (base) | 8.806.152 B (8,4 MiB), inalterado |
| RSS antes de `getCatalog()` | 58–69 MB |
| RSS depois de `getCatalog()` (só o snapshot base) | 122–132 MB (heap 26–32 MB) |
| **RSS com o índice carregado** | **169–184 MB** (heap 62 MB) → **+~50 MB** |
| 1ª chamada de `garmentTabsForCity` por processo (parse do índice) | 0,35–1,3 s (máquina carregada) |
| Chamadas seguintes | 0,1–0,2 ms |

Comparação com o desenho anterior (peças embutidas no snapshot base): 345 MB de RSS. A 1ª renderização de cidade por
processo (e após cada promoção do índice) paga o parse único de ~20 MB de forma síncrona; se isso incomodar em
produção, o índice pode ser pré-carregado no boot do servidor (não implementado).

## 10. Revalidação de cache após promover o índice

**Problema (reproduzido em modo produção):** promover um `garment-index.json` novo não muda as páginas de cidade já
geradas pelo ISR (`revalidate = 3600`); o `revalidatePath` do `catalog-sync` do admin roda dentro do servidor, e o CLI
(`railway ssh`/shell local) é outro processo e não alcança o cache do servidor.

**Ordem do fluxo** (regra pedida): 1) baixar/atualizar dados, 2) validar, 3) **promover o índice** (escrita atômica
`tmp + rename`, já existente), 4) **avisar o servidor para invalidar o cache**. A falha do passo 4 nunca toca o índice
promovido.

- **Rota:** `POST /api/admin/garment-index/revalidate`, `Authorization: Bearer $ADMIN_SYNC_TOKEN` (o mesmo token do
  `catalog-sync`; sem token configurado → 503, token errado → 401). Corpo opcional `{"storeKeys":["use-sul"]}`
  (vazio = todas). Ela **não lê nem escreve o índice**; só chama `revalidatePath` para as cidades afetadas.
- **Granularidade:** somente as cidades cujo produto principal vem da(s) loja(s) sincronizada(s) — 1.191 caminhos
  literais (`/sul/sc/tijucas`…) para o Sul, 0 para lojas sem cidades. É exata mesmo depois de uma consolidação de lojas
  (não depende do mapa região→loja). Numa Route Handler o `revalidatePath` só **marca**; a página é refeita na próxima
  visita (sem rajada de renderizações). O `catalog-sync` continua invalidando as árvores de região como antes.
- **CLI:** `garments:sync` chama a rota ao final quando `GARMENT_REVALIDATE_URL` e `ADMIN_SYNC_TOKEN` existem
  (só para lojas cujo índice mudou); sem eles, diz que não pediu. Falha de revalidação → mensagem, **código de saída 3**,
  índice intacto, e o retry é `npm run garments:revalidate`. O token só é enviado por https ou por http para o próprio
  host local. `--no-revalidate` pula o passo.
- **Prova em modo produção** (`npm run verify:garment-revalidation`, `next build` + `next start` sobre um fixture, nunca
  dados da INK): sem índice → grade clássica, sem dados de aba; índice promovido em disco → **a página em cache continua
  igual** (reproduz o problema); `POST /revalidate` → **na 1ª visita seguinte** a página traz as abas e o link exato da
  peça; índice **corrompido** e depois **removido** + revalidação → 200 com a grade clássica; promover de novo →
  abas de volta; rota sem token / token errado → 401. **Todas as verificações passaram.**
- **Achado ao escrever a prova (importante):** a barra de abas é um client component que lê `?peca=` com
  `useSearchParams`; no HTML de servidor do ISR ela **não existe** (há um marcador `BAILOUT_TO_CLIENT_SIDE_RENDERING`) e
  o que vem é a **grade clássica** (fallback do Suspense) — crawlers e usuários sem JS recebem a página como antes, sem
  regressão de SEO; as abas e os painéis aparecem após a hidratação. Efeito colateral: a barra empurra a grade para
  baixo na hidratação (deslocamento de layout); reservar a altura da barra é uma melhoria possível, não feita.
- **Testes unitários** (`tests/unit/garment-revalidate.test.ts`, 14): cidades afetadas por loja, rota 503/401/400/200,
  falha de `revalidatePath` → 500 com o índice byte a byte idêntico, https-only para o token, falha de rede sem
  lançar, "nada mudou → não pede", e falha de revalidação → índice intacto.

## 11. Procedimento para gerar e promover `garment-index.json` no Railway

Verificado no container real (serviço `useorigens-storefront`, 2026-09-28, antes de qualquer promoção): Node v24.21.0,
npm 11.19.0, diretório de trabalho `/app`, **Volume em `/app/data/generated`** (4,6 GB, 4,5 GB livres; `CATALOG_SNAPSHOT_DIR`
não definido, então vale o padrão), `PORT=8080`, **`tsx` v4.23.15 presente em `node_modules/.bin`** (runner garantido: não
precisa de `npx` nem de redeploy só por isso), `gzip`/`gunzip`/`base64`/`sha256sum`/`mv`/`cp` presentes,
`ADMIN_SYNC_TOKEN` e `INK_TOKEN_SUL/NORTE/CENTRO` definidos (só a presença foi verificada), as **três regiões no ar** e as três lojas no snapshot de produção (`/api/ready`) e **nenhum** `garment-index.json` no Volume.

**Como o `railway ssh` se comporta (verificado):** `railway ssh --service useorigens-storefront -- <comando>` junta os
argumentos numa única string de shell **sem preservar aspas** e **não encaminha stdin**. Portanto: (a) `sh -c '...'` quebra
(o `sh -c` recebe só a primeira palavra); (b) passe o comando como **um único argumento** entre aspas duplas, e pipes,
redirecionamentos e `VAR=valor cmd` funcionam dentro dele; (c) não dá para enviar arquivo por stdin. Os scripts npm
`garments:*` usam `--env-file=.env.local`, que não existe no container: use `node --conditions=react-server --import tsx scripts/<x>.mts`.

1. **Pré-condições.** Código deste branch implantado (a rota `/api/admin/garment-index/revalidate` e os scripts precisam
   existir); backup do Volume (Backups do Railway); confirmar que não há índice:
   `railway ssh --service useorigens-storefront -- ls -la data/generated`.
2. **Atualizar o catálogo base com clusters** (o snapshot antigo não tem `productClusterId`; sem ele o índice não acha
   nenhum cluster e as abas ficam ocultas): `curl -X POST -H "Authorization: Bearer $ADMIN_SYNC_TOKEN" https://<url>/api/admin/catalog-sync` (sem corpo = as três lojas)
   e acompanhar por `GET` até `succeeded` (~176 GETs de leitura: 99 Sul, 37 Norte, 40 Centro-Oeste; a rota já revalida o catálogo). Conferir os clusters:
   `railway ssh --service useorigens-storefront -- node --conditions=react-server --import tsx scripts/garment-coverage-report.mts`
   (coluna "Com cluster" ≈ 8.166 / 3.132 / 3.725).
3. **Artefato.** O índice local aprovado, inteiro (as três lojas estão no ar): 20.062.869 B (6,8 MB comprimido), 132.007 peças,
   sha256 `7276bdb58fd5571031d768e5e89b79919cb86990b8d15b26a1d36747d139919d`.
4. **Transporte para o Volume** (sem stdin: blocos base64 por argumento). Localmente: `gzip -9 -c garment-index.json | base64 | tr -d '\n' | split -b 90000 - chunk_`.
   Para cada bloco: `railway ssh --service useorigens-storefront -- "printf %s <bloco> >> /app/data/generated/.garment-index.b64"`.
   Depois: `railway ssh ... -- "base64 -d /app/data/generated/.garment-index.b64 | gunzip > /app/data/generated/garment-index.incoming.json"`,
   conferir `sha256sum` do resultado contra o valor acima e `rm /app/data/generated/.garment-index.b64`. O candidato fica no
   **mesmo Volume** que o índice vivo (requisito do `rename` atômico).
5. **Validar sem promover:** `railway ssh ... -- "node --conditions=react-server --import tsx scripts/promote-garment-index.mts --from /app/data/generated/garment-index.incoming.json --expect-stores use-sul,use-norte,use-centro --check-only"`
   (JSON, versão 1, só as lojas esperadas, formato de cada peça, tamanho plausível).
6. **Promover e revalidar** (depois da promoção, nesta ordem): `railway ssh ... -- "GARMENT_REVALIDATE_URL=http://127.0.0.1:8080 node --conditions=react-server --import tsx scripts/promote-garment-index.mts --from /app/data/generated/garment-index.incoming.json --expect-stores use-sul,use-norte,use-centro --revalidate"`.
   O script valida de novo, guarda o índice anterior como `garment-index.json.prev` (se houver), faz o `rename` atômico e
   chama a rota autenticada. Saída 1 = não promoveu (índice vivo intocado); **saída 3 = promoveu, revalidação falhou:
   mantenha o arquivo e repita só `scripts/revalidate-garments.mts`**.
7. **Conferir:** `curl -s https://<url>/sul/pr/agudos-do-sul | grep -c "Algodão Peruano"` (> 0) e a cidade no navegador.
   Atualizações futuras: `catalog-sync` (rota) e depois `sync-garments.mts --max-requests-per-store 40` sem `--force-full`
   (incremental por `begin_date`), com `GARMENT_REVALIDATE_URL` no comando. Nenhum agendamento foi ativado.
8. **Alternativa não usada:** gerar o índice dentro do container com `sync-garments.mts` (~1.073 GETs no Sul, em blocos de 250,
   com `CATALOG_SNAPSHOT_DIR` apontando para um subdiretório de staging no Volume). Só se o artefato aprovado não puder
   ser transportado.

## 12. Rollback

- **Imediato, sem deploy e sem tocar o snapshot base:** `railway ssh ... -- "mv /app/data/generated/garment-index.json /app/data/generated/garment-index.json.off"`
  e depois `railway ssh ... -- "GARMENT_REVALIDATE_URL=http://127.0.0.1:8080 node --conditions=react-server --import tsx scripts/revalidate-garments.mts"` (sem `--store` = todas as lojas).
  Todas as cidades voltam à grade clássica; sem a revalidação, o ISR normal faz o mesmo em até 1 h. Reativar: `mv` de volta
  + revalidar. Voltar à versão anterior: usar o `garment-index.json.prev`.
- Comprovado em modo produção (`verify:garment-revalidation`, passos 4 e 5: índice corrompido e removido → 200 com a
  grade clássica) e em E2E (`garment-index-missing.spec.ts`).
- Não há variável de ambiente para desligar o recurso: **a presença do arquivo é o interruptor**.
- **Problema no código, mesmo sem índice:** reverter o merge/deploy pelo fluxo normal.

## 13. Testes e gate de release

**Gate final (uma execução completa, máquina com load ~130–210, bem abaixo dos ~300 de antes):**

| Verificação | Resultado |
|---|---|
| `tsc --noEmit` | limpo |
| `eslint .` | 0 erros (8 warnings pré-existentes em `db/validate-migrations.mjs`) |
| Unitários (suíte inteira) | **895/895** (69 arquivos) |
| `next build` | **exit 0** |
| E2E padrão completo (162 testes) | **158 passaram, 2 falharam, 2 pulados** (8,1 min) |
| E2E do seletor (Sul: piloto + cidade fora do piloto) | passou (12 testes; 1 pulado: não existe cidade Sul sem nenhuma peça) |
| E2E da validação dirigida do Sul (Agudos do Sul/PR, §8) | passou |
| E2E das 3 regiões (`playwright.regions.config.ts`, cidades fora do piloto) | **9/9** |
| E2E `GoToInk` com `garment_type` (1 evento, sem Purchase/AddToCart/ViewContent) | passou |
| E2E índice ausente (`garment-index-missing.spec.ts`, opt-in) | passou (execução anterior; sem mudança de código desde então) |
| Prova de ISR em produção (`verify:garment-revalidation`) | **todas as verificações passaram** (§10) |

**As 2 falhas do E2E completo** — `sul.spec.ts:17` (busca por mouse) e `:26` (busca por teclado), ambas
`toHaveURL` com a página ainda em `/sul` depois de 5 s. Investigação, sem repetir cegamente:
- **Não reproduzem isoladas:** 8/8 passes (2,1–7,1 s) rodando os dois testes 4 vezes seguidas.
- **A/B em servidor de dev novo** (1ª navegação a frio, mesmo teste, com e sem o índice de peças): com índice 19,9 s e
  12,2 s de teste; **sem índice 9,7 s e 8,9 s**. Ou seja, o parse único do índice de 20 MB (§9) soma à compilação a frio do
  dev server e aproxima a 1ª navegação do limite de 5 s do teste sob carga. Todas passaram.
- **Ressalva honesta:** `sul:17` falhou nas quatro execuções completas desta rodada e `:26` em duas; não consegui provar
  a causa além da evidência acima (não rodei a suíte inteira num `main` limpo para comparar). Não alterei os testes
  (são contrato). Em produção não há compilação a frio: só o parse único (~0,35–1,3 s) na 1ª renderização de cidade por
  processo; se quiser eliminar até isso, o caminho é pré-carregar o índice no boot (não implementado).
- Outras falhas de execuções anteriores desta rodada (`cart-mirror:334`, `sul:163`, `cart-mirror:378`) não voltaram.

**Falhas que já haviam sido resolvidas nesta rodada:** a flakiness do seletor era real (`router.replace` esperava uma ida
ao servidor) e foi corrigida com `history.replaceState`; `tsc`/build já falharam uma vez por `.next/dev/types/routes.d.ts`
truncado (servidor de dev encerrado no meio da escrita), artefato gerado e ignorado pelo git, removido.


## 14. Limitações e riscos conhecidos

1. **Canônicos sem cluster** (Sul 14,3%, Norte 12,6%, Centro-Oeste 2,7%): só a camiseta clássica; depende da INK.
2. **Produtos criados depois de 27/09 21:39** não foram lidos (§6): novo `catalog:sync` + `garments:sync` incremental.
3. **Incremental não vê peça nova de cluster antigo** (`begin_date` filtra por `created_at`): fazer uma passada completa
   periódica, sempre precedida de `catalog:sync`.
4. **Vendabilidade:** HTTP 200 + "Adicionar" observado em 5 peças (3 lojas, 5 tipos); a INK documenta `not_published` como
   fora do ar. A página nunca consulta a INK; se a INK tirar peças do ar, o link cai numa página de erro dela até o
   próximo sync completo com poda.
5. **Primeira renderização por processo** paga ~0,35–1,3 s de parse do índice (§9); +~50 MB de RSS.
6. **A barra de abas só existe no cliente** (§10): sem regressão de SEO, mas há deslocamento de layout na hidratação.
7. **Procedimento Railway executado em 2026-09-28** (§15); o rollback por renomeação **não foi exercitado em produção** (só em modo produção local).
8. **Norte e Centro-Oeste seguem fora do ar** (dependem do lançamento por região no CMS); os dados estão prontos.
9. O crawl grava snapshot/índice/checkpoint só ao final de cada invocação; por isso os blocos de 250 GETs.

## 15. Execução real em produção (2026-09-28)

**Código:** PR #29 (`feature/city-garment-tabs`, head `ff8f27b`) integrada com a `main` de então (`cdea08e`, SEO Estágio B e
cart-mirror regional, sem conflitos) e mesclada como **`9c55076`**. O Railway faz auto-deploy a cada merge na `main`:
deploy **`df9a2503`** (`SUCCESS`, 15:21:59Z). Nenhum arquivo de `data/generated/` entrou no Git. Antes do merge, o Volume foi
reconfirmado **sem** `garment-index.json`.

**Falha pré-existente da `main`, não causada por esta release:** `tests/e2e/sul.spec.ts:332` (altura de `/sul/sc` no celular,
2.629 px contra o limite de 2.600) falha idêntica num checkout limpo de `origin/main`; vem do commit de SEO `34f4ac7` (texto de
introdução na página de estado). Não alterado.

**Etapa A — código sem índice (smoke antes/depois):** `/api/health`, `/api/ready`, `/sul`, `/norte`, `/centro-oeste`, cidades,
`/api/cidades/sul`, `/sitemap.xml`, `/robots.txt` todos 200 e `/admin` 307 (igual à linha de base); cidades com **grade
clássica e nenhum dado de aba**; a rota nova `POST /api/admin/garment-index/revalidate` respondeu **401 sem token** (GET → 405);
logs sem erros novos. Busca real (Playwright headless com Pixel/GA bloqueados) verde em desktop por mouse (Sul/Norte/Centro-Oeste),
teclado e mobile 390 px.

**Etapa B — container real (`useorigens-storefront`):** Node v24.21.0, npm 11.19.0, cwd `/app`, `PORT=8080`; **Volume
`/app/data/generated`** (4,6 GB, 4,5 GB livres; `CATALOG_SNAPSHOT_DIR` não definido); **runner: `tsx` v4.23.15 presente em
`node_modules/.bin`** e o script de promoção executa no container com `--conditions=react-server` (imprimiu o uso, saída 1) —
**não foi preciso `npx` nem redeploy por causa do runner**. `gzip`/`base64`/`sha256sum` existem; `ps` e `curl` não (uso `/proc` e
`node fetch`). `ADMIN_SYNC_TOKEN` e `INK_TOKEN_SUL/NORTE/CENTRO` definidos (só presença verificada, valores nunca impressos).
Comportamento do `railway ssh` (§11): sem preservar aspas, sem stdin. **As três regiões já estavam no ar**, com as três lojas no
snapshot de produção.

**Etapa C — como o índice foi realmente colocado no Volume:**
1. **Catálogo base com clusters.** O snapshot de produção (25/09) tinha **0** canônicos com `productClusterId`. Rodei o
   `POST /api/admin/catalog-sync` (as três lojas) **de dentro do container** (`node fetch` com o token lido de `process.env`):
   4 min 31 s, **99 / 37 / 40 GETs** de leitura (Sul/Norte/Centro-Oeste), contagens idênticas às anteriores
   (9.834 / 3.646 / 3.914 produtos) e agora 8.166 / 3.132 / 3.725 canônicos com cluster, igual ao local. Antes, copiei o snapshot para
   `catalog-snapshot.json.pre-garment-20260928` no próprio Volume (8,4 MB, **ainda lá**; pode ser apagado).
2. **Transporte (não houve nova coleta na INK).** O artefato aprovado (o `garment-index.json` local, 20.062.869 B, sha256
   `7276bdb5…139919d`) foi comprimido (6.787.690 B), codificado em base64 e enviado em **101 blocos de 90.000 B** por
   `printf %s <bloco> > /app/data/generated/.gi/part-NNN`; o sha256 de **cada bloco** foi conferido contra o local (101/101
   idênticos), o arquivo foi remontado no container (`cat part-* | base64 -d | gunzip`) e o sha256 e o tamanho batem **exatamente** com o
   aprovado; os blocos foram removidos.
3. **Validação sem promover:** `promote-garment-index.mts --check-only --expect-stores use-sul,use-norte,use-centro` → ok
   (7.999 / 3.012 / 3.714 clusters; 71.674 / 27.006 / 33.327 peças).
4. **Promoção atômica + revalidação** (15:42:54–15:42:58Z), num único comando dentro do container:
   `GARMENT_REVALIDATE_URL=http://127.0.0.1:8080 node --conditions=react-server --import tsx scripts/promote-garment-index.mts --from /app/data/generated/garment-index.incoming.json --expect-stores use-sul,use-norte,use-centro --revalidate`.
   Resultado: `promoted … 20062869 bytes`, "no previous index existed" (portanto sem `.prev`) e **`revalidation requested: 2109 city pages marked
   for revalidation`**, saída 0. Tamanho do índice em produção: **20.062.869 B** (`/app/data/generated/garment-index.json`).

**Etapa D — smoke com abas ativas (produção, Playwright, esperados derivados dos arquivos de dados; Pixel/GA bloqueados, `fbq`/`gtag`
simulados; a INK foi substituída por um stub na navegação):** **14/14 passaram**, em 7 cidades:
Sul — Tijucas/SC, Agudos do Sul/PR, Porto Alegre/RS; Norte — Xambioá/TO, Abaetetuba/PA; Centro-Oeste — Água Boa/MT, Abadia de Goiás/GO. Em cada uma:
abas só com peças elegíveis; Camiseta clássica como padrão; troca de aba com **imagem, preço e href exatos** do produto certo, na loja
da própria região (Norte nunca aponta para Sul); nenhum card em família sem peça; **`?peca=` muda sem nenhuma requisição ao servidor**;
clique abre direto o produto INK correto (só a página da cidade antes, sem PDP nem modal); **`GoToInk` exatamente 1 vez com `garment_type`**
e sem Purchase/AddToCart/ViewContent.

**Etapa E — busca e desempenho (mesmo script antes e depois):**

| Fluxo (ms até a página da cidade) | Sem índice | Com índice (3 rodadas) |
|---|---:|---:|
| desktop mouse Sul | 2.618 (1ª, navegador frio) | 1.662 · 1.515 · 1.447 |
| desktop mouse Norte | 1.264 | 1.236 · 1.218 · 1.116 |
| desktop mouse Centro-Oeste | 1.276 | 1.559 · 1.211 · 1.136 |
| desktop teclado Sul ("floripa") | 1.155 | 1.167 · 1.070 · 1.059 |
| mobile 390 px | 1.167 | 1.643 · 1.277 · 1.240 |

**Sem degradação da busca** (todas verdes; variação dentro do ruído). Página de cidade (curl, TTFB): `/sul/sc/tijucas` 0,25–0,39 s sem
índice; **1ª renderização depois da promoção (índice ainda não carregado no processo) 0,57 s**, a seguinte 0,39 s, depois ~0,34 s.
Tamanho do HTML+payload de uma cidade (bruto, sem compressão): **~102 KB → ~255 KB** (os painéis das 9 peças vêm renderizados do
servidor). **Memória do processo web** (`/proc`): RSS **808 MB → 1.043 MB** (pico 853 → 1.072 MB) entre antes da promoção e depois do
smoke (processo que já vinha de dias de uptime, mais o `catalog-sync` e a revalidação); localmente o índice sozinho soma ~50 MB, e o
processo reiniciado depois ficou em 753 MB (ver o cold start abaixo), então esse delta não era custo estável do índice.

**Cold start real (segundo deploy, `31183d1`, PR #30 só de documentação — reinício do processo com o índice já no Volume, sem
revalidação):** build 15:49–15:50:33Z, troca às 15:50:51Z (**1 amostra de `/api/health` sem resposta, ~15–30 s de indisponibilidade** da
instância única com Volume) e `SUCCESS` às 15:51:07Z. O índice **persistiu** ao redeploy (`garment-index.json`, 20.062.869 B, ainda no
Volume) e o cache de ISR do build novo já serviu as abas sem nenhuma revalidação. Primeiras requisições ao processo novo (~10 min de
uptime): `/sul/pr/agudos-do-sul` 0,25 s, `/norte/to/xambioa` 0,41 s, `/centro-oeste/mt/agua-boa` 0,39 s, `/sul/sc/tijucas` 0,37 s de TTFB, todas
com os dados das abas; smoke completo idêntico à linha de base (tudo 200, `/admin` 307). **Busca real no processo novo, todas verdes:**
desktop mouse Sul 1.867 ms, Norte 1.294 ms, Centro-Oeste 1.659 ms, teclado 1.165 ms, mobile 390 px 1.469 ms (mesma faixa da linha de base sem
índice, 1.155–2.618 ms). **Memória do processo web novo (`/proc`): RSS 753 MB, pico 845 MB**, depois do smoke e das buscas — abaixo dos
808 MB do processo anterior; portanto o 1.043 MB medido antes era acúmulo (catalog-sync, revalidação de 2.109 páginas e o otimizador de
imagens exercitado pelo smoke), não custo estável do índice.

**Não executado em produção:** o rollback por renomeação (`mv … .off` + revalidar) — não foi autorizado nesta release; foi provado em
modo produção local (`verify:garment-revalidation`, passos 4–6) e o comando exato está na §12. Como não houve degradação, não houve o
teste de causalidade (remover o índice) previsto para esse caso.

**Resíduos no Volume:** `catalog-snapshot.json.pre-garment-20260928` (cópia de segurança do snapshot anterior). Nenhum candidato ou
bloco temporário restou.

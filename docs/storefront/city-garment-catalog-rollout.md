# Cobertura integral do índice de peças — relatório de cobertura e execução

> **Estado final desta execução (2026-09-27/28):** coleta **completa em Norte e Centro-Oeste**; **Sul parcial**
> (749 de 1.068 páginas, ~70%; o teto de 1.100 GETs foi consumido, ver §8). Recurso pronto para revisão, **não
> publicado**. Faltam ~319 páginas do Sul e uma nova autorização (§11).

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

**Comandos**
- `npm run catalog:sync -- --cap use-sul=110 --cap use-norte=45 --cap use-centro=50`
- `npm run garments:sync -- --plan` (zero requisições; estimativa, checkpoint, cobertura, pré-requisitos)
- `npm run garments:sync -- [--store <loja>] --max-requests-per-store <N> [--force-full]`
- `npm run garments:coverage` (leitura local, zero requisições; mesma resolução da página da cidade)
- `npm run garments:migrate-index` (uma vez: move peças de um snapshot antigo para o índice, com backup)

## 6. Execução autorizada — GETs efetivos por loja

Autorização: `catalog:sync` até 110/45/50; `garments:sync` até 1.100/350/420 (Sul/Norte/Centro-Oeste), GET
apenas, snapshots **locais** (nenhuma escrita no Volume de produção; `CATALOG_SNAPSHOT_DIR` não estava definido).
Backup prévio dos snapshots e do checkpoint em `data/generated/backups/`.

| Etapa | Sul | Norte | Centro-Oeste |
|---|---:|---:|---:|
| `catalog:sync` (teto 110/45/50) | 99 | 37 | 40 |
| Cobertura de `productClusterId` nos canônicos (gate ≥50%) | **85,7%** (8.166/9.531) | **87,4%** (3.132/3.584) | **97,3%** (3.725/3.829) |
| `garments:sync` (teto 1.100/350/420) | **≤ 1.090** (750 salvos + bloco perdido, ver abaixo) | **309** | **385** |
| Retries por 429 observados | 1 (bloco 1) + desconhecido no bloco perdido | 0 | 0 |
| Passada | **incompleta** (pág. 749 de 1.068) | **completa** (309/309) | **completa** (385/385) |

Blocos de 250 GETs (cada invocação grava snapshot/índice/checkpoint só ao final, então blocos menores limitam
a perda numa interrupção): bloco 1 com `--force-full` (o checkpoint anterior tinha 4 páginas cujos irmãos foram
descartados quando os canônicos ainda não tinham cluster); bloco 2 encerrou Norte (59) e Centro (135) sozinhos,
sem tocar o teto; blocos 3 e 4 só do Sul.

**Incidente — bloco 4 do Sul.** Com teto de 340 (folga calculada: 350), o processo terminou com
`TypeError: terminated` (conexão derrubada) perto do fim das 319 páginas restantes. Como o cliente de então só
repetia 429 e só gravava ao final, **todas as páginas do bloco foram descartadas**; snapshot e checkpoint
anteriores ficaram íntegros (a proteção funcionou). Pela duração (15,5 min a ~2,8 s/GET medidos no bloco
anterior) estimo ~330 GETs consumidos (limite rígido do teto: 340), então o Sul gastou **≤ 1.090 de 1.100** e a
folga restante é ≤ 10 GETs — **parei o Sul aqui** e não elevei o teto. Erro meu de operação: filtrei as linhas de
progresso na saída, então não tenho a contagem exata. Correções feitas depois (não reexecutei nada no Sul):
retry de erro de rede/5xx contando no teto, salvamento das páginas lidas em falha persistente, contadores de
exclusão e sobreposição de 1 dia no watermark (§5).

## 7. Cobertura efetivamente alcançada (saída de `npm run garments:coverage`, sem requisições)

**Por loja** (canônicas = camisetas principais indexadas; "completo" = 9 tipos de peça no cluster):

| Loja | Canônicas | Com cluster | Sem cluster | Completos | Parciais | Sem variantes | Peças indexadas |
|---|---:|---:|---:|---:|---:|---:|---:|
| Sul (**parcial**, pág. 749/1.068) | 9.531 | 8.166 | 1.365 | 5.232 | 3 | 2.931 | 47.105 |
| Norte (completa) | 3.584 | 3.132 | 452 | 2.993 | 19 | 120 | 27.006 |
| Centro-Oeste (completa) | 3.829 | 3.725 | 104 | 3.672 | 42 | 11 | 33.327 |

Leitura honesta:
- **Norte e Centro-Oeste** (passada completa): entre os canônicos com cluster, 95,6% (Norte) e 98,6% (Centro)
  têm as 9 peças; 3,8% e 0,3% não têm nenhuma; 0,6% e 1,1% são parciais. Isto é medido, não estimado.
- **Sem cluster** (Sul 14,3%, Norte 12,6%, Centro 2,7% dos canônicos): a INK não devolve cluster para esses
  produtos (confirmado na amostra de 24 do §3: `product_clusters?product_id=` responde vazio). Pela regra
  "associação só por `product_cluster_id`" eles ficam **só com a camiseta clássica** — lacuna real, que só a
  INK (criando/agrupando clusters) fecha; nenhuma heurística foi usada para contorná-la.
- **Sul**: os 2.931 "sem variantes" **não devem ser lidos como ausência de peças**. O crawl é do mais novo para
  o mais antigo e parou na página 749 de 1.068; os ~32% mais antigos (desenhos antigos) ainda não foram lidos.
  Com base em Norte/Centro (0,3–3,8% de vazios reais), quase todos os 2.931 são "ainda não coletados". Sul
  precisa terminar antes de ser tratado como coberto.

**Peças por tipo** (todas as 9 categorias estão presentes nas 3 lojas, em quantidades próximas — por
exemplo Sul ~5,23 mil de cada; Norte ~3,0 mil; Centro ~3,7 mil): Algodão Peruano, Oversized, Regata, Cropped,
Cropped Moletom, Moletom (capuz), Moletom (careca), Infantil e Body Infantil.

**Cidades — o que a página da cidade realmente mostra:**

| Região | Cidades com catálogo | Com ≥1 aba de peça | Com peças em **todas** as famílias | Famílias com peças (média por cidade) |
|---|---:|---:|---:|---:|
| Sul (parcial) | 1.191 | 1.191 (100%) | 0 | 55,0% |
| Norte | 450 | 450 (100%) | 4 (0,9%) | 84,1% |
| Centro-Oeste | 468 | 468 (100%) | 437 (93,4%) | 98,7% |

"Todas as famílias" é raro no Norte por causa dos 12,6% de canônicos sem cluster. Em uma cidade, uma família
sem peça simplesmente não tem card naquela aba (nunca um card falso); a contagem da aba (`Oversized · N`) é
sempre o número real de famílias com aquela peça.

**Exclusões (links/imagens/preços inválidos):** **não foram medidas nesta passada** — a instrumentação foi
adicionada depois (as passadas seguintes gravam `exclusions` no checkpoint). Evidência indireta: no Norte, 2.993
clusters × 9 = 26.937 das 27.006 peças; ou seja, praticamente toda peça de um cluster completo foi vinculada, e
qualquer descarte por imagem/preço/URL só pode estar nos 61 clusters parciais (19 Norte + 42 Centro) e nos 131
vazios (120 + 11) — sem como separar "não existe" de "excluída". Na migração para o índice, 0 das 107.438 peças
falharam na regra de forma de URL.

## 8. Testes

- `tsc --noEmit`: limpo. `eslint .`: 0 erros (8 warnings pré-existentes em `db/validate-migrations.mjs`).
- **Unitários: 881/881** (suíte completa). Novos nesta execução: teto e contagem de GETs do `catalog:sync`;
  trava de pré-requisito; determinismo da escolha da peça; cobertura por cluster; retry de erro de rede,
  salvamento parcial, teto contando retries; causas de exclusão do linker; watermark com sobreposição; índice
  compacto (ida e volta, ausente, corrompido, `urlShape`, idempotência, loja que falha, poda) e migração.
  Os testes que liam o snapshot real (dados que mudam a cada sync) viraram fixtures determinísticas.
- **E2E do seletor — Sul (`tests/e2e/city-garment-tabs.spec.ts`, 12 passaram, 1 pulado)**: piloto (Tijucas/SC) e
  uma cidade fora dele, esperados derivados de um oráculo independente que lê os arquivos de dados
  (`tests/e2e/garment-oracle.ts`), não do resolvedor da app: aba clássica por padrão, aba Peruano com **href e
  preço exatos por família** e nenhum card inventado, `?peca=` restaurável, mobile 375 sem overflow, teclado, e
  **clique no card indo direto à URL exata da INK** (só a página da cidade antes, sem PDP nem modal). O 1
  pulado é "cidade sem nenhuma peça": não existe uma nos dados atuais do Sul.
- **E2E das 3 regiões (`playwright.regions.config.ts`, 9/9)**: Abatiá/PR (Sul), Abaetetuba/PA (Norte) e Abadia
  de Goiás/GO (Centro-Oeste), todas **fora do piloto**; href/preço exatos, todo link da página na loja da
  própria região (Norte nunca aponta para Sul), mobile sem overflow, clique direto na INK. Norte/Centro-Oeste
  só existem publicamente com o CMS ligado; o servidor de teste os lança com um `published.json` local
  (`tests/e2e-regions/fixtures/`), sem alterar a configuração padrão (que continua Sul-only).
- **`GoToInk` com `garment_type`** (`tracking-and-nav.spec.ts`): exatamente um evento por clique real, com
  `garment_type`, sem Purchase/AddToCart/ViewContent.
- **Índice ausente** (`garment-index-missing.spec.ts`, opt-in): página da cidade renderiza a grade clássica, sem
  abas e sem erro (comando no arquivo).
- **Suíte E2E padrão completa (161 testes), duas execuções com a máquina em load ~300** (outras sessões usando a
  CPU; o `uptime` do host chegou a 325):
  - antes da correção do `replaceState`: 152 passaram, 7 falharam, 2 pulados;
  - depois dela e com o código final: **155 passaram, 4 falharam, 2 pulados** (13,5 min).
  As falhas foram todas `toHaveURL`/`toHaveText` estourando 5 s. Investigação, sem rótulo apressado de "flaky":
  - **Meus testes de aba** (2 falhas na 1ª execução): causa real — `router.replace` só atualizava a URL depois de
    uma ida ao servidor. Corrigido com `window.history.replaceState` (API nativa documentada em
    `node_modules/next/dist/docs/01-app/02-guides/single-page-applications.md`, integrada a `useSearchParams`):
    o spec do seletor passou **24/24** (12 testes × 2 repetições), regiões 9/9 e `GoToInk` 1/1, e não falhou mais
    na suíte completa.
  - `sul.spec.ts:17` (busca por mouse → página da cidade): falhou nas duas suítes completas, mas rodando só esse
    teste 4 vezes seguidas, a **1ª falhou a frio (19,5 s) e as 3 seguintes passaram em ~3–4 s** — compilação da
    rota da cidade em dev sob carga, não regressão. `sul.spec.ts:163`, `cart-mirror.spec.ts:378` e o resto dos
    arquivos `sul.spec.ts` + `cart-mirror.spec.ts` rodando juntos: 89 passaram, 2 falharam (`sul:17` a frio e
    `cart-mirror:334`).
  - `cart-mirror.spec.ts:334` ("Atualizado há poucos segundos", depende do relógio): 15 passes em 16
    repetições; a falha isolada foi `toHaveText` sob load.
  - **O que não provei:** não rodei a suíte num checkout limpo de `origin/main` para comparar com a baseline sob a
    mesma carga; a conclusão "não é regressão" vem das repetições acima e de nenhuma dessas falhas tocar o
    código alterado (busca, cart-mirror e consentimento não foram editados). Vale uma rodada com a máquina
    ociosa antes da release.
- **Gates finais:** `tsc --noEmit` limpo, `eslint .` 0 erros, unitários 881/881, **`next build` com código de saída
  0**. Um `tsc`/`build` intermediário falhou por `.next/dev/types/routes.d.ts` truncado (o Playwright encerrou o
  servidor de dev no meio da escrita); é artefato gerado e ignorado pelo git, removido, e os dois voltaram a
  passar.
- **Capturas** (375 px e 1280 px, cidades reais fora do piloto, aba Algodão Peruano aberta, geradas com
  `EVIDENCE=1` por `tests/e2e-regions/capture-evidence.spec.ts`): `docs/screenshots/city-garment-tabs-full/`
  (Abatiá/PR, Abaetetuba/PA, Abadia de Goiás/GO). O preço exibido é o da peça (ex.: R$ 119,00 e R$ 139,90 no
  Norte), não o da camiseta clássica.

## 9. Limitações e riscos conhecidos

1. **Sul incompleto** (§7): ~319 páginas dos produtos mais antigos. Publicar o Sul assim mostraria abas
   corretas porém com contagens menores que a realidade (55% das famílias por cidade). Recomendo não publicar o
   Sul antes de terminar a passada.
2. **Canônicos sem cluster** (12,6–14,3% em Sul/Norte): só clássica. Depende da INK.
3. **Incremental não vê peça nova de cluster antigo**: `begin_date` filtra por `created_at`; uma peça criada
   depois para um cluster já coletado só aparece numa passada completa. Sugiro uma passada completa periódica.
   Sempre rodar `catalog:sync` **antes** do `garments:sync` (o vínculo precisa dos canônicos atuais).
4. **Vendabilidade**: HTTP 200 + "Adicionar" observado em 5 peças (3 lojas, 5 tipos), mas não é garantia
   futura; a INK documenta `not_published` como fora do ar. Não há checagem em tempo real na página (a
   renderização lê só o snapshot/índice local, nunca a INK). Se a INK passar a tirar peças do ar, o link levará
   a uma página de erro da INK até o próximo sync; um sync incremental não remove peças, só a passada completa
   com poda de clusters.
5. **Memória/latência**: o índice adiciona ~75 MB de RSS por processo e a primeira renderização de uma
   cidade por processo paga ~0,2 s. Medido em máquina carregada; vale reconferir no Railway.
6. **O índice não chega sozinho à produção**: ele vive no Volume, ao lado do snapshot. O botão de sync do admin
   não o atualiza e nenhuma rota faz `revalidatePath` depois dele (ver §10, passo 3).
7. **Exclusões não medidas** nesta passada (§7).
8. O crawl grava snapshot/índice/checkpoint só no fim de cada invocação; por isso os blocos de 250 GETs.

## 10. Roteiro de publicação (nada disto foi feito; tudo exige sua autorização)

1. **Terminar o Sul** (§11): `npm run garments:sync -- --store use-sul --max-requests-per-store 340` (retoma da
   página 750). Depois `npm run garments:coverage` e conferir os "sem variantes" do Sul contra a faixa de
   Norte/Centro (0,3–3,8%).
2. **Decidir por região**: Norte e Centro-Oeste já têm dados completos, mas seguem **fora do ar** (dependem do
   lançamento por região no CMS e de o catálogo dessas lojas estar publicado; nada disso mudou aqui).
3. **Levar o índice à produção**: (a) rodar `catalog:sync` e `garments:sync` dentro do container (Railway, com
   os tokens INK de lá) — cerca de 176 + 1.760 GETs —, ou (b) copiar `garment-index.json` (15,6 MB) para o Volume.
   Em ambos falta **revalidar as páginas de cidade** (ISR de 1 h, cache por mtime do índice); hoje só o sync do
   admin dispara `revalidatePath`. Implementar essa revalidação (ou aceitar até 1 h de defasagem) antes de
   publicar.
4. **Habilitar**: a presença do arquivo é o interruptor — sem variável de ambiente nova.
5. **Rollback**: apagar `garment-index.json` do Volume (e revalidar): todas as cidades voltam à grade clássica,
   sem deploy e sem tocar o snapshot base. Nenhum outro componente muda.
6. **Manter atualizado (sem agendamento ativado)**: `catalog:sync` → `garments:sync --max-requests-per-store 40`
   (incremental por `begin_date`, ~7 páginas/semana no Sul) e uma passada completa periódica (§9.3).
   Estimativa: incremental ≈ 10–50 GETs por loja; completa ≈ 1.100/350/420.

## 11. Pedido de autorização (uma, objetiva)

Para **terminar o Sul**: `npm run garments:sync -- --store use-sul --max-requests-per-store 340`, GET apenas,
snapshots locais, retomando da página 750 (restam ~319 páginas + crescimento do catálogo). Teto proposto:
**340 GETs** (em vez do resto do teto anterior, que se esgotou pelo incidente do §6). O comando agora salva as
páginas lidas mesmo se a conexão cair, então uma falha não repete o gasto. Nenhuma outra loja, nenhuma escrita
na INK, nenhuma ação em produção. Rodo `garments:coverage` ao final e atualizo este relatório.

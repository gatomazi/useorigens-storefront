# Cobertura integral do índice de peças — relatório da rodada

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
  exclusivo dos 3 fixtures da rodada passada. Isso significa que o próximo `npm run catalog:sync` de rotina
  (visível apenas, ~176 requisições no total, já uma operação existente e não o crawl expandido desta
  rodada) já popularia esse campo para todo o catálogo — mas essa sync de rotina **não foi executada nesta
  rodada** porque, por si só, já ultrapassaria o teto de 50 requisições/loja definido para esta rodada só
  para o Sul (99 páginas). Fica registrado como parte do roteiro de ativação (§7).

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

- **`src/lib/ink/garment-client.ts`** — `fetchGarmentSourceProducts`: crawl paginado de
  `GET /v1/stores/products` sem `visible_in_store`, com `begin_date` opcional, retomável por página
  (`startPage`), teto de requisições por chamada (`maxRequests`, nunca ultrapassado), backoff exponencial
  com **jitter completo** em 429 (`base + random(0, base)`), tudo injetável via `deps` para testes sem rede.
- **`src/lib/catalog/garment-checkpoint.ts`** — checkpoint por loja (`status`, `mode`, última página
  completa, `total_pages` visto, watermark `created_at`, total de requisições já gastas), escrita atômica
  (arquivo temporário + rename), gitignored ao lado do snapshot.
- **`src/lib/catalog/garment-sync-service.ts`** — `runGarmentSync`: uma passada limitada e retomável por
  loja. Resolve o modo automaticamente a partir do checkpoint (`in_progress` → retoma a mesma página/filtro;
  `complete` → passa a incremental com `begin_date` no watermark; sem checkpoint ou `--force-full` → crawl
  completo do zero). Vínculo por `buildGarmentBindings` (rodada anterior, **inalterado**) — só a fonte dos
  candidatos mudou. Merge por **upsert em `inkProductId`** (nunca substituição por par cidade+família): uma
  descoberta dividida entre duas chamadas retomadas nunca perde a primeira metade. Uma loja cuja busca falhe
  não tem nem o snapshot nem o checkpoint tocados — last-known-good, mesmo espírito de `shouldPromoteStore`.
- **`src/lib/catalog/garment-coverage.ts`** — categoriza cada binding canônico com `product_cluster_id`
  conhecido em completo (9 peças)/parcial (1-8)/sem variantes (0, cluster existe mas vazio)/sem cluster
  (nenhum `product_cluster_id`). Nunca soma isso a uma "cobertura %" sem esse detalhamento ao lado.
- **`scripts/sync-garments.mts`** (`npm run garments:sync`) — `--plan` (estimativa sem custo, zero
  requisições, lê o checkpoint existente), `--store`, `--max-requests-per-store` (obrigatório para uma
  execução real), `--force-full`. Progresso verificável por página.
- **`src/lib/ink/normalize.ts`** — `GarmentSourceProduct` ganhou `createdAt` (aditivo), usado só para o
  watermark incremental.
- **`src/lib/catalog/repository.ts`** — `garmentTabsForCity` ganhou a guarda de cluster obsoleto pedida no
  §6 da spec ("não exibir peça obsoleta quando um cluster principal sair do catálogo"): uma peça só é
  incluída quando `garmentBinding.productClusterId` ainda bate com o `productClusterId` **atual** do binding
  canônico daquela cidade+família — nunca só por eles compartilharem cidade+família. Sem isso, uma futura
  rotação do produto canônico (novo cluster, ou perda do cluster) numa sync de rotina deixaria uma peça de um
  desenho que a cidade+família não representa mais visível até o próximo `garments:sync` alcançar aquele
  cluster. Fail-closed, mesmo espírito do resto do vínculo — coberto por
  `tests/unit/garment-stale-link.test.ts` (3 casos: cluster bate, cluster mudou, cluster sumiu).

Durante a implementação, os próprios testes desta rodada expuseram e corrigiram **dois bugs reais** antes de
qualquer commit: (1) o fallback "sem arquivo ainda" de `readGarmentCheckpoint` devolvia o mesmo objeto
`EMPTY_GARMENT_CHECKPOINT` compartilhado, que uma chamada seguinte mutava in-place — corrigido para sempre
devolver um objeto novo; (2) o merge de bindings por "substituir o par cidade+família tocado" perdia a
primeira metade de uma descoberta dividida entre duas retomadas — corrigido para upsert por `inkProductId`.
Nenhum dos dois chegou a ser commitado sem o teste que os pegou.

**Observação, fora do escopo desta rodada**: `src/lib/catalog/snapshot-file.ts`'s `EMPTY_SNAPSHOT` e
`sync-service.ts`'s `syncCatalog` (`snapshot.stores[storeKey] = index`) têm a mesma forma estrutural do bug
(1) acima — se `readSnapshot()` alguma vez devolver o `EMPTY_SNAPSHOT` compartilhado (primeiro sync de um
processo sem arquivo ainda) e o chamador mutar `snapshot.stores[...]` diretamente, o singleton fica poluído
para o resto do processo. Não foi reproduzido nem corrigido aqui — é um código pré-existente, fora do que
esta rodada pediu para mexer — mas fica registrado como achado real para avaliação futura.

## 6. Testes

- `tsc --noEmit`, `eslint .`, `next build` — todos verdes.
- **845 testes unitários** (suíte inteira, zero regressão da rodada anterior), incluindo **35 novos**:
  - `garment-client.test.ts` (10): sem `visible_in_store`, `begin_date`, corte por `maxRequests` com página
    de retomada correta, retomada a partir de `startPage`, 429 com backoff+jitter, 429 persistente falha
    limpo, produto oculto ainda é retornado (nunca filtrado por status aqui), watermark do `created_at` mais
    recente, sem token falha antes de qualquer requisição, formato de resposta inesperado falha.
  - `garment-checkpoint.test.ts` (6): sem arquivo devolve vazio, ida e volta exata, escrita nunca fica
    parcial, arquivo corrompido cai para vazio, formato errado cai para vazio, erro de escrita nomeia o
    caminho.
  - `garment-sync-service.test.ts` (7, **integração com API fictícia paginada**): passe única marca
    completo; corte por teto marca `in_progress` e uma segunda chamada retoma exatamente da próxima página
    e completa (prova direta da correção do bug de merge); 429 no meio da passada ainda completa dentro do
    orçamento contando o retry; falha total da INK deixa snapshot E checkpoint anteriores intocados; loja
    sem catálogo base falha antes de rastrear às cegas; uma passada completa anterior vira incremental com
    `begin_date` no watermark certo; `--force-full` ignora o watermark.
  - `garment-coverage.test.ts` (8): completo/parcial/sem variantes/sem cluster, binding órfão não infla
    total, proporção "tem algum dado de cluster" exclui corretamente sem-cluster, snapshot vazio nunca gera
    NaN, múltiplas lojas relatadas independentemente.
  - `garments.test.ts` (+1): Água Boa/MT (Centro-Oeste) — lote completo de 9 peças, link e preço exatos da
    própria loja Centro.
  - `garment-stale-link.test.ts` (3): cluster do binding de peça ainda bate com o canônico → inclui; canônico
    rotacionou para outro cluster → exclui; canônico perdeu o cluster de vez → exclui (fail closed).
- **E2E**: os 6 specs já existentes de `city-garment-tabs.spec.ts` (Sul/Tijucas) seguem verdes. **Não foi
  possível** cobrir Xambioá/TO e Água Boa/MT por HTTP nesta rodada — `sul.spec.ts` já documenta que
  `/norte` retorna 404 no ambiente de e2e padrão (só Sul está publicamente "lançado" hoje, mesmo em
  produção — ver notas do CMS); tentei adicionar 2 casos HTTP para essas cidades e ambos deram timeout
  esperando a aba aparecer numa página 404, então os removi e cobri as mesmas duas cidades no nível de dados
  (`Catalog#garmentTabsForCity`, que não depende do gate de lançamento de região) em vez de insistir num
  caminho estruturalmente inviável — registrado aqui como a inconclusão que de fato é, não escondida.
- Nenhuma requisição real de coleta em massa foi feita nesta rodada — só as 24 chamadas de amostragem de
  completude de cluster + as chamadas pontuais de verificação de vendabilidade, dentro do teto de 50/loja.
- **Prova ao vivo do próprio mecanismo** (não só mocks): `npm run garments:sync -- --max-requests-per-store 2`
  rodado duas vezes seguidas contra a INK real — a primeira chamada avançou cada loja da página 0 até a 2
  (2 requisições/loja, `status: in_progress`); a segunda, sem reiniciar, retomou exatamente da página 3 e foi
  até a 4 (confirmado no `garment-sync-checkpoint.json` real, não um fixture) — 8 requisições reais no total
  nesta prova, bem dentro do teto de 50/loja. `total_pages` real devolvido pela INK bateu com a estimativa do
  §2 (Sul 1.066, Norte 309, Centro 385) quase exatamente.

## 7. Status de cobertura por loja (números reais, gerados por `garmentCoverageByStore` contra o snapshot atual — honesto: cobertura em massa ainda não fizemos)

| Loja | Bindings canônicos totais | Completo | Parcial | Sem variantes | Sem cluster | Observação |
|---|---|---|---|---|---|---|
| Sul | 9.531 | 0 | **1** (Tijucas/Traço — 8 de 9, falta Oversized, dado real da rodada anterior) | 0 | 9.530 | |
| Norte | 3.584 | **1** (Xambioá/Traço — 9 de 9) | 0 | 0 | 3.583 | |
| Centro | 3.829 | **1** (Água Boa/Traço — 9 de 9) | 0 | 0 | 3.828 | |

Os únicos 3 bindings com `product_cluster_id` conhecido nesta rodada são exatamente os 3 fixtures reais já
fetchados manualmente na rodada anterior — o crawl completo desta rodada **não foi executado** (autorização
pendente, item §8). Por isso **"sem cluster" aqui não significa "este produto de fato não tem cluster na
INK"** — significa, para 9.530/3.583/3.828 bindings, **"ainda não olhamos"**: `productClusterId` só é
persistido quando o produto é lido via o crawl sem filtro desta rodada (ou o sync de rotina que já captura
esse campo para produtos visíveis, mas que também não rodou aqui por orçamento). A amostra real de 24
clusters do §3 é a única fonte confiável, hoje, sobre qual fração do catálogo real cai em cada categoria —
e ela sugere ~87,5% completo, ~8,3% sem cluster de fato, ~4,2% sem variantes de fato, mas com margem de erro
de amostra pequena (24 pontos). **Não afirmamos cobertura de X% do catálogo inteiro** até o crawl completo
rodar — é exatamente a limitação que o mecanismo resumível resolve: rodar em pedaços, checkpointado, sem
nunca reivindicar mais cobertura do que o crawl realmente alcançou.

## 8. Pedido de autorização — item final obrigatório

**Peço autorização explícita para uma única execução da coleta completa**, nos seguintes termos exatos:

- **Teto proposto**: até **1.100 requisições para Sul**, **350 para Norte**, **420 para Centro** (margem de
  ~3% sobre a estimativa atual de 1.066/309/385 páginas, para absorver o crescimento do catálogo entre agora
  e a execução real).
- **Execução**: `npm run garments:sync -- --max-requests-per-store <teto por loja>`, uma vez por loja, as
  três em paralelo (mesmo padrão do sync principal existente).
- **Duração estimada**: ~27 minutos de parede (Sul é o gargalo; Norte e Centro terminam bem antes).
- **Interrupção/retomada**: se eu precisar parar no meio (ou se cair), o checkpoint já grava o progresso por
  página — rodar o mesmo comando de novo continua exatamente de onde parou, sem perder trabalho nem repetir
  requisições já feitas.
- **Nada muda na INK**: leitura pura, GET apenas, nenhuma peça é tornada visível, nenhum preço/imagem é
  alterado — só populamos nosso próprio índice local a partir do que já é publicamente comprável por link
  direto.
- Após a coleta completa, rodo `npm run garments:sync -- --plan` para gerar o relatório de cobertura real
  (completo/parcial/sem variantes/sem cluster) para o catálogo inteiro, e decido com você, a partir desses
  números reais, se o recurso está pronto para virar público em todas as cidades ou se precisa de outro
  ajuste antes.

Se você preferir um teto menor para uma primeira rodada de teste (por exemplo, `--max-requests-per-store 100`
só para validar em produção-like antes do crawl completo), o comando aceita esse valor exatamente da mesma
forma — o checkpoint garante que o restante fica pendente e resumível para uma próxima chamada.

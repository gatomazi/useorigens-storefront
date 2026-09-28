# Sync diário incremental das peças — runbook

Operação definitiva das abas de peças (`garment-index.json`) em produção. Contexto e histórico do índice:
[`city-garment-catalog-rollout.md`](./city-garment-catalog-rollout.md) (§16 resume esta operação).

## Arquitetura

```
Railway Cron  (serviço garments-sync-cron, "30 6 * * *" = 06:30 UTC = 03:30 Brasília)
   └─ POST http://useorigens-storefront.railway.internal:8080/api/admin/garments-sync   (Bearer ADMIN_SYNC_TOKEN)
         └─ storefront (dono do Volume /app/data/generated) responde 202 e roda o job em `after()`:
              1. lock (memória, compartilhado com catalog-sync  +  garment-sync.lock no Volume)
              2. catalog sync das lojas (só GET; escreve o snapshot SÓ se o conteúdo mudou)
              3. por loja (Sul, Norte, Centro-Oeste), passe incremental de peças
              4. índice novo validado -> renomeado atomicamente sobre garment-index.json (.prev = versão anterior)
              5. revalidação só das cidades dos clusters alterados (+ layout, se o catálogo base mudou)
              6. cursor e estado gravados (garment-sync-state.json)
```

- O serviço cron **não monta o Volume**, não tem código do app e não guarda segredo próprio: usa a variável de
  referência `${{useorigens-storefront.ADMIN_SYNC_TOKEN}}`. É só uma imagem `curl` com a schedule.
- Rota: `POST /api/admin/garments-sync` (dispara), `GET /api/admin/garments-sync` (status do job e do último resultado).
  Corpo opcional: `{"storeKeys": ["use-sul", ...]}`; qualquer outro parâmetro é 400. Sem token configurado: 503.
- Resposta `202` = aceito (não é "concluído"); `409` = já há um sync rodando (o cron trata como sucesso).

## Como o incremental funciona

- `begin_date` da INK filtra por **data de criação**, dia inteiro, fuso não documentado. Cursor por loja =
  `dia do produto mais novo visto − 2 dias` (`OVERLAP_DAYS`), nunca retrocede. Reler a janela é idempotente: peça igual
  não muda nada; peça com preço/imagem novos é substituída pelo id (sem duplicar).
- Primeira execução (sem `garment-sync-state.json`): cursor = `syncedAt` do índice da loja − 2 dias.
- Vínculo **somente** por `product_cluster_id` dentro da própria loja (mesmo linker do crawl completo).
- Por que o catálogo base roda antes: produto novo só vira peça se seu cluster já estiver no snapshot. Se o refresh do
  catálogo falhar numa loja, a passada de peças dessa loja é pulada (o cursor não anda).
- Não existe catalog sync incremental seguro: `begin_date` só enxerga produtos criados, então um merge incremental
  deixaria preço/imagem/ranking dos produtos clássicos velhos sem atualização. O catalog sync roda completo: **~176 GETs/dia** (Sul 99, Norte 37, Centro-Oeste 40, ritmo de 1,5 s/página,
  ~2,5 min). Comparado ao crawl completo de peças (~1.760 GETs) é ~10% e mantém o `product_cluster_id` em dia.
- Sem mudança: nada é regravado (nem snapshot, nem índice), nem `.prev`, nem revalidação; só o estado.

## Arquivos no Volume

| Arquivo | Quando existe |
|---|---|
| `catalog-snapshot.json` | sempre (reescrito só se o conteúdo mudou) |
| `garment-index.json` | sempre |
| `garment-index.json.prev` | depois da 1ª promoção; **uma** versão, sobrescrita a cada promoção |
| `garment-sync-state.json` | sempre; sobrescrito; por loja: `cursor`, `lastSuccessAt`, `lastRun` (métricas) |
| `garment-sync-checkpoint.json` (v2) | só se uma passada foi interrompida; apagado na próxima passada completa |
| `garment-sync.lock`, `garment-index.incoming.json`, `*.tmp` | só durante a execução |

Nunca há arquivo por data, histórico de execuções ou backup com timestamp. O histórico operacional é o **log do Railway**.

## Falhas

| Situação | Resultado |
|---|---|
| INK 429/5xx | backoff/retry do cliente (15/30/60/60 s + jitter); esgotado antes de qualquer página: loja falha, cursor intacto |
| Esgotou retries ou teto de 150 GETs/loja depois de ler páginas | progresso vai para o checkpoint; cursor intacto; próxima execução retoma na página seguinte (checkpoint > 12 h é ignorado) |
| Índice candidato reprova na validação | `garment-index.json` e `.prev` intactos; cursor intacto; `.incoming` removido |
| Processo morto no meio | rename é atômico: ou o índice velho ou o novo; lock some após 2 h; cursor só avança depois da promoção |
| Cron dispara com sync ativo | 409 (memória) ou `skipped-locked` (Volume): sai sem tocar em nada |
| Loja sem índice | falha explícita (`full crawl required`); o job diário **nunca** vira crawl completo |
| Índice ausente/corrompido | storefront cai na grade clássica (a presença do arquivo é o interruptor) |

## Logs (Railway) — uma linha JSON por evento, `scope":"garments-sync"`

`start` · `catalog` (`changed`, `requests`, `failedStores`) · `store` (por loja: `status`, `cursorBefore/After`, `requests`,
`retries`, `throttled`, `productsSeen`, `productsChanged`, `clustersChanged`, `durationMs`) · `end` (`result` ok|attention,
`inkRequests`, `indexPromoted`, `citiesRevalidated`, `durationMs`) · `skipped`.
Nada sensível é logado (sem tokens, sem URLs com credenciais).

```
railway logs --service useorigens-storefront | grep garments-sync
```

## Operação manual

```
# disparar (mesmo caminho do cron), de dentro do container ou pela rede privada
node -e "fetch('http://127.0.0.1:8080/api/admin/garments-sync',{method:'POST',headers:{authorization:'Bearer '+process.env.ADMIN_SYNC_TOKEN}}).then(r=>console.log(r.status))"
# status
node -e "fetch('http://127.0.0.1:8080/api/admin/garments-sync',{headers:{authorization:'Bearer '+process.env.ADMIN_SYNC_TOKEN}}).then(r=>r.text()).then(console.log)"
```

- **Pausar:** remover a `cronSchedule` do serviço `garments-sync-cron` (ou removê-lo). O storefront não muda.
- **Rollback do índice:** `mv garment-index.json.prev garment-index.json` (+ revalidar, ver rollout §12).
- **Recomeçar do zero:** apagar `garment-sync-state.json` (o cursor volta a ser derivado do `syncedAt` do índice).

## Limites conhecidos (por desenho da INK)

0. Produtos recém-criados chegam como camiseta **sem cluster**; as peças-irmãs só existem depois. Um dia com `piecesLinked=0`
   é normal. Se `piecesLinked` ficar 0 por muitos dias com `productsSeen` alto, investigar (replay de uma janela com o linker).

1. `begin_date` só vê produtos **criados** na janela. Mudança de preço/imagem de um produto antigo, ou reagrupamento de
   cluster, **não** aparece no incremental — só numa passada completa (`npm run garments:sync`, precedida de catalog sync).
   O preço do card da aba é o do último momento em que a peça foi lida; o link leva à página da INK com o preço real.
   Recomendação: passada completa manual esporádica (ex.: mensal), decisão do dono.
2. Uma peça criada antes de o produto principal do cluster ficar visível é descartada (`noCanonicalForCluster`); a
   sobreposição de 2 dias cobre o caso comum, não um atraso maior.
3. Clusters cujo produto principal saiu do catálogo permanecem no índice (inalcançáveis, sem efeito visível); a poda só
   ocorre em passada completa, para nunca perder peças por um snapshot base parcial.

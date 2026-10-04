# O Pódio — ranking regional (runbook)

Reconstrução (2026-10) da funcionalidade apagada. Não havia código anterior recuperável: tudo foi refeito nos padrões atuais
(snapshot no Volume + rota admin Bearer + script npm + cron Railway que só faz `curl`).

## O que aparece

- **Página do estado** (`/[region]/[uf]`, `#podio`): logo depois da vitrine "Destaques de {estado}" e antes do texto editorial.
  "O Pódio {de/do} {estado}", Top 3 **lugares mais vestidos** (municípios; no DF, Regiões Administrativas) e Top 3 **estampas mais
  vestidas** (famílias), com movimento (`↑1`, `↓2`, `NOVO`, `—`) em relação ao dia anterior e um rodapé com CTA para a vitrine
  (`#camisetas`, ou `#lugares` se o estado não tiver vitrine).
- **Home regional**: "Quem está no pódio?" logo depois de "Escolha o seu estado" — um card por UF com o líder e "Ver pódio →"
  (`/[region]/[uf]#podio`). Ordem editorial dos estados, não ranking entre estados. Nas duas homes (código e CMS).
- O ranking mede **as localidades estampadas nas camisetas vendidas**, nunca onde o comprador mora.
- Nenhuma quantidade, receita, pedido ou dado de cliente vai para a página (nem no payload RSC).

## Fonte e regra de cálculo

- **Pedidos**: `GET /v1/stores/orders?payment_status=paid` da INK, por loja (Sul/Norte/Centro-Oeste), com o cliente INK existente
  (ritmo de 1,5 s, back-off em 429, só GET). Uma execução típica: ~5 GETs no total.
- **Status aceito**: só pagamento confirmado. A INK devolve o texto localizado (`"Pago"`); o filtro `paid` retorna exatamente esses.
  Expirado, Cancelado, Reembolsado, Não Autorizado e Aguardando análise ficam de fora.
- **Data**: a INK **não expõe data de confirmação de pagamento** (só `created_at` do pedido e eventos de entrega). Usamos a data de
  criação do pedido, apenas para pedidos que estão pagos no momento do cálculo. Pix expira em horas e cartão é aprovado na hora, então
  a diferença é pequena; um pedido criado num dia e pago depois entra pela data de criação.
- **Janela**: 30 dias completos antes da data de referência D (America/Sao_Paulo): `[00:00 de D−30, 00:00 de D)`. A consulta à INK
  pede `begin_date = D−31` e `end_date = D` (o filtro é por dia, fuso não documentado) e o recorte exato é feito pelo instante.
- **Exclusões**: não pagos/cancelados/reembolsados; trocas (`is_exchange`: substituem uma unidade já contada no pedido original);
  pedidos com total ≤ 0 (cortesia/teste — a INK não tem marcador de pedido de teste); unidades reembolsadas (`refunded_quantity`) e
  gratuitas (`free_quantity`) de cada item. Reembolso parcial desconta só a quantidade do item.
- **Deduplicação**: pedido por `<loja>:<id>` e item por `<loja>:<pedido>:<item>`. A paginação confere `total_count`; se faltar pedido,
  relê uma vez e, persistindo, **falha** (nunca publica um resultado truncado).
- **Métrica**: unidades líquidas.

## Item → lugar e família

1. Produto do snapshot de catálogo da mesma loja (por id INK): o binding decide UF, localidade (`localityKeyOf`: RA do DF é localidade
   própria; lugar dentro de município conta para o município) e família. Tamanhos/cores são o mesmo produto.
2. Produto fora do catálogo (oculto desde então, ou peça irmã oculta): o **mesmo parser/resolvedor do indexador** (`catalog/parse.ts`)
   aplicado ao nome/tags que o próprio pedido traz. Cidade ambígua ou desconhecida nunca é adivinhada.
3. Família conhecida + UF no nome + cidade não resolvida: conta só nas famílias da UF. Sem UF inequívoca: não conta.
4. Não mapeados (produtos de estado inteiro, "Made in …", dizeres, merch) ficam listados em `unmapped` no snapshot interno.

## Ordem, empates e movimento

- Ordem: unidades desc → em empate, a ordem relativa do snapshot de **D−1** (quem estava ranqueado vem antes) → id canônico
  (IBGE / id da RA / id da família). No primeiro snapshot, só id. Evita troca de posição por ordem de consulta.
- Classificação completa guardada (não só o Top 3). Movimento = posição anterior − atual, comparando só com D−1 da mesma
  região/UF/ranking. `NOVO` = entrou no Top 3 vindo de fora (ou sem venda). Sem D−1: nenhum badge.
- Só entidades com unidades > 0. Com 1 ou 2 entidades, só essas posições.

## Arquivos (Volume, `catalogSnapshotDir()/podio/<region>/`)

- `YYYY-MM-DD.json` — snapshot completo de cada data (14 mais recentes). Reexecutar o mesmo dia só troca o arquivo de D.
- `latest.json` — o que home e página do estado leem (cache por mtime, sem tocar na INK).
- `state.json` — última tentativa (ok/falha) e último sucesso.

Escrita sempre temp + rename. Falha (INK, paginação, catálogo ausente, disco) **não publica nada** e registra a tentativa.

## Estados na página

| Situação | Comportamento |
| --- | --- |
| Snapshot válido | Mostra, com "Atualizado em {data}" |
| Um ranking vazio | Mostra só o outro, coluna única |
| UF sem venda elegível | Sem pódio nessa UF e sem card na home |
| Nenhuma UF com dados | Sem a chamada da home |
| Falha após o último snapshot, ou snapshot com mais de 26 h | Mostra o último, com "· atualização pendente" |
| Snapshot com mais de 72 h, ou nenhum | Esconde e loga `[podio] … hidden` no servidor |
| Execução completa com zero vendas | Limpa a exibição |

## Operação

- **Primeiro cálculo (local)**: `npm run podio:sync` (ou `-- sul norte`). Precisa de `INK_TOKEN_*` e do snapshot de catálogo.
- **Em produção**: `POST /api/admin/podio-sync` com `Authorization: Bearer $ADMIN_SYNC_TOKEN` (sem token: 503; outro processo
  rodando: 409; alguma região falhou: 502 com detalhes). Revalida `/<region>` e `/<region>/<uf>` das regiões calculadas.
- **Cron diário (a criar no Railway — não existe ainda)**: serviço `podio-sync-cron`, imagem `curlimages/curl`, sem Volume, mesmo molde do
  `garments-sync-cron`, schedule `0 7 * * *` (UTC) = **04:00 em Brasília** (depois do garments/catalog sync das 03:30):

  ```sh
  curl -fsS -X POST --max-time 600 \
    -H "Authorization: Bearer ${ADMIN_SYNC_TOKEN}" \
    http://useorigens-storefront.railway.internal:8080/api/admin/podio-sync
  ```

  com `ADMIN_SYNC_TOKEN=${{useorigens-storefront.ADMIN_SYNC_TOKEN}}` (referência, sem segredo próprio).

## Desligar / reverter

- **Desligar a exibição**: variável `PODIO_PUBLIC=off` no storefront (lida em tempo de execução) — some da home e dos estados no
  próximo render/revalidação. Pausar o cálculo: remover a schedule do `podio-sync-cron`.
- **Reverter só a feature**: reverter o(s) commit(s) da branch `feature/podio`; os arquivos em `podio/` no Volume podem ser apagados
  sem afetar nada.

## Analytics

`podio_click` (GA4, sem Meta) com `region`, `state`, `ranking_type` (`locality` | `family` | `cta` | `leader`), `position` e `source`
(`podio_home` | `podio_state`). Nunca alimenta o ranking.

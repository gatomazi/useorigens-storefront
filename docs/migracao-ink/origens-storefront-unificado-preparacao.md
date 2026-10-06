# Use Origens — storefront preparado para a loja única (sem virada)

Branch `feature/storefront-unificado-preparacao`, 06/10/2026. Nada foi publicado e nada foi escrito na INK. A produção não foi tocada.
**O padrão continua sendo três lojas independentes.** O modo de loja única existe no código, desligado, e hoje não liga em
produção nem que alguém tente, porque está bloqueado por dependências externas (§6).

## 1. Resumo

- **Um switch só: `COMMERCE_MODE`** (`multi-store` | `single-store`). Sem a variável, o modo é `multi-store`, igual a hoje. Um valor
  inválido é diagnosticado e mantém `multi-store`. A resolução região → catálogo → loja de compra → carrinho fica num lugar só
  (`src/lib/catalog/commerce-mode.ts`), e cada modo lê **os seus próprios arquivos**: catálogo, peças, coleções e recomendações. Não dá
  para combinar o catálogo novo com IDs de compra antigos, nem o contrário.
- **Loja única só fica ativa com tudo pronto.** Se o pedido é `single-store` mas faltam dados, os dados são de outro modo, há uma flag
  contraditória ou alguma dependência externa está pendente, o storefront inteiro continua em `multi-store` e mostra o motivo em
  `/api/ready` e no log de boot. Para voltar, basta tirar a variável. Nenhum arquivo é reescrito.
- **Prévia completa das três regiões**, com catálogo, **abas de tipo de peça** e **coleções** da loja única filtrados por região. As
  abas e coleções vazias eram a lacuna principal. Produtos ocultos aparecem só na **simulação** explícita, marcados e sem link de compra.
- **O sync de verdade sabe gerar a loja única:**
  - `catalog:sync -- --loja-unica`;
  - `garments:sync -- --loja-unica`;
  - `recommendations:build -- --loja-unica`.

  Os três usam o mesmo núcleo da prévia (`montarLojaUnica`). O sync de produção lê só produtos visíveis e publicados, então **não tem
  como publicar produto oculto**.
- **Referências antigas** são resolvidas pelo mapa antigo → novo, **só nas linhas confirmadas**: favoritos/Meus Lugares, sessão
  "Comprar minha lista" e produtos em destaque do CMS. Ausente ou ambíguo vira "indisponível", nunca uma correspondência por título.
  Nada é migrado: navegador, CMS e banco continuam com as referências que já têm.
- **Sul fica idêntico na loja única.** São 9.446 desenhos, 1.191 municípios e 71.638 peças. Norte e Centro-Oeste perdem as famílias
  cujas bases estão sem imagem, todo o merch e todas as coleções (§5). Isso está **registrado, não mascarado**: não há fallback para as
  lojas antigas.

## 2. Comandos

Tudo roda numa worktree isolada, sem tocar no Chrome nem na fila de mockups da outra sessão. A leitura de 05/10 é reaproveitada: as
160 mil peças não são relidas.

```bash
cd ~/projects/useorigens-unificado-prep            # worktree desta branch
# 0) Só se faltar: páginas brutas das coleções (4 GET no total; a segmentação de 05/10 não é regravada)
npm run unificado:ler -- --so-colecoes
# 1) Gerar o conjunto completo (offline, ~15 s). Cada execução é uma pasta nova; `atual` só troca no fim (troca atômica do symlink)
npm run unificado:gerar -- \
  --estado=data/unificado/estado/migracao-estado-f5901c1ddcfb1dbf.jsonl \
  --complemento=docs/migracao-ink/estado-complementar-20261005050850-ef5901c1d.jsonl.gz \
  --modo=simulacao \
  --site-config=$HOME/projects/useorigens/data/admin-dev/published/published.json   # só para a prévia: Norte/CO marcados como lançados
# 2) Abrir a prévia da loja única (simulação)
CATALOG_SNAPSHOT_DIR=$PWD/data/unificado/previa/atual SITE_CONFIG_HOME=on \
  COMMERCE_MODE=single-store COMMERCE_SIMULATION=on npx next dev -H 127.0.0.1 -p 3100
# 3) Mesmo diretório no modo atual (três lojas, mesma leitura): basta tirar COMMERCE_MODE
CATALOG_SNAPSHOT_DIR=$PWD/data/unificado/previa/atual SITE_CONFIG_HOME=on npx next dev -H 127.0.0.1 -p 3100
```

Páginas para conferir: `/sul`, `/norte`, `/centro-oeste`, `/norte/pa/belem` (abas de peça), `/norte/pa/belem/territorio`,
`/centro-oeste/mt/cuiaba`, a busca do cabeçalho e `/api/ready` (bloco `commerce`).

`--modo=producao` gera o que a loja única serviria **hoje, sem simulação**: Norte e CO vazios, porque tudo lá ainda está oculto
(`data/unificado/previa-producao/`).

### O que a geração grava (`data/unificado/previa/<runId>/`, gitignored)

| Arquivo | O que é |
|---|---|
| `catalog-snapshot.json`, `garment-index.json`, `collections-snapshot.json` | Modo atual (três lojas), montado da **mesma leitura** com as regras de `catalog:sync`/`garments:sync`/`collections:sync`. É a base de comparação. |
| `loja-unica/catalog-snapshot.json` | Loja única, com `source.mode = single-store` e `source.simulation`. |
| `loja-unica/garment-index.json`, `loja-unica/collections-snapshot.json` | Peças por tipo e coleções da `use-sul` casadas com o catálogo acima. |
| `loja-unica/referencias-antigas.json` | `use-norte`/`use-centro` id antigo → id novo, **só `confirmado`**: 30.575 + 37.306. |
| `loja-unica/identidade-migracao.jsonl` | Estado do migrador + complemento. É a identidade dos migrados que o sync de produção precisa (Gentílico não tem cidade no nome). |
| `relatorio/situacoes.jsonl` | Cada produto lido e sua situação: `publicado`, `simulado`, `oculto`, `sem-imagem`, `regiao-pendente` ou `excluido-indexador`. |
| `relatorio/desenhos-so-no-legado.jsonl`, `relatorio/mapa-pendencias.jsonl`, `relatorio/pendencias-regiao.jsonl` | As perdas, uma linha por item. |
| `manifesto.json` | Gravado por último, com o sha256 de cada arquivo. |

No Git ficam o resumo (`loja-unica-cobertura-20261006012624-sim-e2cb14409.json`) e as 110 peças sem região confiável
(`loja-unica-regiao-pendente-20261006012624-sim-e2cb14409.jsonl`).

Segurança da gravação:
- A saída é montada em `.tmp-<runId>` e só é renomeada inteira. Uma falha apaga o temporário, e o `atual` anterior continua valendo.
- Toda geração anterior fica preservada.
- Gravar no diretório de snapshots servido é **recusado** por código (`assertForaDaProducao`).

## 3. O modo de comércio

| | `multi-store` (padrão) | `single-store` |
|---|---|---|
| Catálogo de `/sul`, `/norte`, `/centro-oeste` | `use-sul`, `use-norte`, `use-centro` | `use-sul`, separado pela região da **cidade/merch**, nunca por "estar na loja Sul" |
| Compra (URL do produto) | loja da região | `usesul.com.br` |
| Espelho de carrinho (origem, KV, cart) | da região | o da Sul, nas três regiões |
| Arquivos lidos | `<snapshot dir>/` | `<snapshot dir>/loja-unica/` |
| Referências antigas (`use-norte:id`) | a própria | id novo pelo mapa (só confirmados), senão indisponível |

Quando o modo pedido é `single-store` e não pode valer, o motivo aparece em `/api/ready` → `commerce.diagnostics`:

- valor inválido;
- falta `loja-unica/catalog-snapshot.json`, ou ele não declara `single-store` da `use-sul`;
- `COMMERCE_STORE_PRIORITY` definido junto;
- snapshot de simulação sem `COMMERCE_SIMULATION=on`;
- snapshot real com dependência externa pendente.

O caso inverso também é coberto: um snapshot `single-store` na raiz lido em `multi-store` é recusado. Ele venderia Norte pela Sul.

Nenhuma opção pública: não há query string, cookie nem CMS para isso. É configuração do processo (Railway), lida a cada requisição.

## 4. Pontos comerciais afetados pelo switch

| Ponto | Onde | No modo único |
|---|---|---|
| Link de compra / CTA | `catalog/commerce.ts` (`purchaseUrl`) | Usa a URL do produto (já usesul). Item `simulated` nunca tem link. **Implementado.** |
| Abas de tipo de peça | `repository.ts` (`garmentTabsForCity`) | Lidas de `loja-unica/garment-index.json` pelo cluster do clássico. **Implementado.** |
| Ordem/ranking de lojas | `repository.ts` (`storeOrderFor`) | Só `use-sul`. `COMMERCE_STORE_PRIORITY` junto é recusado. **Implementado.** |
| Favoritos / Meus Lugares | `api/favorites/resolve`, `MeusLugaresView` | Favorito antigo resolvido pelo mapa. A lista agrupa pela **loja que vende**, com o nome da região navegada. O favorito salvo não é reescrito. **Implementado.** |
| "Comprar minha lista" | `api/buy-session` | A sessão é cunhada na loja que vende, com os ids servidos (uma loja por sessão). **Implementado.** Falta o Worker (§6). |
| Espelho de carrinho | `[region]/layout.tsx`, `SiteChrome` | `/norte` e `/centro-oeste` usam origem, KV e página de carrinho da Sul (`cartRegionFor`). **Implementado no storefront.** Falta o Worker (§6). |
| Destaques do hero (CMS) | `hero-featured.ts` | Ref `use-norte` → id novo pelo mapa; sem correspondência, o card some e o painel diz o motivo. **Implementado.** |
| Navbar do Worker (coleções) | `site-config/navbar.ts` | Refs de `use-norte`/`use-centro` caem (a coleção não existe na loja única e o link levaria à loja antiga). **Implementado; re-apontar no CMS.** |
| Carrosséis de coleção (CMS) | `collection-source.ts` | Ref antiga fica "indisponível" e a seção some. Item de outra região numa coleção da Sul é filtrado. **Implementado.** |
| Busca (coleções) | `search-docs.ts`, `global-index.ts` | Uma coleção só vale para a região se **todos** os membros forem dela ("Seu Lugar", mista, fica fora). **Implementado.** |
| Recomendações (Worker) | `api/recommendations` | Lê o índice do modo servido, na loja da região. `recommendations:build -- --loja-unica` recusa simulação. **Implementado.** |
| Link "produto pronto" (personalização) | `customization/requests.ts` | Exige o host da loja que vende. **Implementado.** |
| Validação do CMS (loja própria por região) | `site-config/schema.ts`, `admin/*` | **Não alterado** (CMS não é migrado nesta rodada). Documentos de Norte/CO continuam válidos com refs antigas. O storefront só deixa de mostrar o que não resolve. |
| Pódio | `podio/sync.ts` | **Não alterado.** No modo único buscaria os pedidos da `use-sul` três vezes, e o fallback de cidade usa as UFs da loja. Revisar antes da virada. |
| Textos/links regionais | `SiteChrome` ("Loja Use Norte" → usenorte.com.br; faixa "finaliza a compra na loja Use Norte"), `analytics/track.ts` (`REGION = "sul"` fixo no carrinho) | **Só verificado, não implementado** (fica junto com o tema do checkout). |

Carrinhos já abertos nas três lojas **não são migrados nem fundidos**. Na virada:
- quem tem carrinho na usenorte/usecentro continua com ele lá enquanto a loja existir;
- o token do espelho de Norte/CO (`origens:cart_ref:<região>`) deixa de ser lido e expira sozinho (30 min);
- o espelho passa a usar a chave da Sul;
- no retorno ao legado, o caminho é o mesmo ao contrário.

O que avisar ao cliente e quando desligar as lojas antigas é decisão comercial.

## 5. Cobertura: legado × loja única (mesma leitura de 05/10)

"Legado" = o que `catalog:sync`/`garments:sync`/`collections:sync` gravariam hoje para cada loja regional, a partir da leitura de 05/10.
O snapshot do Volume de produção não está nesta máquina; a cópia local é de 20/09. "Loja única" = simulação, com as bases Norte/CO
ocultas tratadas como ativadas. Em `--modo=producao`, Norte/CO dão **zero** em tudo hoje.

| | Sul | Norte | Centro-Oeste |
|---|---|---|---|
| Desenhos (cidade × família) | 9.446 → **9.446** | 3.582 → **1.944** | 3.814 → **2.344** |
| Municípios / localidades com produto | 1.191 → 1.191 | 450 → 450 | 468 / 503 → 468 / 503 |
| Peças por tipo (abas) | 71.638 → **71.638** | 27.005 → 17.488 | 33.282 → 21.096 |
| Merch | 254 → **244** | 60 → **0** | 81 → **0** |
| Coleções utilizáveis na região | 11 → 9 (produção: 10) | 19 → **0** | 19 → **0** |
| Desenhos só no legado / só na loja única | 0 / 0 | 1.652 / 14 | 1.584 / 114 |

Por família, em desenhos (legado → loja única):

| Família | Norte | Centro-Oeste |
|---|---|---|
| Feito em | 449 → **0** | 502 → **1** |
| Legado | 450 → **0** | 460 → **0** |
| Gentílico | 450 → **0** | 466 → **4** |
| Coordenadas | 447 → 246 | 498 → 470 |
| Ponto de Origem | 445 → 350 | 498 → 376 |
| Território | 449 → 448 | 459 → 498 |
| Tipografia | 450 → 450 | 466 → 496 |
| Traço | 442 → 450 | 465 → 499 |

Situação dos produtos da loja única:

| | Norte | Centro-Oeste |
|---|---|---|
| Bases simuladas (com imagem, ocultas) | 1.944 | 2.345 |
| Bases sem imagem de vitrine | 1.654 | 1.610 |

As bases sem imagem ficam fora: nenhum mockup substituto. As três famílias zeradas são justamente os lotes sem imagem. Os desenhos
que só existem na loja única (14 Norte, 114 CO) vieram do acervo e a loja antiga não tinha.

## 6. Pendências reais

**Dependências externas que bloqueiam a ativação comercial.** Ficam em `SINGLE_STORE_DEPENDENCIES`, todas `ready: false`; cada uma só
vira `true` num PR, depois de entregue e verificada:

1. `cart-mirror-worker`: o Worker/KV da usesul.com.br precisa devolver o comprador a `/norte` e `/centro-oeste`, e o referrer de
   chegada precisa ser aceito.
2. `buy-session-worker`: `list-watch.js` na usesul precisa atender `?ls=` de listas montadas em `/norte`/`/centro-oeste`.
3. `checkout-theme`: nome, logo e volta para a região navegada no checkout da loja única. Inclui os textos "Loja Use Norte" e
   "finaliza a compra na loja Use Norte" do storefront.
4. `cms-references`: publicação de Norte/CO ainda aponta coleções/produtos de `use-norte`/`use-centro`. Produto em destaque se resolve
   pelo mapa; coleção não tem mapa (ids por loja) e precisa ser re-escolhida no CMS.

**Dados:**

5. **Imagens.** 1.654 bases Norte e 1.610 CO sem imagem de vitrine. É a frente de mockups em andamento; a próxima geração já incorpora
   o que for corrigido.
6. **Merch Norte/CO** (60 + 81 visíveis hoje; Made in, DDD, Identidade) não existe na loja única. O usuário vai cadastrar à mão. A
   próxima leitura incorpora sem mudança de código, desde que o produto entre na coleção regional (`ZZ - NO`/`ZZ - CO`); sem isso ele
   cai em "região pendente".
7. **Coleções de Norte/CO:** 0 na loja única. As 19 de cada loja regional precisam ser recriadas na `use-sul`, só com produtos da
   região, para valerem na região.
8. **110 peças da Sul sem região confiável** (`loja-unica-regiao-pendente-*.jsonl`). São 100 não geográficas e 10 com UF do Sul no
   nome, todas criadas depois de 12/09 sem a coleção `SUL`. Há 11 visíveis:
   - "Praia Paraíso | Origem Localidade RS", a **peça Sul que sumiu** da sombra;
   - 10 merch, entre eles `Paranaense | Pé Vermelho`, `Gaúcho | Bagual`, `Rio Grande do Sul — Tradição` e `Mate Bom Demais - Menina`.
     São a diferença de merch 254 → 244 e o que derruba "Rio Grande do Sul", "Da Nossa Terra" e "Novidades".

   A correção é incluí-las na coleção `SUL`, uma escrita na INK para outra rodada. **Não foram classificadas como Sul em massa.**
9. **As 5 peças Sul que "entraram"** na sombra foram corrigidas, porque eram erro de código com evidência:
   - quais são: `Votouro`, `Ivailândia`, `Scharlau`, `Ibaré` e `São Pedro Alto`, todas `| Origem Localidade`;
   - a tag delas é "Camiseta Regional com Identidade", e o indexador de produção as exclui (`city-not-found`);
   - a reconciliação herdava a cidade de outra peça do cluster;
   - agora o catálogo servido segue a regra de produção, e a herança fica só para achar correspondências no mapa.

   Resultado: Sul igual ao legado vínculo a vínculo, exceto Praia Paraíso.
10. **Mapa antigo → novo:** igual à reconciliação. Norte: 24 ausentes, 20 ambíguas (Maraã × Sou de Maraã), 197 sem chave. CO: 262
    ausentes, 835 sem chave. Essas referências resolvem como indisponível.
11. **Preço:** a loja única mostra o preço da Sul. Exemplo: Belém Território a R$ 109,90, contra R$ 99,90 na usenorte. É decisão de
    negócio (reconciliação §8.1).

**Código, para antes da virada:**

12. Sync diário/incremental de peças (`garment-daily-sync`, `garment-incremental-sync`) e a rota admin `catalog-sync` ainda são só do
    modo regional. Para a loja única, usar o `garments:sync -- --loja-unica` manual.
13. O Pódio continua regional (§4).

## 7. Ativação futura e retorno (não executar sem autorização)

Ativação, em ordem. Cada passo é reversível; nada apaga o legado.

1. Concluir imagens e cadastros; ativar as bases na INK conforme a decisão de negócio.
2. Gerar a identidade atualizada com uma leitura nova:
   - `npm run unificado:ler` (com `caffeinate`, ~1h20);
   - depois `npm run unificado:gerar -- --modo=producao …`;
   - depois **conferir a cobertura** (`relatorio/cobertura.json`) contra §5.
3. No Volume, criar `loja-unica/` e copiar só `loja-unica/identidade-migracao.jsonl` e `loja-unica/referencias-antigas.json` da geração.
4. Rodar os syncs:
   - `npm run catalog:sync -- --loja-unica`;
   - `npm run garments:sync -- --loja-unica --max-requests-per-store <N>`, até completar;
   - `npm run recommendations:build -- --loja-unica`.

   O legado continua sendo sincronizado como sempre.
5. Entregar e verificar as quatro dependências do §6. Marcar cada uma `ready: true` em PR.
6. Num ambiente de preview do Railway, definir `COMMERCE_MODE=single-store`. Em `/api/ready`, conferir `commerce.effective =
   single-store` e `simulation = false`. Validar compra de ponta a ponta.
7. Na produção, mesma variável. Conferir `/api/ready` e o log `[boot] commerce`.

Retorno ao legado: remover `COMMERCE_MODE`, ou definir `multi-store`, e reiniciar. O storefront volta a ler a raiz do Volume, que nunca
deixou de ser sincronizada. Carrinhos e favoritos voltam a resolver na loja regional, porque nada foi reescrito.

## 8. Verificação desta entrega

- **Testes direcionados (45):** `tests/unit/commerce-mode.test.ts`, `tests/unit/loja-unica.test.ts` e `tests/unit/ink-unificado.test.ts`.
  Cobrem:
  - modo atual /sul→Sul, /norte→Norte, /centro-oeste→Centro em catálogo, compra e carrinho;
  - modo único com as três regiões na loja única e IDs correspondentes;
  - ausência de configuração e valor inválido mantendo o legado;
  - snapshot do modo errado recusado;
  - simulação só com liberação, e item simulado sem link;
  - dependências bloqueando o snapshot real;
  - separação das três regiões;
  - referências pelo mapa, com ausente = indisponível;
  - produção sem ocultos, base sem imagem fora, região pendente listada, herança por cluster fora do catálogo;
  - peças e coleções completas e por região;
  - sync gravando só em `loja-unica/`, com o legado intacto (sha) e last-known-good.
- **`vitest related`** sobre os arquivos alterados: 805 passam. As 14 falhas (`pages-model`, `pg-stores`) são as mesmas numa worktree
  limpa da `origin/main`, ou seja, preexistentes. `tsc` e `eslint` nos arquivos alterados estão limpos.
- **Prévia visual** (Playwright headless, sem o Chrome da outra sessão), desktop 1440×900 e mobile 390×844, em `/sul`, `/norte`,
  `/centro-oeste`, Belém, Cuiabá, Florianópolis, página de estampa e busca:
  - abas de tipo de peça presentes em Norte/CO;
  - nenhum link de compra para item simulado ("Prévia · ainda não está à venda");
  - Sul com links `usesul`.
- **Retorno validado no mesmo diretório:**
  - sem `COMMERCE_MODE`, legado com Belém em `usenorte` (316 links);
  - `single-store` sem liberar a simulação foi recusado;
  - `COMMERCE_MODE=single` (inválido) foi diagnosticado.

## 9. Próximo passo

Quando os ajustes de mockup e os cadastros manuais terminarem:

1. rodar de novo `unificado:ler` (leitura completa) e `unificado:gerar`, nos dois modos;
2. comparar `relatorio/cobertura.json` com §5;
3. levar o resultado à decisão de ativação junto com preço e merch.

A meta é Norte/CO com as oito famílias perto do legado, merch recriado e coleções regionais na `use-sul`.

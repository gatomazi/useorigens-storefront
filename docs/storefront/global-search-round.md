# Busca global do storefront — rodada `feature/storefront-global-search`

A busca do storefront deixou de ser só de cidades. Um único campo agora encontra **cidades e localidades** (incluindo as Regiões Administrativas do DF), **estados**, **estampas**, **hotpages e category landings**, **modelos de personalização**, **temas editoriais da home**, **coleções públicas da INK** e a página **Outros artigos**. A busca por cidade continua igual (mesmas regras, mesmos resultados para `tij`, `floripa`, `bage`).

## Arquitetura

```
snapshots no Volume + config publicada
  ├─ catalog-snapshot.json   (getCatalog, cache por mtime)
  ├─ garment-index.json      (getGarmentIndex, cache por mtime — agora exportado e compartilhado)
  ├─ collections-snapshot.json
  ├─ umapenca-snapshot.json
  └─ site-config/published.json (só com SITE_CONFIG_HOME=on)
        │
        ▼
src/lib/search/global-index.ts   (server-only) monta GlobalDoc[] por região lançada, em memória do processo,
        │                         reconstruído só quando alguma fonte muda (chave: catálogo, mtime do índice de peças,
        │                         checksum do publicado, syncedAt das coleções, mtime da Uma Penca, regiões lançadas)
        ▼
src/lib/search/global.ts         (puro) ranking, agrupamento por tipo, bloco "Em outras regiões"
        ▼
GET /api/busca?region=sul&q=…    (dynamic, Cache-Control public s-maxage=300, Server-Timing)
        ▼
src/components/search/GlobalSearch.tsx  (client) debounce 140 ms, AbortController, cache de respostas na aba
```

- Nada é consultado na INK durante uma busca. O índice nunca vai para o bundle: o navegador recebe só a resposta da consulta (66 B a 4,3 KB).
- `/api/cidades/[region]` e `src/lib/search/rank.ts` ficaram intactos (podem ter outros consumidores).
- `CitySearch.tsx` foi removido; seus três usos (diálogo do header/hero/campanha, página de estado, 404) usam `GlobalSearch`.

## Fontes do índice e indexabilidade

| Tipo | Fonte | Entra quando |
| --- | --- | --- |
| Estado | `REGIONS[r].ufs` | o estado tem ao menos uma localidade com produto |
| Localidade | `localitiesOfRegion` × `coveredLocalityIds` | tem produto à venda (município ou RA do DF; RA aparece como "Região Administrativa", nunca como cidade) |
| Estampa | `catalog.cityFamilies(local)` | o primary tem URL de compra verificada (`purchaseUrl`) |
| Hotpage / category landing | `docs[r].pages` publicados | não arquivada (rascunho nunca está no publicado) |
| Personalização | `docs[r].customizers` publicados | ativo e com mockup |
| Tema da home | seções `product-carousel` ativas | o carrossel realmente renderiza itens (mesma resolução da home) — nunca uma âncora morta |
| Coleção INK | `collections-snapshot.json` | pública (`isAvailable`), com página pública verificada (`collectionUrl`) e ≥ `MIN_USABLE_PRODUCTS` produtos; interna nunca vira link |
| Outros artigos | `umapenca-snapshot.json` | o feed tem artigos |

Só regiões **lançadas** (`launchedRegions()`) são indexadas. Editorial (páginas, modelos, temas) só existe com o CMS ligado, exatamente como as páginas públicas. Um tema da home e uma coleção INK com o mesmo nome viram um resultado só (o do storefront vence).

### Tamanho (dados de produção, 04/10/2026)

| Região | Documentos |
| --- | --- |
| Sul | 10.655 |
| Norte | 4.059 |
| Centro-Oeste | 4.341 |
| **Total** | **19.055** — estado 14 · localidade 2.144 · estampa 16.842 · editorial 55 |

- JSON aproximado dos documentos: ~9,8 MB; heap do índice preparado: ~47 MB (medido com `--expose-gc`, além do catálogo e do índice de peças que o storefront já carrega).
- Montagem: 0,4–0,9 s, uma vez por mudança de fonte.
- Busca local: p50 7 ms, p95 31 ms, média 11 ms (500 consultas mistas nas 3 regiões). `Server-Timing: search;dur=…` em cada resposta.

## Agrupamento de produtos (regra principal)

Uma estampa é **um resultado por lugar × família** (`cityFamilies`), nunca uma linha por peça. As peças são contadas pelo `product_cluster_id` do **próprio primary**, dentro da **própria loja**, no `garment-index.json` — a mesma associação das abas de peças da página da cidade. Nada é agrupado por nome ou por IDs próximos; sem cluster, a estampa conta só a peça clássica.

Nos dados reais todo cluster tem as 9 peças além da clássica: `Bagé · Traço — 10 peças disponíveis · a partir de R$ 94,00`. O preço inicial é o menor preço real entre o primary e as peças do cluster.

**Merch** (expressões, "Made in …", linhas como "Paranaense | Essência") entra como estampa, **um resultado por `product_cluster_id`** dentro da loja. O indexador do catálogo passou a guardar o cluster do merch (`MerchProduct.productClusterId`, vindo do `product_cluster_id` que a INK já devolvia e era descartado); o valor aparece no snapshot na próxima sincronização do catálogo. Merch sem cluster vira um resultado por produto (nunca agrupado por nome). Título = o nome mais curto do grupo (a peça base); o nome de cada peça continua pesquisável ("menina" encontra "Mate Bom Demais"). Merch não tem página no storefront: o resultado abre a página verificada do produto na INK e dispara `GoToInk`, como qualquer link de produto INK. Num catalog sync real (somente leitura) de 04/10: Sul 230 de 261 merch com cluster, 7 estampas com 2 peças cada passaram a ser um resultado só ("Gaúcho | Gaudério", "Paranaense | Bicho do Paraná"…). Dois "Made in Santa Catarina" continuam separados porque são produtos INK distintos (clusters e imagens diferentes).

**Destino da estampa:** a página da estampa no storefront (`/{região}/{uf}/{lugar}/{família}`), que mostra as versões e leva à compra. A escolha da peça (oversized, regata…) continua nas abas da página do lugar; a página da estampa ainda não lista as peças. Decisão para revisão: se preferir, o destino pode ser a página do lugar (perde-se o foco na estampa).

## Ranking

Puro e determinístico (`src/lib/search/global.ts`), sem fuzzy. Cada documento recebe uma classe de correspondência:

| Classe | Regra |
| --- | --- |
| 6 exato | a consulta inteira é um dos nomes do documento (lugar e apelidos, "Bagé Traço"/"Traço Bagé", título da página) |
| 5 prefixo | um dos nomes começa com a consulta (`tij` → Tijucas) |
| 4 palavras | todos os termos são palavras inteiras de um campo forte |
| 3 parcial | todos os termos são prefixo de palavra (ou, a partir de 3 letras, trecho) de um campo forte |
| 2 auxiliar | algum termo só bate num campo auxiliar (estado, UF, mesorregião, descrição) |

Dentro da classe: lugares > estampas > editorial. Empates: ordem editorial/comercial (`sortOrder` da família, apelido curado para lugares), mais vendas, título mais curto, título, chave. Isso dá exatamente a ordem pedida: lugar exato, estampa exata, coleção/página exata, prefixo, palavras inteiras, parcial, auxiliares.

## Comportamento regional

- Os resultados da região atual vêm primeiro, agrupados: **Cidades e localidades** (6), **Estampas** (6), **Coleções e temas** (5). Grupo vazio não aparece.
- Depois, **Em outras regiões** (até 6): resultados de outras regiões lançadas com classe ≥ 4 (prefixo de nome já conta). Correspondências só parciais ficam na própria região. Uma página que toda região tem (Outros artigos) aparece uma vez só.
- Homônimos são separados pela UF: `taguatinga` traz Taguatinga (TO, cidade) e Taguatinga (DF, Região Administrativa).

## UI

- Gatilho do header: **Buscar** (era "Buscar cidade"); diálogo "Buscar na Use Origens".
- Placeholder: **Busque uma cidade, estampa ou coleção…** (Centro-Oeste: "Busque uma cidade, região ou estampa…"). O hero mantém o lugar em primeiro: "Busque sua cidade, estampa ou coleção…".
- Linhas: lugares no estilo de antes (nome grande + estado · mesorregião); estampas com miniatura real, "10 peças disponíveis · a partir de R$ …"; editorial com o tipo visível (Especial, Categoria, Personalize, Tema, Coleção, Página).
- Mobile: o campo fica fixo no topo da folha enquanto os resultados rolam (o teclado não esconde o campo nem a lista), linhas ≥ 66 px, sem overflow em 320/375/390/440 px. Foco inicial no campo, setas + Enter, Esc fecha (diálogo nativo), fecha ao navegar.
- Estados: "Buscando…", erro com **Tentar de novo**, vazio com os estados da região e o link para `/busca`. Miniatura que falha vira um quadro vazio, nunca ícone quebrado.
- Um bug latente corrigido: o item ativo seguia o ponteiro parado (`mouseenter`) — resultados surgindo sob o cursor roubavam o Enter. Agora só `mousemove` muda o item ativo.

## Tracking

- `Search` (Meta) e `view_search_results` (GA4) continuam disparando **uma vez**, só no gesto conclusivo (Enter ou clique), nunca por tecla. `search_string` segue sendo o que foi escolhido (`Florianópolis - SC` para um lugar, o título para os demais).
- GA4 ganhou `selected_result_type` (`state`, `locality`, `design`, `page`); `region` e `results_count` já existiam. O texto digitado **não** é enviado (política existente do storefront: nunca as teclas cruas — evita e-mail/telefone digitados por engano).
- Escolher um lugar continua disparando `SelectCity` (com `localityType` para RA). Nenhum evento novo foi criado.

## CMS (auditoria)

Não foi adicionado campo de busca ao CMS nesta rodada. Título, descrição SEO, slug e títulos das seções de uma página já alimentam a busca; temas da home vêm do título do carrossel. Se algum caso editorial precisar, o próximo passo simples é um `searchKeywords?: string[]` opcional em `Page`/`Customizer` (validado em `schema.ts`, lido em `global-index.ts`) e um "Esconder da busca".

## Screenshots

`docs/screenshots/global-search/`: `search-city-mobile.png` (tij), `search-design-mobile.png` (traço), `search-collection-mobile.png` (da nossa terra), `search-mixed-desktop.png` (canecas), `search-no-results.png` (zzzxq). Geradas com uma cópia somente leitura dos snapshots de produção.

## Testes

- `npm run typecheck`: ok. ESLint: 0 erros (1 aviso antigo em `tests/unit/navigation-config.test.ts`).
- `npm test`: 89 arquivos, 1.197 testes. Novos em `tests/unit/global-search.test.ts` (16): cidade exata, prefixo, acentos, estampa exata, 10 peças em 1 resultado, sem duplicação, coleção pública × interna, hotpage viva × arquivada, região não lançada, região atual primeiro, outras regiões depois, tema duplicado, carrossel vazio, payload sem contagens, fallback com Volume vazio.
- `npm run build`: ok (avisos de Edge Runtime já existentes).
- E2E `tests/e2e/global-search.spec.ts` (9): clique em cidade, estampa agrupada e clique, família sem duplicar lugares, Esc, vazio, endpoint falhando com retry, 320 e 375 px.
- E2E `tests/e2e-regions/global-search-regions.spec.ts` (5): clique em hotpage (fixture ganhou uma hotpage "Dia dos Pais"), "Em outras regiões", smoke nas 3 regiões. O teste de `Search` único continua coberto pelos testes de tracking existentes.
- Suíte `tests/e2e` (exceto os 2 specs que exigem `data/generated/garment-index.json`, ausente nesta máquina): 186 passaram, 4 falharam — **as 4 falham igual na `main`**: altura da página de estado no celular (2629 px na `main`, limite 2600) e os 3 testes do dropdown "Sul" do header. Suíte DF: 6 passaram; 1 falha por falta do `garment-index.json` local (abas de peças).
- O teste antigo "índice de cidades vazio memorizado" foi removido: o diálogo não usa mais `/api/cidades`; a garantia equivalente (falha não memorizada + retry) está no novo E2E.

## Limitações

- Até a próxima sincronização do catálogo em produção, o merch aparece sem agrupamento (o snapshot atual ainda não tem o cluster dele).
- A peça é escolhida na página do lugar, não na página da estampa.
- Os exemplos `pais` e `churrasco` não retornam nada em produção hoje: não há hotpage viva nem coleção com esses nomes (a única hotpage, "Dia das Crianças", está arquivada). A busca encontra a página assim que ela for publicada.
- Primeira busca após um deploy ou mudança de snapshot paga a montagem do índice (~0,5–0,9 s); depois é cache.

## Commits (locais, branch `feature/storefront-global-search`, a partir de `cccfa6d`)

- `bd3b8cb` feat(storefront): global search for places, designs and editorial pages
- o commit seguinte, `test(storefront): …`, com testes, este relatório e as screenshots

Sem push, PR, merge ou deploy.

## Rollout e rollback

- Rollout: merge + deploy normal; nenhuma env nova, nenhuma migração, nenhum serviço novo. O índice se monta na primeira busca.
- Rollback: `git revert` dos commits desta rodada volta o `CitySearch` e os textos anteriores; nada persistente foi criado (o índice vive só em memória).

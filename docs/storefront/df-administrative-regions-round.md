# Distrito Federal + Regiões Administrativas no storefront e no CMS

Worktree `.claude/worktrees/df-administrative-regions`, branch `worktree-df-administrative-regions`, base `cdea08e` (main). Só commits locais: nada de push, merge, PR, deploy, migração, Railway, DNS, INK ou Worker. **Nenhuma requisição à INK foi feita** (tudo saiu do snapshot local).

## 1. Causa raiz

O modelo assumia que todo lugar é um município (IBGE). O DF tem **um** município (Brasília, 5300108). O indexador já reconhecia que Taguatinga, Ceilândia etc. não são cidades, mas resolvia o problema "colando" todas na Brasília: `cityId = 5300108` + `localityLabel = "Taguatinga"`, e o código tratava `localityLabel` como "lugar dentro de uma cidade", que nunca é o card da cidade. Consequências:

| Onde | O que acontecia |
|---|---|
| CMS, busca de produtos do hero (`hero-featured.ts`) | `cardOf` recusava todo produto com `localityLabel` ("produto de localidade, não de cidade"): **102 dos 104 produtos do DF invisíveis** (só os 2 de Brasília apareciam). |
| CMS, seções alimentadas por coleção INK (`collection-source.ts`) | O produto de RA aparecia rotulado "Brasília · DF". |
| Busca pública de cidades (`/api/cidades`) | O índice só tinha municípios: nenhuma RA era encontrável. |
| Busca pública de produtos | Achava o produto pelo nome da RA (contexto `Taguatinga · DF`), mas ao buscar "Brasília" listava as 102 (o nome da cidade estava nos campos fortes de todos) e nada dizia que era uma RA. |
| Página de Brasília | 102 cards de "Lugares de Brasília", sem página de RA. |
| Página do DF, home, sitemap | "1 cidade" (Brasília), zero RAs. |
| Rotas | `/centro-oeste/df/taguatinga` = 404. |

## 2. Fonte real dos dados (auditoria)

`node --import tsx scripts/audit-df-localities.mts` (saída em `docs/storefront/df-audit-output.txt`; `npm run audit:df`).

- Snapshot do `use-centro`: 3.914 produtos; **104 bindings do DF, todos com `cityId = 5300108`**. 2 são de Brasília (Brasiliense/gentílico + Ponto de Origem "Brasília"); **102 são de RAs**, com `localityLabel`.
- **Não há fonte estruturada por RA no snapshot.** As coleções INK do DF são por estado (`DF` #139672: 546 reportados, 114 casados no snapshot; `Distrito Federal` #142576 interna, 5; `ZZ - CO - *-DF` internas, 0 casados). Tags/metadata da INK **não** estão no snapshot (só a INK teria, e ela não foi consultada). O `memberIds` guarda no máximo 48 por coleção.
- A melhor fonte disponível é o **título do produto na INK** (`"Taguatinga | Origem DF"`, `"Feito Em Aguas Claras - DF"`), que o snapshot preserva em `localityLabel`, e o slug INK, que concorda (`feito-em-taguatinga-df`). O título vem com e sem acento para o mesmo lugar ("Aguas Claras"/"Águas Claras"), por isso é casado **exatamente, sem acento e sem caixa**, contra um índice oficial e fechado de RAs. Título fora do índice **não** vira RA (fica como antes, lugar dentro de Brasília).
- Resultado: **52 títulos → 35 RAs, 0 sem correspondência**. Todas as 35 RAs oficiais têm produtos (33 com Feito em + Ponto de Origem + Coordenadas; Água Quente e Arapoanga só com Feito em; Taguatinga tem 2 Ponto de Origem: um principal e uma variante, ambos mantidos). Total: 102 produtos em 35 RAs.
- Consistência: SCIA (Ponto de Origem, Coordenadas) e Estrutural (Feito em) juntos formam uma RA com os 3 estilos e sem sobreposição; separados seriam duas RAs incompletas, o que confirma que são a RA XXV (SCIA/Estrutural).
- Brasília como fallback indevido: sim, era o `cityId` de todos os 104.

## 3. Arquitetura

- **`Locality`** (`geo/cities.ts`): o antigo `City` ganhou `type: "municipality" | "administrative_region"`, `parentLabel` ("Distrito Federal"; para município, o estado), `parentCityId`, `officialCode`. `City` continua exportado como alias, então nada quebra. `allCities()`/`cityById()` seguem só de municípios (contagens "cidades", cobertura IBGE).
- **Índice de RAs** (`geo/administrative-regions.ts`): as 35 RAs oficiais (numeração I–XXXV da GDF), com alias para RA XXV (`SCIA`, `Estrutural`). É dado de referência; disponibilidade comercial é separada: só vira página quem tem produto (`Catalog.coveredLocalityIds`, `localityProductCount`). RA sem produto = 404, não aparece na busca nem no sitemap.
- **`geo/localities.ts`**: `localityById/BySlug`, `localitiesOfRegion`, rótulos e agrupamentos por estado (`stateLocalityLabel` → "Brasília e 35 Regiões Administrativas"; `stateLocalityGroups`).
- **Catálogo**: `CityDesignBinding.localityId?` (só RA). `locality-binding.ts`: `localityKeyOf`, `isSubLocality` (lugar dentro de município, como Torres › Praia Paraíso: continua nunca sendo principal), `withLocality` (deriva `localityId` de snapshots antigos com a mesma regra de casamento exato, em tempo de leitura, **sem resync**). O ranking e a cobertura passam a ser **por localidade**: a RA é a principal das próprias famílias. `coveredCityIds` continua só municípios (idêntico ao anterior em todas as regiões, verificado contra o snapshot real); `coveredLocalityIds` inclui RAs. O indexador grava `localityId` nos próximos syncs.
- Todos os leitores de `cityById(binding.cityId)` (lookup de favoritos/buy-session, busca de produtos, coleções do CMS, customizer) passaram a `localityOfBinding`.

## 4. Rotas

Reuso de `/[region]/[uf]/[city]` (o parâmetro segue chamado `city` por compatibilidade; o domínio aceita `Locality`):

```
/centro-oeste/df/brasilia            município (como antes)
/centro-oeste/df/aguas-claras        RA
/centro-oeste/df/taguatinga          RA
/centro-oeste/df/aguas-claras/coordenadas   página do estilo, mesmo renderer
```

Desconhecida ou incoerente → 404: `/centro-oeste/df/atlantida`, `/centro-oeste/go/aguas-claras`, `/sul/df/taguatinga`, `/norte/df/taguatinga`, RA sem produto. Slug único por RA; sem alias duplicando Brasília/DF.

## 5. O que muda na interface

- Município → "cidade"; RA → "Região Administrativa" (nunca "cidade"/"município").
- **Busca pública de cidades**: no Centro-Oeste, "Busque sua cidade ou região…"; RA aparece como `Águas Claras — Distrito Federal · Região Administrativa`; o resultado "Distrito Federal" diz "Ver Brasília e as Regiões Administrativas". Sul e Norte: texto idêntico ao de antes.
- **Busca pública de produtos** (`/busca`): cada RA devolve só os produtos dela (contexto `Taguatinga · DF`); buscar "Brasília" não lista mais produtos de RA.
- **Página do DF**: "Brasília e 35 Regiões Administrativas", grupos "Brasília" / "Regiões Administrativas", seção "Localidades do estado", SEO próprio (`Camisetas de Brasília e Regiões Administrativas do DF`). Sem "município", sem "N cidades". GO/MT/MS: "N cidades · M regiões" como antes.
- **Página de RA**: mesmo renderer (Estilos, favoritos, tracking, links INK); subtítulo `Distrito Federal · Região Administrativa`; título `Camisetas de Águas Claras, DF | Use Origens`; descrição "…Região Administrativa do Distrito Federal"; canonical da própria rota; chips "Outras Regiões Administrativas" (+ link para Brasília). A página de Brasília ganhou "Regiões Administrativas do Distrito Federal" (os 35 links) no lugar dos 102 cards.
- **Home do Centro-Oeste**: o card do DF diz "Brasília e 35 Regiões Administrativas", chips "Localidades" (Brasília 1 / Regiões Administrativas 35) e o link "Ver as localidades de Distrito Federal". Os contadores da barra/hero seguem sendo municípios ("468 cidades"): correto, RA não é cidade.
- **CMS**: a busca de produtos do hero acha por nome da RA, "Distrito Federal", "região administrativa" e estilo; o resultado traz "· Região Administrativa"; o card do hero aponta a rota da RA. Seções de coleção INK rotulam o produto pela RA. `structured-status` descreve o DF corretamente.
- **Sitemap**: +35 páginas de RA e +101 páginas de estilo (RAs elegíveis), Brasília uma vez, sem duplicatas.
- **Tracking**: eventos e schemas intactos. `select_city` do GA4 ganha `locality_type: "administrative_region"` e `locality_name` **só** quando o lugar é RA; Meta não mudou.

## 6. Produtos invisíveis no CMS

- **102** (98% dos 104 do DF). Busca do hero, `centro-oeste`: elegíveis antes 3.722, agora 3.824.
- Seguem propositalmente fora (lugares dentro de município, não cards da cidade): 5 no Centro-Oeste fora do DF, 5 no Sul, 1 no Norte.
- Não existem coleções INK internas por RA (ver §2), então não há vínculo estruturado melhor a usar; coleções internas continuam podendo alimentar o CMS sem gerar "Ver todos" público (regra intacta, `collectionState` não foi tocado).

## 7. Testes

| Verificação | Resultado |
|---|---|
| `tsc --noEmit` | limpo |
| `eslint` (src, tests, scripts) | limpo |
| `vitest run` | **66 arquivos, 924 testes verdes** (baseline: 63/866) |
| `npm run build` | ok |
| E2E direcionado (`npm run test:df`, 14 testes) | **14/14** |
| E2E existente `tests/e2e` (Sul, tracking, favoritos, cart-mirror…) | 160/161; a falha, `sul.spec.ts:332` (altura da página de estado em 375px < 2600, deu 2629), **falha idêntica no commit base `cdea08e`** (ambiente/fontes), não é regressão |
| E2E CMS existente (`playwright.admin.config.ts`, 18 testes) | roundtrip 4/4, scopes 3/3 (Norte e Centro-Oeste lançam), hotpages 5/5 (+1 de capturas, `skip` de origem), navbar 1/1, structured 3/3. **`hero.spec.ts` (Norte) falhou 2 vezes e passou 3 (uma com `--trace`), e passou 1/1 no commit base**: a falha é sempre a mesma corrida do teste (`fill` no slot 3 logo depois do 2º "Escolher produto": o slot fecha por um re-render tardio; o `<input>` "detached"). Não achei relação com a mudança (a busca de Norte devolve o mesmo resultado; nenhum código do fluxo mudou), mas **não consigo descartar** sensibilidade de tempo; vale rodar de novo no seu ambiente. |

Novos:
- `tests/unit/df-localities.test.ts` (37): índice de RAs, rotas, indexação, ranking por localidade, catálogo sobre snapshot no formato antigo, busca, contagens/cópia, SEO.
- `tests/unit/df-cms.test.ts` (12): busca do hero (Taguatinga, Águas Claras com/sem acento, Brasília sem vazamento, "região administrativa", GO inalterado, lugar fora do índice recusado), coleção INK rotulando a RA.
- `tests/integration/df-real-catalog.test.ts` (7, snapshot real): 102 produtos em 35 RAs; 3 RAs reais (Águas Claras 3, Taguatinga 4, Ceilândia 3) sem vazamento; **nenhum produto perdido/duplicado** (soma por localidade = total do Centro-Oeste); **cidades cobertas idênticas às da regra antiga nas 3 regiões**; toda RA coberta resolve rota.
- `tests/unit/analytics.test.ts`: `locality_type` só no GA4 e só para RA.
- `tests/e2e-df/df.spec.ts`: lança Centro-Oeste e Norte pelo CMS (sandbox temporário) e cobre os 12 casos mínimos do pedido: Brasília continua; RA na busca do CMS; a mesma RA na busca pública; clique leva à rota; página da RA só com os produtos dela (links INK contêm o slug da RA; nenhum de Taguatinga/Ceilândia/Gama/Brasília); Brasília sem produtos de RA; DF sem "município"/"N cidades"; GO/MT/MS iguais; Sul/Norte iguais; RA sem produto/desconhecida = 404; sitemap (Brasília + 35 RAs, sem duplicatas, sem RA desconhecida); 375px sem scroll horizontal.

## 8. Screenshots

`docs/screenshots/df-administrative-regions/`
- `busca-publica-aguas-claras.png` — busca pública com resultado de RA
- `pagina-df.png` — página do DF
- `pagina-ra-aguas-claras.png` (+ `-375.png`) — página de uma RA
- `cms-busca-taguatinga.png` — CMS buscando uma RA (4 resultados, "Região Administrativa")
- `cms-hero-ra-escolhida.png` — RA escolhida no hero
- `home-centro-oeste-estados.png` — home do Centro-Oeste com a seção de estados corrigida

## 9. Limitações e decisões para você

1. **O índice das 35 RAs foi digitado por mim** (numeração oficial da GDF), sem consulta externa. O snapshot o valida (52 títulos casam, 35 RAs com produto, 0 órfãos), mas vale uma conferência sua dos nomes oficiais (ex.: "Sudoeste/Octogonal", "Sol Nascente/Pôr do Sol").
2. **SCIA e Estrutural foram unidas como a RA XXV** (alias no índice). É a única união que não vem literalmente de um título; o snapshot a sustenta (§2). Se preferir separar, é remover o alias.
3. Sem tags/metadata da INK não há confirmação estruturada do vínculo produto→RA além do título e do slug. Se a INK passar a expor a RA (tag ou coleção), trocar `administrativeRegionByLabel` por essa fonte é uma mudança localizada.
4. Buscar "Brasília" (busca pública e CMS) **deixou de listar produtos de RA**: é intencional (RA ≠ Brasília), mas muda o comportamento visto hoje.
5. "Plano Piloto" (RA I) e "Brasília" (município) são páginas distintas, como o catálogo já as separa.
6. O botão de busca do cabeçalho no Centro-Oeste é mais longo ("Buscar cidade ou região").
7. A seção "Sua cidade, de 8 jeitos" continua usando a cidade de exemplo fixa (Goiânia); `resolveCity` já aceita uma RA se um dia quiserem outra.
8. **Depois do merge com a main (garment tabs, PR #29–#31):** só conflitos triviais em `indexer.ts` e `repository.ts`, resolvidos mantendo as duas mudanças. As abas de peças funcionam nas páginas de RA sem código extra (a ligação é pelo cluster do produto principal da própria RA: Águas Claras e Ceilândia 9 peças, Taguatinga 18, Brasília 18; nenhuma peça de uma localidade aparece na outra). Verificado: vitest 1034 verdes, tsc/eslint/build limpos, `test:df` 14/14 (2 asserções ajustadas porque agora há mais links INK por página), `tests/e2e` 172 passam; falharam `sul.spec.ts:26` e `:163`, que passam isolados (partida a frio do índice de 20 MB, já documentada na branch das abas), e `:332`, que falha na base. `feature/seo-entrega-c` (checkout principal, mudanças não commitadas em `sitemap.ts`, `src/lib/seo/sitemap.ts`, `seo/copy.ts`) e `feature/city-garment-tabs` tocam os mesmos pontos: ao juntar, o sitemap novo precisa usar `coveredLocalityIds`/`localityById` e a copy de estado/cidade precisa dos parâmetros novos (`administrativeRegions`, `type`); o garment index é por cluster INK e não foi verificado com rotas de RA.
9. O snapshot tem só 48 `memberIds` por coleção (limite do formato existente): uma seção alimentada pela coleção `DF` mostra os 48 primeiros dos 114.
10. Ambiente: `node_modules` do worktree é clone do principal e `data/generated`, `data/admin-dev` foram copiados (ignorados pelo git). O hook global de pre-commit reclama de `.pre-commit-config.yaml` ausente; os commits usaram `PRE_COMMIT_ALLOW_NO_CONFIG=1` (não há config, nada foi pulado).

## 10. Commits (locais)

```
c211088 feat(geo): support DF administrative regions as localities
23e5178 feat(cms): expose DF administrative-region products
5e86694 feat(storefront): search and render DF administrative regions
1419349 test(df): cover RA routing, search and isolation
f6d07af test(df): add end-to-end and real-catalog checks for RAs
(+ este relatório: docs(df): add administrative-region rollout report)
```

## 11. Rollout

Sem migração e sem mudança no snapshot: o Volume atual já serve (o `localityId` é derivado na leitura). Ordem sugerida: revisar → merge → deploy → conferir `/centro-oeste/df` e uma RA (Centro-Oeste só é público se estiver lançado no CMS; o sandbox local o lançou só para testar) → conferir `/sitemap.xml` (+136 URLs quando o Centro-Oeste estiver lançado) → opcional: próximo `catalog:sync` passa a gravar `localityId`. Conferir `npm run audit:df` após cada snapshot novo (falha visível: títulos DF fora do índice aparecem como "NOT in the official RA index").

## 12. Rollback

Reverter os commits (ou não fazer o deploy). Um snapshot que já tenha `localityId` continua legível pelo código antigo (campo extra opcional é ignorado); nenhum dado foi reescrito. Efeito de reverter: DF volta a "1 cidade", RAs voltam a 404 e a ficar invisíveis no CMS.

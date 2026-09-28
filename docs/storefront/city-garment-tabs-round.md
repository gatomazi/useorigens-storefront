# Seletor de peças na página da cidade — relatório da rodada

Branch `feature/city-garment-tabs` (worktree `.claude/worktrees/city-garment-tabs`, branched off `origin/main`
— já inclui o merge de `feature/hotpages-customizacao`). Commits **somente locais**, nada de push/PR/merge/deploy.
Spec: `CLAUDE_RODADA_SELETOR_PECAS_NA_PAGINA_DA_CIDADE.md`.

## 1. Auditoria do catálogo (spec §2)

### 1.1 O que o snapshot atual contém — e o que não contém

O snapshot local (`data/generated/catalog-snapshot.json`) é construído por `fetchStoreProducts()`
(`src/lib/ink/client.ts`) chamando `GET /v1/stores/products?visible_in_store=true&per_page=100`, e
`normalizeInkProduct()` (`src/lib/ink/normalize.ts`) rejeita qualquer produto com
`status !== "published" || visible_in_store !== true`. **Nenhum produto oculto chegava a ser buscado antes
desta rodada.** Uma varredura de todos os 9.531 bindings + 244 merch + 59 excluded (Sul) por palavras-chave de
peça (oversized, peruano, cropped, moletom, infantil, body, regata) não encontrou **nenhuma** ocorrência — a
única variação hoje é `designVariant` (base/regional/personalizado/localidade), um eixo de *desenho*, não de
*peça física*.

### 1.2 O relacionamento real (spec §2.1–§2.2)

Uma chamada mínima e direcionada à INK (leitura, `GET /v1/stores/products/{id}`, uma por vez, 1,5 s de
espaçamento — o mesmo ritmo do client existente) revelou o campo real que faltava:
`product_type: { id, name }`, presente em todo produto mas nunca capturado por `normalizeInkProduct`. Cada
desenho de cidade é criado na INK como um **lote de produtos, todos com o mesmo `product_cluster_id` e o mesmo
`name`**, diferindo apenas em `product_type`:

| `product_type.id` | Nome na INK | Rótulo no seletor |
|---|---|---|
| 1 | Camiseta | Camiseta clássica (canônica) |
| 72 | Camiseta Algodão Peruano | Algodão Peruano |
| 178 | Camiseta Oversized | Oversized |
| 8 | Regata | Regata |
| 23 | Cropped | Cropped |
| 28 | Cropped Moletom | Cropped Moletom |
| 119 | Hoodie Moletom | Moletom Capuz |
| 120 | Suéter Moletom | Moletom Suéter |
| 2 | Camiseta Infantil | Infantil |
| 165 | Body Infantil | Body Infantil |

Confirmado ao vivo, com os mesmos ids/nomes, nas três lojas (Sul, Norte, Centro-Oeste) — a tabela é global,
central em `src/lib/catalog/garments.ts`. Nenhum tipo além destes foi observado; o exemplo "baby look" citado
na spec nunca apareceu nos dados reais e não foi adicionado ao mapa (nunca inventar).

Exemplo real (Tijucas/SC, família Traço, cluster `441506`): o produto canônico (`id 4381465`, `Camiseta`,
`status: published`, `visible_in_store: true`) tem 8 irmãos no mesmo cluster, todos `status: not_published`,
`visible_in_store: false`, `approval_status: waiting` — **exatamente o padrão que a spec descreve como
"oculto da busca, mas vendável por link direto"**. Isso foi **verificado de fato**, não presumido: um `curl`
público (sem tocar a API admin da INK) em
`https://www.usesul.com.br/usesul/product/tijucas-traco-sc-20a63a8d-8f58-4af9-be66-260b735abf53` (a peça
"Algodão Peruano") devolveu HTTP 200 com o botão "Adicionar" funcional. **Conclusão prática: `status`,
`visible_in_store` e `approval_status` nunca podem ser usados como sinônimo de "vendável"** — nem o oposto
("não vendável"). A única coisa que decide vendabilidade no código novo é: imagem https válida, preço
numérico e host de compra permitido (mesma regra que `commerce.ts` já aplica ao produto canônico).

Vínculo implementado (`buildGarmentBindings`, `src/lib/catalog/garments-link.ts`): agrupa exclusivamente por
`(commerceStoreKey, product_cluster_id)` contra os bindings canônicos já confiáveis — **nunca por texto de
cidade/família aproximado**, e nunca por proximidade de id (confirmado ao vivo: o lote de Água Boa/MT **não**
tem ids contíguos, ao contrário do de Tijucas — usar adjacência de id como algoritmo de produção teria sido
incorreto). Um binding canônico sem `product_cluster_id` (ADR 0001: ~1.400 produtos visíveis no Sul, ~500 no
Norte, ~110 no Centro-Oeste não têm um) simplesmente não gera peças — **fail closed**, nunca um palpite.

### 1.3 O sync não basta — correção aplicada, mas com escopo deliberadamente limitado nesta rodada

`GET /v1/stores/products` sem o filtro `visible_in_store` devolveu **106.358 produtos no total** (Sul) contra
9.835 visíveis — ou seja, a varredura completa do "pool oculto" seria **~1.064 páginas por loja só no Sul**
(~966 sem o canônico), a ~1,5 s por página ≈ **26 minutos**, e algo entre 10–15 minutos em cada uma das outras
duas lojas (rodando em paralelo entre lojas, como o sync já faz hoje). Isso é **~1000+ requisições novas por
loja contra uma API de terceiro** — um custo de tempo/carga real que não está autorizado a rodar sem
combinar antes com o dono do produto, mesmo sendo leitura pura e dentro do limite de 100 req/min/loja.

**Decisão desta rodada:** não rodar essa varredura completa. Em vez disso, `normalize.ts` ganhou um segundo
normalizador (`normalizeGarmentSourceProduct`) que aceita produtos ocultos/não publicados (sem o filtro de
`status`/`visible_in_store` que `normalizeInkProduct` mantém intacto para o sync principal), e
`scripts/fetch-garment-fixtures.mts` popula o campo novo do snapshot (`garmentBindings`) com **3 cidades reais
verificadas ao vivo, uma por região** — não é dado sintético, é o produto real da INK, com preço, imagem e URL
exatos:

| Região | Cidade | Família | Peças reais confirmadas |
|---|---|---|---|
| Sul | Tijucas/SC | Traço | 8 de 9 (sem Oversized — não existe no lote real desta cidade) |
| Norte | Xambioá/TO | Traço | 9 de 9 |
| Centro-Oeste | Água Boa/MT | Traço | 9 de 9 |

Ao todo, **29 requisições GET reais** feitas nesta rodada (bem abaixo do limite de 100/min/loja), todas
somente leitura. `productClusterId` também passou a ser persistido nos bindings canônicos dessas 3 cidades
(campo novo, opcional, aditivo — `CityDesignBinding.productClusterId`).

**O que isso significa na prática:** fora essas 3 cidades, **nenhuma outra cidade do catálogo tem abas de
peça nesta rodada** — a seleção some inteiramente nelas (comportamento correto: "avaliar esconder o seletor
de uma opção"), porque não há dado local para julgar. Isso é a limitação central deste round (ver §5).

## 2. O que mudou

- **`src/lib/catalog/types.ts`** — `CityDesignBinding.productClusterId?` (aditivo); novo tipo `GarmentBinding`;
  `StoreIndex.garmentBindings?` (aditivo, separado de `bindings`/`merch`/`excluded`).
- **`src/lib/catalog/indexer.ts`** — passa `product.clusterId` para o binding quando presente (1 linha, aditivo).
- **`src/lib/ink/normalize.ts`** — `normalizeGarmentSourceProduct` novo, ao lado do `normalizeInkProduct`
  existente (intocado).
- **`src/lib/catalog/garments.ts`** — mapa central `product_type.id → {slug, label, sortOrder}`, client-safe
  (sem `server-only`, para o componente de abas poder importar a constante `CLASSIC_GARMENT_TYPE_ID`).
- **`src/lib/catalog/garments-link.ts`** — `buildGarmentBindings`, a lógica de vínculo por cluster,
  `server-only` (host allowlist de `ink/config.ts`).
- **`src/lib/catalog/repository.ts`** — `Catalog.garmentTabsForCity(cityId)`: separa claramente (spec §2 —
  três índices) o índice de busca de cidades (intocado), o catálogo interno de peças (`garmentBindings`, nunca
  lido pela busca) e o índice resolvido cidade+família+peça → produto exato, que a página consome.
- **`src/app/[region]/[uf]/[city]/page.tsx`** — abas diretamente abaixo de "Estilos", acima da grade; some
  por completo quando só existe a peça clássica; pré-renderiza cada painel no servidor (ver decisão RSC
  abaixo) e passa como nó React já pronto para o componente cliente.
- **`src/components/catalog/CityGarmentTabs.tsx`** (novo, client) — `role="tablist"/"tab"/"tabpanel"`,
  seleção por `?peca=<slug>` (compartilhável, sem criar página indexável nova — o canônico da cidade não
  muda), setas do teclado movem foco+seleção, trilho rolável no mobile sem overflow da página, todos os
  painéis ficam montados (nunca remonta imagem ao trocar de aba) e só o ativo perde o atributo `hidden`.
- **`src/components/catalog/FamilyCard.tsx` / `FamilyGrid.tsx`** — prop `pieceLabel?` nova e opcional, só
  usada pelas abas de peça; toda chamada existente (home, PDP "Outros estilos") continua sem esse prop e sai
  **byte-a-byte igual** a antes.
- **`src/lib/analytics/track.ts`** — `GoToInkParams.garmentType?` novo e opcional, incluído no payload Meta
  (`garment_type`) e GA4 (`garment_type`) só quando presente; nada muda para quem não passa esse campo.

### Decisão de arquitetura: por que o painel é pré-renderizado no servidor

Primeira tentativa: o componente cliente de abas importava `FamilyGrid` diretamente. Isso quebrou o build —
`FamilyCard` → `commerce.ts` → `ink/config.ts` → `config/env.ts`, e este último tem `import "server-only"`.
Importar esse grafo de um Client Component tenta empacotá-lo para o browser, e o build falha
("'server-only' cannot be imported from a Client Component module"). Corrigido movendo a renderização de cada
painel (com `FamilyGrid`/`FamilyCard`, 100% inalterados) para a página (Server Component), que passa o
resultado já pronto como `ReactNode` para o componente cliente — o padrão suportado do App Router para esse
caso, e a razão de existirem dois arquivos (`garments.ts` cliente-seguro vs. `garments-link.ts`
`server-only`).

## 3. Casos de aceitação (spec §5)

- **Caso A** (Tijucas/SC, Traço) — coberto por e2e real, não fixture isolada: aba Camiseta mostra a grade
  atual; Peruano mostra só Traço com imagem/preço/URL reais (R$ 139,90); demais famílias somem nessa aba (não
  têm peça).
- **Caso B** (peça oculta na busca INK) — coberto pela verificação ao vivo do §1.2 (produto `not_published`
  aparecendo corretamente na aba certa do storefront, sem mudar nada na INK nem duplicar no índice de
  cidades).
- **Caso C** (variante inexistente) — coberto por teste unitário (`garments.test.ts`, "given a family that
  genuinely has no piece...") e pelo próprio dado real: Tijucas não tem Oversized, e o teste confirma que a
  aba "Oversized" simplesmente não aparece (nunca um card falso).
- **Caso D** (navegação curta) — coberto pelo e2e: home → cidade → aba → card → href exato da INK, sem modal,
  sem PDP intermediária.
- **Caso E** (regressão) — coberto pela suíte inteira (ver §4): hotpages, personalização, carrinho, tracking,
  navbar e PDP existente não foram tocados; `FamilyCard`/`FamilyGrid` sem `pieceLabel` renderizam
  identicamente a antes (prop opcional).

## 4. Testes

- `tsc --noEmit`, `eslint .`, `next build` — todos verdes.
- **722 testes unitários** (suíte inteira) — verdes, incluindo os pré-existentes (zero regressão).
- **15 testes novos** em `tests/unit/garments.test.ts`: mapa central, vínculo por cluster (match, cluster
  ausente no canônico, cluster ausente no candidato, tipo desconhecido, tipo clássico redundante, preço
  nulo, host não permitido, isolamento entre lojas com cluster numérico coincidente, família sem aquela peça),
  e 3 testes de integração contra o snapshot real (`Catalog#garmentTabsForCity`) para Tijucas/SC, Torres/RS
  (cidade real sem dado de peça — abas ausentes) e Xambioá/TO.
- **6 testes e2e novos** (`tests/e2e/city-garment-tabs.spec.ts`, Playwright): aba clássica selecionada por
  padrão + famílias intactas; clique em Peruano troca o card certo (href/preço reais, sem card falso em outra
  família); `?peca=` restaura a escolha num load novo; cidade sem dado de peça não mostra a barra; mobile
  375px sem overflow horizontal + aba real clicável + aba inexistente (Oversized) ausente; navegação por
  teclado (setas) move foco e seleção juntos.
- **41 testes e2e pré-existentes** (`tests/e2e/sul.spec.ts`) — todos verdes, confirmando ausência de regressão
  na página da cidade e na PDP.
- Capturas reais (Playwright, não a extensão do Chrome — mais confiável para viewport exato) em
  `docs/screenshots/city-garment-tabs/`: `mobile-classic.png`, `mobile-peruano.png`, `desktop-classic.png`,
  `desktop-peruano.png`, todas de Tijucas/SC.

## 5. O que continua limitado

1. **Cobertura de dados**: só 3 cidades (uma por região) têm abas de peça agora. Toda cidade fora dessas três
   mostra apenas a grade atual, sem seletor — comportamento correto e seguro (fail closed), mas não é ainda o
   catálogo completo.
2. **Sync completo não fizemos**: populá-lo exige uma varredura de ~1.000+ páginas por loja contra a API da
   INK (ver §1.3) — decisão que precisa de combinado explícito com o dono do produto antes de rodar, por ser
   um custo de tempo/carga real contra um sistema de terceiro, mesmo sendo leitura pura.
3. **`garmentBindings` não é persistido no git**: vive em `data/generated/catalog-snapshot.json`, que é
   `.gitignore`d (igual ao resto do snapshot) — rodar `npm run tsx scripts/fetch-garment-fixtures.mts` de novo
   é necessário para reproduzir localmente os dados das 3 cidades.
4. Casos B/C foram validados com o dado real disponível (uma cidade cada), não com uma amostra grande — a
   spec pede proporcionalidade, não uma rodada de pesquisa infinita.

## 6. Commits (locais, branch `feature/city-garment-tabs`)

- `8a1fead` — feat(catalog): add garment-type index and city page tabs
- `3c8d376` — fix(catalog): split garment linking from client-safe constants

## 7. Roteiro curto de publicação futura

1. Combinar com o dono do produto a varredura completa do pool oculto (uma vez, ~26 min Sul / ~10–15 min
   Norte e Centro-Oeste, em paralelo entre lojas) — ou uma versão incremental/paginada que rode em background
   via `npm run catalog:sync` estendido, sem bloquear o build.
2. Persistir `garmentBindings` no snapshot completo (mesmo mecanismo já existe — `buildGarmentBindings` já é
   genérico, só falta alimentá-lo com o catálogo inteiro em vez de 3 fixtures).
3. Remover a limitação do §5.1: nesse ponto toda cidade com lote de peças na INK ganha as abas automaticamente
   — nenhuma mudança de componente necessária (o código já lê `garmentBindings` do snapshot dinamicamente).
4. Revisar volume de tracking (`garment_type` no `GoToInk`) depois de uma semana de dado real, antes de
   qualquer decisão de negócio sobre quais peças promover.

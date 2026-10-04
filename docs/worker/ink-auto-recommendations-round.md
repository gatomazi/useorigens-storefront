# Rodada: recomendador automático na PDP da INK

Data: 2026-10-04. Estado: **implementado e validado localmente; nada publicado.** Sem push, merge, PR, deploy, alteração na INK, no Worker de produção ou em infraestrutura. Parado para revisão.

| Repositório | Worktree local | Branch | Commits |
|---|---|---|---|
| storefront (`gatomazi/useorigens-storefront`) | `/Users/izamoti/projects/useorigens-recommendations` (rebaseada sobre `main` `11ede6c`, depois da busca global e do Pódio) | `feature/ink-auto-recommendations` | `08c893c` catálogo (`product_type` no merch; o `productClusterId` já tinha entrado com a busca global) · `7c76608` índice + rota · commits de docs (relatório, amostra, capturas) |
| Worker (`gatomazi/worker-lojas`) | `/Users/izamoti/projects/use-origens-workers-recommendations` (a partir de `origin/main` `0acb74e`) | `feature/ink-auto-recommendations` | `f6f34b6` gateway + loader 4.9 · `3767574` QA em navegador real + doc · `149093e` desktop: bloco abaixo da imagem |

Worktrees separados de propósito: o diretório `useorigens` principal está em uso por outra sessão (`feature/storefront-global-search`, com alterações não commitadas, que ficaram intactas). Nenhuma branch citada no MD (`city-garment-tabs`, `navigation-theme`, `df-administrative-regions`, CMS/hotpages) foi tocada.

---

## 1. Arquitetura

```text
INK (API, só GET)                                    storefront (Railway, Volume)                      Worker da loja (Cloudflare)              PDP da INK (navegador)
──────────────────                                   ─────────────────────────────                     ───────────────────────────              ──────────────────────
catalog:sync ───────────► catalog-snapshot.json ─┐
collections:sync ───────► collections-snapshot.json ├─► npm run recommendations:build ─► recommendations-index.json
garments:sync (opcional)► garment-index.json ─────┤     (determinístico, valida, promove        │
CMS publicado ──────────► site-config/published.json┘      atomicamente, guarda .prev)           │
                                                                                                 ▼
                                                    GET /api/recommendations/<região>/<id>  ◄── GET /__origens/recommendations/<id> ◄── loader 4.9 (auto-recommendations)
                                                    (lookup O(1), lista vazia sem índice)       (timeout 1,5 s, valida item a item,      1 pedido por página, ≥ 2 itens,
                                                                                                 fail closed, cache 5 min)               bloco após o "Compre Junto"
```

- **Nada consulta a INK na renderização.** A INK só é lida pelos syncs que já existiam (GET, 40 req/min). O build lê apenas arquivos locais.
- **Nenhum cadastro manual.** Não há UI, pin, ordenação nem tag no CMS. O CMS publicado só contribui com um sinal automático: as coleções que ele já põe em destaque (seção 3).
- Código novo:
  - storefront: `src/lib/recommendations/{signals,documents,rank,build,cms,index-file,audit}.ts`, `scripts/build-recommendations.mts` (`npm run recommendations:build`), `src/app/api/recommendations/[region]/[productId]/route.ts`. O sync passou a guardar `product_cluster_id` e `product_type` também nos produtos editoriais (`indexer.ts`, `normalize.ts`, `types.ts`; os dois campos são opcionais, então os snapshots antigos continuam válidos).
  - Worker: `src/recommendations-gateway.js`, `src/loader/recommendations.js`, a flag `auto-recommendations` (`features.js`), a rota em `worker.js`, `LOADER_VERSION` 4.9 e `scripts/qa-recommendations.mjs`.

## 2. Documento canônico (uma estampa = um documento)

`RecommendationDocument` (`documents.ts`) é **por estampa, não por peça**: `key`, `kind` (`city` | `editorial`), `store`, `region`, `representative {id,title,image,price,slug,href}`, `memberIds`, `clusterIds`, `locality {key,name,uf,type}`, `family`, `primary`, `uf`, `meso`, `collections`, `mainCollection`, `line`, `stateIdentity`, `equivalence`, `tokens`, `themes`, `sales`, `eligible`, `editorialSignals`.

- **`product_cluster_id` serve só para deduplicar.** Peças com o mesmo cluster (e produtos visíveis com nome idêntico) viram um único documento, e toda peça aponta para a lista da estampa (`alias` no índice). Nunca soma afinidade. Caso real: "Paranaense | Bicho do Paraná" tem **10 produtos visíveis** (camiseta, oversized, peruano, regata, cropped, moletons, infantil, body) num só cluster. Eles aparecem uma vez, representados pela camiseta clássica, e a PDP da Oversized recebe a lista da estampa.
- **Representante** (MD §7): link/imagem/preço válidos → camiseta clássica (`product_type` 1) → Algodão Peruano (72) → Oversized (178) → outras → mais vendida → id mais antigo. Se não houver representante seguro, o produto não é recomendado (fail closed).
- **Elegível para ser recomendado:** produto de cidade principal (o primário do par lugar+família; variantes e sublocalidades só recebem lista) ou produto editorial com pelo menos uma coleção editorial. **Nunca** os membros de `personalizados` e `parceiros`: uma camisa feita para "Laura" ou para "Amigas lá de Caibaté" não serve de sugestão para outra pessoa. Qualquer produto pode **receber** recomendações.

## 3. Sinais (em ordem de confiança)

| Sinal | Origem | Observação |
|---|---|---|
| Coleção editorial INK | `collections-snapshot.json` (membros completos `searchMemberIds`) | Coleção puxada por produtos editoriais (merch ≥ 2 e ≥ cidades). As coleções por estado (`pr`, `parana`, `mato-grosso`…) contam como **geografia**. `novidades`, `kits`, `cidades-mais-pedidas`, `personalizados`, `parceiros` e `mascotes-club` não contam. A **coleção principal** é a mais específica (a menor). |
| Geografia | `data/geo` (IBGE) + nome | Cidade/localidade (RA do DF conta como lugar próprio; sublocalidade → o município), UF e **mesorregião** (a "região" editorial do storefront, ADR 0004). No editorial, a UF vem do nome: município num segmento inteiro, nome do estado, sigla, DDD, gentílico de um único estado, `DIZERES_CONTEXT` já existente; senão, da coleção do estado. Dois estados → desconhecido (nunca chuta). |
| Família / linha | nome | Cidade: as 8 famílias. Editorial: "linha" = o segmento depois do título (`Dizeres`, `Lenda`, `Treino`, `Meu Pai`, DDD, `Made in`…). Variação de cor não vira linha nova (`Treino P&B` = `Treino`). `stateIdentity` marca a estampa do próprio estado (`Paraná | Clean`, `Made in Goiás`, `Paranaense | Essência`). |
| Tokens / temas | nome normalizado (caixa, acento, hífen, pontuação) | Só complemento. Léxico fechado de 16 temas (mate, churrasco, pai, família, litoral, serra, campo, cerveja, esporte, futebol, pinhão, bergamota, gauchesco, manezinho, pantanal, cerrado). Sem NLP e sem embeddings. |
| CMS publicado | `published.json` (só publicado; páginas arquivadas ignoradas) | Coleções em grupos da navbar, seções da home e de hotpages/landings vivas: **+15** quando a coleção compartilhada está em destaque. Localmente o CMS é o *seed* (0 coleções em destaque). Em produção o build lê o `published.json` do Volume. |

## 4. Score (determinístico, explicável, sem IA)

| Peso | Sinal |
|---|---|
| +120 | mesma coleção principal |
| +90 | mesma linha editorial |
| +80 | mesma UF |
| +60 | mesma mesorregião |
| +50 | outra coleção editorial em comum |
| +50 | mesmo tema |
| **+60** | família complementar: a linha de identidade do estado numa página de cidade do mesmo estado (*o MD sugeria +40; subi depois da auditoria para "Santa Catarina · Clean" vencer um editorial só vizinho*) |
| +30 | tokens em comum |
| +20 | mesma localidade (só posições complementares) |
| +15 | coleção em destaque no CMS publicado |
| até +10 | popularidade (`log2(1+vendas)·2`), só desempate |
| −150 | quase-duplicata (`equivalence`: mesmo título-base, ou a mesma linha do mesmo estado: "MS \| Minimal" × "Mato Grosso do Sul \| Minimal") |
| exclusão | produto atual (−1000) e mesma estampa/cluster (−500) nunca entram |

- **Limiar 80:** abaixo disso não entra, mesmo que sobrem posições (a mesma UF sozinha chega lá; tokens sozinhos não).
- O **`reason`** mostrado é o sinal **mais específico** presente (coleção > linha > região > tema > coleção compartilhada > UF > tokens), não o que vale mais pontos. O CSV traz a decomposição completa (`parts`).
- Empates: score → vendas → id. A mesma entrada gera um arquivo idêntico byte a byte (testado com a ordem das entradas embaralhada).

### Produto de cidade (MD §10)
1. **Feito em** do mesmo lugar; 2. **Coordenadas** do mesmo lugar; sem elas, as próximas famílias do lugar (Ponto de Origem, Legado, …). Nunca a própria família: outra variante dela é a mesma ideia.
3–4. Contexto editorial/geográfico pelo score: identidade do estado, DDD/produto da mesorregião, editorial do estado.
- **No máximo 2 itens do mesmo lugar**, contando também os editoriais sobre o lugar ("Dazumbanho | Florianópolis").
- Último recurso, nunca acionado no catálogo atual: um best-seller da mesma família numa cidade da mesma mesorregião.

### Produto editorial (MD §11)
Pelo score (coleção → linha → UF → região → tema/tokens). Um editorial sobre um lugar ("Tijucas | São Sebastião") também pode sugerir o Feito em/Coordenadas desse lugar.

## 5. Diversity pass (MD §12)

- **Regras rígidas:** 1 por estampa/cluster; nada equivalente (`equivalence`); ≤ 2 do mesmo lugar; ≤ 3 da mesma coleção principal; ≤ 3 da mesma linha; **1 linha de identidade por estado** ("Made in SC" e "SC · Clean" são a mesma ideia).
- **Regras flexíveis:** ≤ 2 da mesma coleção principal e ≤ 2 da mesma linha enquanto houver alternativa relevante (score ≥ 80).
- **Mistura:** se a lista inteira tiver uma só razão e existir alternativa com ≥ 60% do score, a pior troca de lugar com ela.
- Menos de 4 bons → mostra 3 ou 2. Com menos de 2 o bloco não aparece (o Worker nem devolve a lista). Ex.: "Bretzel e Chopp | Treino" mostra 3, não 4 Treinos.

## 6. Índice, tamanho e desempenho (catálogo real de 2026-10-04)

Formato (`build.ts`): `{version:1, generatedAt, reasons[], stores:{<loja>:{syncedAt, items:[[id,título,imagem sem prefixo,preço,slug]], recs:{<id>:[[item,reason,score]…]}, alias:{<peça>:<id>}}}}`. Guarda só as listas finais (até 4 por produto), sem nenhum documento intermediário. Cada card aparece uma vez em `items`, e o href é refeito a partir da base da loja.

| | Sul | Norte | Centro-Oeste |
|---|---|---|---|
| produtos no snapshot (cidade + editorial) | 9.531 + 312 | 3.585 + 60 | 3.829 + 81 |
| documentos (estampas) / elegíveis | 9.779 / 9.672 | 3.644 / 3.640 | 3.906 / 3.887 |
| produtos com lista | 9.841 de 9.843 | 3.645 de 3.645 | 3.909 de 3.910 |
| listas com 4 / 3 / 1 / 0 itens | 9.676 / 100 / 1 / 2 | 3.644 / 0 / 0 / 0 | 3.905 / 0 / 0 / 1 |
| cards distintos | 3.737 | 1.389 | 1.558 |

- **Arquivo:** 2,01 MB (420 KB em gzip). Sul 1,13 MB, Norte 0,42 MB, Centro 0,45 MB.
- **Build:** 1,8 s para as três lojas (+ 44 ms de leitura). **Lookup:** 1,1 µs em média (57.745 consultas). **Memória** do índice já parseado: ~8,8 MB no processo do storefront, com cache por mtime (um `stat` por pedido).
- **Rota local:** ~5 ms, payload de ~1,3 KB. **Worker:** não guarda índice; cada pedido traz ≤ 16 KB (teto), com `cf.cacheTtl` de 300 s por produto e `Cache-Control: public, max-age=300` para o navegador. **Loader:** +12,1 KB (+3,4 KB gzip) só com a flag ligada. O loader é imutável por hash, então essa conta é paga uma vez por configuração.
- Razões nas 36.700 posições geradas: `same-uf` 25.351, `same-locality:coordinates` 14.654, `same-locality:feito-em` 14.606, `same-region` 8.919, `same-locality:family` 4.652, `same-collection` 842, `same-theme` 164, `same-line` 13.

Escrita (MD §14): candidato temporário no mesmo diretório → validação (`validateRecommendationsText`: versão, lojas conhecidas, listas ≤ 4 apontando para itens válidos e nunca para o próprio produto, aliases sem órfãos, mínimo de listas por loja) → cópia do vigente para `.prev` → `rename` atômico. Se a validação falha, o arquivo vigente fica intacto e o comando sai com 1.

## 7. Worker e loader

- **Rota** `GET|HEAD /__origens/recommendations/<id>`, só com `ENABLE_WIDGET=true` **e** a feature `auto-recommendations`. Sem isso, quem responde é a INK (404 dela).
  - A URL de origem é fixa (`<storefront>/api/recommendations/<região da loja>/<id>`). O visitante só escolhe um id numérico. Nenhum cookie nem `Authorization` é repassado.
  - Timeout de 1,5 s e teto de 16 KB.
  - Validação de cada item (MD §17): `https:`, host **desta** loja, caminho canônico de produto da loja, sem credenciais, sem porta, sem query/fragmento; imagem `https:` no host de imagens da INK; preço finito entre 0 e 2000; id numérico ≠ produto atual; título sem markup/controle; payload da região e do produto pedidos; sem duplicatas; no máximo 4.
  - Qualquer falha → `200 {items:[]}` com cache de 60 s e cabeçalho `x-origens-reco` (`ok` | `empty` | `no-index` | `unavailable`).
- **Loader** (`src/loader/recommendations.js`):
  - **Produto atual:** o `form#form-product-<id>` **nativo**. Na PDP real há um segundo `form-product-<id>` dentro do modal do "Compre Junto" (auditado na página de Florianópolis); ele e quick-add/carrinho ficam excluídos. Se houver ambiguidade, nada é desenhado.
  - **Pedido:** um por página (`credentials: 'omit'`, timeout de 3 s), com cache em memória por produto para o vaivém do Turbo. A lista é revalidada no cliente.
  - **Renderização:** só com ≥ 2 itens, usando apenas `textContent`/atributos.
  - **Posição (DOM auditado):**
    - **Desktop** (PDP em duas colunas, medido pela geometria real e não pela largura da janela): **logo abaixo da imagem do produto**, no vão da coluna da galeria. Em 1280 a galeria termina em ~738 px e a coluna de compra em ~1760 px, então sobram ~1000 px em branco. O bloco fica dentro de `section.section-product-v2` com `position:absolute; top:100%`, para **não mudar a altura da seção**: a INK posiciona o selo "Clique para dar zoom" pela base dela, e na 1ª versão o selo descia para cima dos cards. Só entra ali se couber no vão (altura do bloco + 32 px ≤ espaço livre); senão, usa a posição em fluxo. Um `ResizeObserver` nas duas colunas e o `resize` da janela reavaliam a posição, e o mesmo nó é movido, sem novo pedido.
    - **Empilhado** (mobile/tablet): logo **depois do `section.buy-together` nativo**, quando existe; senão depois do nosso "Continue explorando"; senão depois do formulário. Sempre fora do `<form>` e do turbo-frame, e antes da Descrição.
  - **Card:** imagem com proporção fixa (sem layout shift), título com até 2 linhas, preço em BRL e "Ver produto". O card inteiro é o link, com alvo ≥ 44 px. Não tem botão de carrinho. O clique abre a PDP real na mesma aba.
  - **Layout:** no mobile, carrossel com `scroll-snap` e ~1,3 card visível (1,31 a 1,33 medidos em 320 e 390). No desktop (≥ 768 px), grid de 4.
  - **Intocados:** formulário, variantes, CTA, sticky mobile, POST, CSRF e checkout. O "Compre Junto" nativo **continua visível**.
- **Tracking:** evento GA4 próprio `origens_recommendation_click` (`source_product_id`, `recommended_product_id`, `position`, `reason`, `region`). Usa só o `gtag` que a INK já carrega e só dispara depois do aceite do aviso de cookies da INK (mesma regra de `tracking.js`). Nada de AddToCart, ViewContent ou Purchase, e a navegação nunca é bloqueada. `uf`/`locality` ficaram de fora: o card não os carrega, e incluí-los pediria ampliar o contrato (fica para a fase de medição).
- **Observabilidade:**
  - Worker: logs `use-origens.reco-dropped` (contagem por motivo: `href`, `image`, `price`, `self`, `duplicate`…), `reco-empty` (com `index: missing|ok`) e `reco-unavailable` (motivo curto), sem dado pessoal.
  - Storefront: `recommendations.index-unusable`.
  - Build: estatísticas, distribuição e descartes (`invalid-image`/`invalid-price`/`invalid-url`/`unknown-place`).
  - Debug no cliente: `localStorage.origens_debug = '1'` registra no console o status e os `reason`s.

## 8. Exemplos reais (o que a página mostrou no E2E, 1280 e 390)

| PDP | Você também pode gostar |
|---|---|
| Florianópolis · Origem | Florianópolis · Feito em · Florianópolis · Coordenadas · Grande Florianópolis · 048 `same-region` · Made in Santa Catarina `same-uf` |
| Tijucas · Coordenadas | Tijucas · Feito em · Tijucas · Ponto de Origem · Made in Santa Catarina · Grande Florianópolis · 048 |
| Bagé · Traço | Bagé · Feito em · Bagé · Coordenadas · Made in Rio Grande do Sul · Pai Gaúcho Pescador Churrasqueiro · Lenda |
| Bah \| Dizeres (Fala Daqui) | Tchê · Dizeres · Bah meu · Dizeres · Gaúcho · Essência `same-theme` · Pai Gaúcho Pescador Churrasqueiro · Lenda `same-theme` |
| Serra Catarinense (Do Nosso Jeito) | Verão Catarinense · Vida no Sul — Serra Edition · Região Serrana · 049 `same-theme` · Vai da Onda · Litoral Catarinense |
| Pai Paranaense Churrasqueiro (Lenda) | Pai Paranaense Trilheiro · Lenda · Mãe Paranaense Corredora · Lenda · Paranaense · Essência · Noroeste Paranaense · 044 |
| Paranaense \| Bicho do Paraná (**peça Oversized**) | Paranaense · Essência · Frio e Cinza · Curitiba · Noroeste Paranaense · 044 · Oeste Paranaense · 045 (nenhuma das outras 9 peças da estampa) |
| Goiânia · Origem (Centro-Oeste) | Goiânia · Feito em · Goiânia · Coordenadas · Made in Goiás · Sul Goiano · 064 |
| Amigas lá de Caibaté (encomenda pessoal) | *(sem bloco: nenhum contexto)* |

**Amostra de qualidade** (MD §28), gerada automaticamente e sem IA:
- [`ink-auto-recommendations-sample.md`](ink-auto-recommendations-sample.md) e [`.csv`](ink-auto-recommendations-sample.csv), com **32 produtos de cidade e 46 editoriais**: Sul 12+24, Norte 10+10, Centro-Oeste 10+12.
- A seleção é determinística: casos nomeados, mais vendidos por lugar, uma variante, uma sublocalidade e rodízio por coleção editorial.
- O Markdown traz produto atual, sinais, recomendações, score e reason. O CSV acrescenta a decomposição do score (300 linhas).
- Para regerar: `npm run recommendations:build -- --dry-run --audit docs/worker`.

## 9. Capturas (`docs/screenshots/ink-auto-recommendations/`)

| Arquivo | O que mostra |
|---|---|
| `pdp-city-mobile.png` / `pdp-city-desktop.png` | Florianópolis · Origem: carrossel (390) e grid de 4 logo abaixo da imagem, no vão da coluna da galeria (1280) |
| `pdp-editorial-mobile.png` / `pdp-editorial-desktop.png` | Bah \| Dizeres (no mobile não há "Compre Junto" nativo, então o bloco vem depois do "Continue explorando"; no desktop, abaixo da imagem) |
| `pdp-native-bundle-plus-recommendations.png` (+ `-mobile`) | desktop: a grade inteira, com o nosso bloco sob a imagem e o "Compre Junto" nativo (Florianópolis \| Coordenadas) mantido na coluna de compra; mobile: o nativo e, logo abaixo, o nosso bloco |

As capturas são da INK real passando pelo Worker local. Só nessas capturas o aviso de cookies foi aceito numa sessão anônima descartável.

## 10. Testes

| Suíte | Resultado |
|---|---|
| storefront `npm test` (Vitest) | **1237/1237** (91 arquivos, já sobre a `main` com busca global e Pódio). Novos: `tests/unit/recommendations.test.ts` (19) cobrem os 14 casos do MD §25 e mais sinais, variante, peça oculta via garment index, CMS só publicado, promoção com `.prev` e validação que recusa lista apontando para o próprio produto |
| storefront `tsc --noEmit`, ESLint nos arquivos novos | limpos |
| Worker `npm test` | **463/463** (baseline 438). Novos: `recommendations.unit` (10: segurança de link/imagem/preço/loja, payload, timeout, cabeçalhos), `recommendations.workerd` (4: Miniflare real, flag on/off, health 4.9, lista de features inválida), `recommendations.dom` (11: posição após o "Compre Junto" no empilhado e sob a imagem no desktop, troca ao redimensionar sem novo pedido, recuo para o fluxo quando não cabe no vão, produto atual ≠ form do modal, form/CSRF intactos, falhas sem DOM, flag off, clique + GA4 com consentimento, Turbo, `textContent`) |
| **E2E em navegador real** `scripts/qa-recommendations.mjs` | **253/253**. No desktop, cada PDP confere: bloco na coluna da galeria, abaixo da imagem e dentro do vão; galeria com a mesma altura, com e sem o bloco (selo de zoom no lugar); coluna de compra e CTA no mesmo lugar. INK real → Worker local (Miniflare, mesmo HTMLRewriter/loader) → rota real do storefront local lendo o índice gerado. São 9 PDPs (3 cidades Sul, 4 editoriais incluindo uma peça Oversized, 1 sem contexto, Goiânia no Centro-Oeste) × 1280/390/320. Também cobre o clique (mesma aba, a nova PDP pede e desenha a sua lista), o storefront fora (sem bloco, CTA intacto) e a flag off (nenhum pedido, nenhum DOM). Nenhum POST de carrinho/checkout; sem overflow horizontal atribuível ao bloco (em 320 a própria INK já transborda: 340 a 382 px com e sem o bloco) |

Para rodar o E2E:

```bash
# storefront, worktree
npm run recommendations:build && npx next dev -p 3107
# Worker, worktree
PW_PATH=<dir com playwright-core> RECO_STOREFRONT=http://127.0.0.1:3107 node scripts/qa-recommendations.mjs
```

Execução local desta rodada: os syncs de catálogo (2×) e de coleções (2×) rodaram contra a API real da INK, só com GET e no ritmo existente (~180 GETs por sync de catálogo). O snapshot local ficou em `data/generated/` (gitignored), sem tocar no Volume.

## 11. Limitações e pontos para a revisão

1. **Precisa de um `catalog:sync` em produção antes do primeiro build.** Sem os novos campos `productClusterId`/`garmentTypeId` no merch, as peças da mesma estampa só se juntam pelo nome idêntico (o que já cobre os casos vistos). O representante passa a ser o mais vendido, não a camiseta.
2. **O build ainda é um comando manual.** O ideal é encadeá-lo depois do `catalog:sync`/`collections:sync` agendados (Railway). Não fiz isso porque mexeria na infraestrutura.
3. **Peças ocultas de cidade** (Oversized/Peruano… com `visible_in_store: false`) só recebem lista quando o `garment-index.json` existe no diretório do build. Isso acontece no Volume, não localmente; o caminho está coberto por teste. As peças ocultas de estampas editoriais não estão no garment index (que é só de cidade). Hoje as peças editoriais visíveis já são cobertas pelo cluster.
4. **4ª posição das cidades do RS:** quando não há produto da mesorregião, ela converge para o editorial gaúcho mais vendido ("Pai Gaúcho Pescador Churrasqueiro · Lenda"). É coerente, mas repetitivo. Dá para variar com rodízio por mesorregião ou mais sinais regionais na próxima rodada.
5. **Atribuições editoriais por nome:** o léxico de temas, os gentílicos e o `DIZERES_CONTEXT` (este já marcado como "pendente de validação com a marca") são escolhas determinísticas, mas humanas. Revisar na amostra.
6. **Coleções ocultas** (`fe-de-origem`, `dia-dos-pais`) ainda contam como afinidade: os produtos seguem visíveis e à venda. Se a campanha encerrada não deve aparecer, basta incluir o slug em `WEAK_COLLECTIONS`.
7. **Custo do Worker:** +1 invocação por visualização de PDP (com cache de 5 min no navegador e de 300 s na borda por produto para o storefront). Medir com `scripts/store-metrics.mjs` no rollout.
8. **Norte:** só 14 de 60 produtos editoriais têm `product_cluster_id` na INK. Os demais deduplicam pelo nome.
9. A rota **não exige que a região esteja "lançada"** no storefront (ao contrário de `/api/navbar`): ela só devolve PDPs da INK da própria loja, e quem liga por loja é a flag do Worker.
10. O ferramental de release por loja (`scripts/lib/store-lib.mjs`) publicava **todas** as features do código. A nova flag foi marcada como opt-in (`OPT_IN_FEATURES`) para não pegar carona num release de Norte/Centro.

## 12. Rollout proposto (não executado)

1. Storefront: PR de `feature/ink-auto-recommendations` → `main` → Railway (rota + comando; sem índice a rota devolve listas vazias, então é inofensiva).
2. No Railway: `npm run catalog:sync` (para os campos novos) → `npm run collections:sync` → `npm run recommendations:build`. Conferir as estatísticas impressas e `GET /api/recommendations/sul/3789929`.
3. Worker Sul: deploy da 4.9 **com a flag desligada** (mesmo `WIDGET_FEATURES` atual). Smoke: health `4.9`, PDPs idênticas.
4. Worker Sul: mesmo deploy acrescentando `auto-recommendations` ao `WIDGET_FEATURES`. Rodar `scripts/qa-recommendations.mjs` adaptado para o modo ao vivo e acompanhar `reco-*` no `wrangler tail`.
5. Comparar com o "Compre junto" nativo (cliques de `origens_recommendation_click` × uso do nativo). Só depois decidir se o nativo deve ser escondido (seção 14).
6. Norte/Centro: mesma sequência, loja por loja, com a flag explícita.

## 13. Rollback

| Nível | Como | Efeito |
|---|---|---|
| Flag | redeploy do Worker **sem** `auto-recommendations` no `WIDGET_FEATURES` (as outras features iguais) | o loader nem contém o módulo: nenhum pedido e nenhum DOM. A rota volta a ser o 404 da INK. O índice e a PDP não mudam |
| Kill switch | `ENABLE_WIDGET=false` (já existente) | tudo nosso sai |
| Índice | `mv recommendations-index.json.prev recommendations-index.json` ou apagar o arquivo | lista anterior, ou nenhuma (bloco some sozinho) |
| Código | `wrangler rollback <versão anterior>` / revert do storefront | estado anterior |

## 14. Esconder o "Compre junto" nativo (documentado, NÃO feito)

Se a comparação favorecer o nosso bloco, dá para escondê-lo com uma regra CSS no mesmo módulo (`section.buy-together{display:none}`), atrás de uma segunda flag (ex.: `hide-native-bundle`). O modal e o seu `form` continuam no DOM (inertes) e não interferem na detecção do produto atual, que já os exclui. Nesta rodada o nativo continua **sempre** visível.

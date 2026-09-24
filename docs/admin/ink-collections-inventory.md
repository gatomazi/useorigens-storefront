# Inventário das coleções INK (somente leitura) — 2026-09-23

Rodada 3 do CMS ([`cms-v1-round3.md`](cms-v1-round3.md)). Enumeração das coleções ("categorias") das três lojas regionais, autorizada como **somente GET**, com os tokens já configurados.

## 1. Requisições usadas e método

**4 requisições adicionais, exatamente o orçamento** (mais as 3 sondagens `per_page=1` da rodada anterior). Nenhuma foi repetida, nenhuma falhou, nenhuma recebeu 429.

| # | Loja | Requisição | HTTP | Corpo | Tempo | Resultado |
|---|---|---|---|---|---|---|
| 1 | Norte | `GET /v1/stores/collections?per_page=100&page=1` | 200 | 0,58 MiB | 2,2 s | 22 de 22 (`total_pages=1`) |
| 2 | Centro-Oeste | idem | 200 | 0,73 MiB | 2,0 s | 26 de 26 (`total_pages=1`) |
| 3 | Sul | `…?per_page=100&page=1` | 200 | 3,73 MiB | 9,7 s | 100 de 176 (`total_pages=2`) |
| 4 | Sul | `…?per_page=100&page=2` | 200 | 0,27 MiB | 2,1 s | 76 restantes |

- **`per_page=100` é aceito** (a resposta o devolve em `per_page`), e o metadado `total_pages`/`total_count` foi usado, não assumido: o Sul precisou mesmo de duas páginas. **A enumeração é completa: 176 + 22 + 26 = 224 coleções**, sem duplicatas de `id` nem de `slug` em nenhuma loja.
- Total de dados: **≈ 5,3 MiB e ≈ 16 s** de rede para as três lojas. Comparado aos ~4 minutos do sync de catálogo, é desprezível; o ritmo de 1,5 s entre páginas do cliente atual seria mantido.
- **Guarda-corpos do script** (`scripts/inventory-ink-collections.mts`): exatamente 1 GET por execução, sem retry; corpo lido em *stream* e abortado acima de 80 MiB; o token só vai no cabeçalho `Authorization` e nunca é impresso. **O que foi gravado é agregado** (id, nome, slug, posição, disponibilidade, contagem reportada, contagem que casa com o snapshot); os arrays brutos de `product_ids` **não** foram persistidos nem entram no Git. Só os ids que casam com *merch* do snapshot (≤ 73 por coleção) foram mantidos, fora do repositório.
- O catálogo usado para casar é o **snapshot local de 2026-09-20/21** (`use-sul` 9.834 produtos, 244 merch). As coleções são de 2026-09-23: há ~2 dias de defasagem entre os dois. Isso pode subestimar a interseção de produtos criados depois; um sync novo do catálogo antes do de coleções elimina a diferença.
- Além da API INK, fiz **3 GETs públicos** na vitrine (não na API) para verificar o padrão de URL de coleção (§6).

## 2. Resumo por loja

| Loja | Coleções | Visíveis na loja (`is_available`) | Visíveis com produtos merch no snapshot | Visíveis com ≥ 3 merch | Sem nenhum id reportado |
|---|---:|---:|---:|---:|---:|
| Sul | **176** | **13** | 11 | 9 | 50 |
| Norte | **22** | 20 | 11 | 11 | 1 |
| Centro-Oeste | **26** | 21 | 11 | 10 | 2 |

**A contagem bruta da API engana.** Das 176 coleções do Sul, **163 não aparecem na loja** (`is_available=false`): são segmentações internas (`SUL - RS`, `SUL - TRAÇO - SC`, `ZZ - CO - …`, `ZZ - NO - …`), com dezenas de milhares de ids. Como **`product_ids` inclui produtos ocultos e não publicados**, a contagem reportada é muito maior do que o que o snapshot conhece (coleção "Seu Lugar": 103.653 reportados, **9.521** casam). **A contagem útil para vitrine é a interseção com o snapshot**, e ela vem das colunas "casam". `kit_ids` existe (só `Kits` no Sul, com 3, e `Novidades` no Centro, com 4, têm algum) e é ignorado: kits não são produtos do snapshot.

## 3. Disponibilidade real das coleções editoriais do Sul

| Conceito editorial (home) | Coleção INK | id | Na loja | Reportados | Casam (merch) | Situação |
|---|---|---:|:-:|---:|---:|---|
| **Da Nossa Terra** | `Da Nossa Terra` (`da-nossa-terra`) | 152188 | sim | 133 | **73** | **existe, com o nome exato** |
| **Feito Para Você** (linha **Lenda**) | `Feito Para Você` (`feito-para-voce`) | 152191 | sim | 150 | **21** | **existe.** Não há coleção chamada "Lenda": a linha *Lenda* **é** esta coleção |
| **Redesenhos / Releituras** | `Do Nosso Jeito` (`do-nosso-jeito`) | 152187 | sim | 78 | **32** | **existe com outro nome** (a home chama de "Redesenhos do Sul"; a loja, "Do Nosso Jeito") |
| **Fala daqui** | `Fala Daqui` (`fala-daqui`) | 152079 | sim | 185 | **55** | **existe, com o nome exato** |
| **DDD** | — | — | — | — | — | **não existe coleção própria.** Os produtos DDD estão *dentro* de `Fala Daqui` |
| Novidades (nova) | `Novidades` (`novidades`) | 152270 | sim | 53 | **53** | existe, curada pela loja |
| Estados | `Rio Grande do Sul` / `Santa Catarina` / `Paraná` | 152317–152319 | sim | 2 / 5 / 3 | 2 / 5 / 3 | existem, pequenas |

Outras coleções visíveis do Sul: `Seu Lugar` (152078, só produtos de cidade), `Pré-treino Raiz` (18 merch), `Personalizados` (7), `Parceiros` (1), `Kits` (0). Ocultas com merch: `Fé de Origem` (8), `Dia dos Pais` (17).

### Comparação com o que a home usa hoje

Para cada seleção editorial atual (código em `src/lib/editorial/`), quantos dos produtos que a home mostra **pertencem** à coleção correspondente:

| Seleção da home (snapshot local) | Itens | Dentro da coleção | Resultado |
|---|---:|---|---|
| Da Nossa Terra (`terraProducts`) | 6 | `Da Nossa Terra` **6/6** | subconjunto exato |
| Feito Para Você, **todos** os `\| Lenda` | 21 | `Feito Para Você` **21/21**, coleção com 21 | **conjunto idêntico** |
| Feito Para Você, os 6 da home | 6 | `Feito Para Você` 6/6 | subconjunto |
| DDD (`dddProducts`) | 17 | `Fala Daqui` **17/17** | contido em Fala Daqui |
| Dizeres com contexto | 4 | `Fala Daqui` 4/4 | contido |
| Redesenhos (6 ids fixos) | 6 | `Do Nosso Jeito` **5/6**; o 6º está em `Da Nossa Terra` | **1 divergência** |

- A afirmação de 2026-09-21 em `editorial/collections.ts` ("Lenda = Feito Para Você, 21/21") **se confirma**, agora pela API e não só pela página. O "Truco de Galpão" que aquele comentário não conseguira achar em "Do Nosso Jeito" **não está lá**: está em `Da Nossa Terra`. Ou seja, o "Ver todos" de Redesenhos aponta para uma coleção que contém **5 dos 6** produtos que a home mostra.
- Os itens da "Fala daqui" vindos de `lore` (expressões de estado e de cidade) **não** foram comparados: só os *Dizeres* e DDD foram.

### O que isso significa para o CMS

- As coleções são **conjuntos maiores** do que as seleções da home (Da Nossa Terra: 73 na coleção, 6 na home). Uma seção `ink-category` com `limit: 6` mostraria os **6 primeiros na ordem da INK**, **não** os 6 curados de hoje. Para reproduzir a home Sul **idêntica**, a fonte continua sendo `editorial-module` (é o que o seed usa). `ink-category` serve para seções **novas**, ou para trocar uma curadoria por uma coleção **com aprovação editorial**.
- **Ordem**: a INK devolve os `product_ids` numa ordem que **não é numérica** (nem crescente nem decrescente) e que **não está documentada**. `Novidades` e `Do Nosso Jeito` começam pelos mesmos ids, o que sugere recência, mas é inferência. O plano **preserva a ordem recebida** e o CMS não deve rotulá-la como "mais vendidos" nem "mais recentes".
- **"Novidades" deixa de precisar de `createdAt`**: existe uma coleção `Novidades` mantida pela própria loja (53 produtos casam), com a ressalva de que ela é editorial da loja e não tem período declarado.
- Curadoria manual **restrita à coleção** (ids escolhidos, validados como membros dela) é o caminho para manter o controle editorial de hoje com fonte real; não está implementada (`manual` segue "indisponível").

## 4. Norte e Centro-Oeste

Não têm as coleções editoriais do Sul, mas têm as próprias. Norte (20 visíveis): `Made In Norte` (14 merch), `Básicos de Origem` (14), `Identidade` (7), `Fala de Onde` (24), e uma coleção por estado (`AC`, `AM`, `AP`, `PA`, `RO`, `RR`, `TO`, 7–11 merch cada). Centro-Oeste (21 visíveis): `Lenda do Centro` (17), `Dito no Centro` (16), `Fala de Onde` (22), `Made in Centro-Oeste` (8), `Identidade` (8), `Básicos de Origem` (6), e `MT`/`MS`/`GO`/`DF` (10–24). **Nomes diferentes dos do Sul para conceitos parecidos** (`Lenda do Centro` ≠ `Feito Para Você`; `Dito no Centro` ≈ `Fala Daqui`): o mapeamento editorial é **por região**, nunca por nome global. Ids e slugs também repetem entre lojas (`fala-de-onde`, `identidade`, `personalizados`) com ids diferentes, por isso a chave é sempre (loja, id).

## 5. Decisão técnica

| Item | Decisão | Por quê |
|---|---|---|
| Enumerar e sincronizar coleções | **viável**, ~4 requisições, ~5,3 MiB, ~16 s, ~43 KB de arquivo | medições acima |
| `ink-category` no CMS | **disponível quando existir o arquivo de coleções sincronizado**; o seletor lista só coleções (a) no snapshot, (b) `is_available`, (c) com produtos no catálogo; `usable` a partir de 3 produtos (limite mínimo do carrossel) | fonte real, validada; ocultas (163 no Sul) nunca são oferecidas |
| `ink-collection` (destino/CTA) | **disponível** para Sul, Norte e Centro pelo padrão de URL verificado (§6); `use-origens` **não** (sem padrão verificado) | 3 lojas verificadas |
| Sem arquivo de coleções (**estado atual de produção**) | `ink-category` = "indisponível", a seção some (como um carrossel vazio); `ink-collection` sem slug = sem link; nada muda no site | compatibilidade |
| Fonte `manual` | continua indisponível | fora do escopo |
| Categoria por nome/tag de produto | **nunca** | regra do projeto |

## 6. Padrão de URL da vitrine (verificado)

`https://www.<loja>.com.br/<loja>/collections/<slug>` → **200** para as 4 coleções editoriais do Sul (`da-nossa-terra`, `feito-para-voce`, `do-nosso-jeito`, `fala-daqui`), para `fala-de-onde` (Norte) e `lenda-do-centro` (Centro); um slug inexistente → **404** em Sul e Norte (não é um 404 "mole"). Isso fecha a lacuna antiga: **o slug da INK é o slug da URL** nos casos testados. Não foi testado em cada uma das 224 coleções.

## 7. Limitações e próximo passo mínimo

1. Este inventário é uma fotografia de 2026-09-23; coleções mudam. O arquivo sincronizado guarda `catalogSyncedAt` para saber contra qual catálogo foi casado.
2. `product_ids` sem semântica de ordem documentada; `kit_ids` ignorados.
3. Só os ids casados com **merch** são guardados; produtos de cidade (`bindings`) de uma coleção só são contados (`Seu Lugar` sozinha tem 9.521): coleção de produtos de cidade **não** serve de carrossel.
4. **Próximo passo mínimo**: rodar `npm run collections:sync` **uma vez em ambiente local** depois de um catalog sync fresco (≈ 4 requisições) e revisar o arquivo gerado; **não** foi executado nesta rodada (as requisições autorizadas foram todas gastas na enumeração). Nada disso está ligado a deploy, rota ou agendamento.

## Apêndice — lista completa (224 coleções)

Colunas "casam": quantos dos `product_ids` reportados existem no snapshot local da mesma loja (merch = produtos avulsos; cidades = produtos de cidade). Ordenado pela posição na navbar da INK.

### Sul — 176 coleções

| id | pos | nome | slug | na loja | ids reportados | casam (merch) | casam (cidades) |
|---:|---:|---|---|:-:|---:|---:|---:|
| 152078 | 1 | Seu Lugar | `seu-lugar` | sim | 103.653 | 0 | 9.521 |
| 152187 | 2 | Do Nosso Jeito | `do-nosso-jeito` | sim | 78 | 32 | 0 |
| 152188 | 3 | Da Nossa Terra | `da-nossa-terra` | sim | 133 | 73 | 0 |
| 152191 | 4 | Feito Para Você | `feito-para-voce` | sim | 150 | 21 | 0 |
| 152079 | 5 | Fala Daqui | `fala-daqui` | sim | 185 | 55 | 0 |
| 148122 | 6 | Fé de Origem | `fe-de-origem` | não | 62 | 8 | 0 |
| 137170 | 7 | Pré-treino Raiz | `pre-treino-raiz` | sim | 18 | 18 | 0 |
| 137083 | 8 | Carnaval | `carnaval` | não | 35 | 0 | 0 |
| 140836 | 9 | Personalizados | `personalizados` | sim | 134 | 7 | 0 |
| 147553 | 10 | Kits | `kits` | sim | 0 | 0 | 0 |
| 147697 | 11 | Cidades mais pedidas | `cidades-mais-pedidas` | não | 0 | 0 | 0 |
| 148567 | 12 | Parceiros | `parceiros` | sim | 3 | 1 | 0 |
| 150616 | 13 | Ruas de Origem | `ruas` | não | 0 | 0 | 0 |
| 152030 | 14 | SUL | `sul` | não | 82.822 | 0 | 9.520 |
| 152031 | 15 | SUL - RS | `sul-rs` | não | 35.011 | 0 | 3.973 |
| 152032 | 16 | SUL - SC | `sul-sc` | não | 20.808 | 0 | 2.365 |
| 152033 | 17 | SUL - PR | `sul-pr` | não | 27.003 | 0 | 3.182 |
| 152034 | 18 | SUL - LEGADO | `sul-legado` | não | 11.872 | 0 | 1.189 |
| 152035 | 19 | SUL - P. ORIGEM | `sul-p-origem` | não | 0 | 0 | 0 |
| 152036 | 20 | SUL - COORD. | `sul-coord` | não | 11.603 | 0 | 1.180 |
| 152037 | 21 | SUL - TIPOG. | `sul-tipog` | não | 1.185 | 0 | 1.185 |
| 152038 | 22 | SUL - TRAÇO | `sul-traco` | não | 10.856 | 0 | 1.190 |
| 152039 | 23 | SUL - TERRIT. | `sul-territ` | não | 11.869 | 0 | 1.194 |
| 152040 | 24 | SUL - FEITO EM | `sul-feito-em` | não | 11.545 | 0 | 1.186 |
| 152041 | 25 | SUL - GENTILICO | `sul-gentilico` | não | 11.781 | 0 | 1.179 |
| 152042 | 26 | SUL - LEGADO - RS | `sul-legado-rs` | não | 4.951 | 0 | 496 |
| 152043 | 27 | SUL - LEGADO - SC | `sul-legado-sc` | não | 2.940 | 0 | 294 |
| 152044 | 28 | SUL - LEGADO - PR | `sul-legado-pr` | não | 3.981 | 0 | 399 |
| 152045 | 29 | SUL - P. ORIGEM - RS | `sul-p-origem-rs` | não | 0 | 0 | 0 |
| 152046 | 30 | SUL - P. ORIGEM - SC | `sul-p-origem-sc` | não | 0 | 0 | 0 |
| 152047 | 31 | SUL - P. ORIGEM - PR | `sul-p-origem-pr` | não | 0 | 0 | 0 |
| 152048 | 32 | SUL - COORD. - RS | `sul-coord-rs` | não | 4.831 | 0 | 490 |
| 152049 | 33 | SUL - COORD. - SC | `sul-coord-sc` | não | 2.875 | 0 | 289 |
| 152050 | 34 | SUL - COORD. - PR | `sul-coord-pr` | não | 3.897 | 0 | 401 |
| 152051 | 35 | SUL - TIPOG. - RS | `sul-tipog-rs` | não | 494 | 0 | 494 |
| 152052 | 36 | SUL - TIPOG. - SC | `sul-tipog-sc` | não | 293 | 0 | 293 |
| 152053 | 37 | SUL - TIPOG. - PR | `sul-tipog-pr` | não | 398 | 0 | 398 |
| 152054 | 38 | SUL - TRAÇO - RS | `sul-traco-rs` | não | 4.970 | 0 | 497 |
| 152055 | 39 | SUL - TRAÇO - SC | `sul-traco-sc` | não | 2.950 | 0 | 295 |
| 152056 | 40 | SUL - TRAÇO - PR | `sul-traco-pr` | não | 2.936 | 0 | 398 |
| 152057 | 41 | SUL - TERRIT. - RS | `sul-territ-rs` | não | 4.955 | 0 | 500 |
| 152058 | 42 | SUL - TERRIT. - SC | `sul-territ-sc` | não | 2.933 | 0 | 296 |
| 152059 | 43 | SUL - TERRIT. - PR | `sul-territ-pr` | não | 3.981 | 0 | 398 |
| 152060 | 44 | SUL - FEITO EM - RS | `sul-feito-em-rs` | não | 4.862 | 0 | 497 |
| 152061 | 45 | SUL - FEITO EM - SC | `sul-feito-em-sc` | não | 2.880 | 0 | 306 |
| 152062 | 46 | SUL - FEITO EM - PR | `sul-feito-em-pr` | não | 3.803 | 0 | 383 |
| 152063 | 47 | SUL - GENTILICO - RS | `sul-gentilico-rs` | não | 4.870 | 0 | 487 |
| 152064 | 48 | SUL - GENTILICO - SC | `sul-gentilico-sc` | não | 2.921 | 0 | 293 |
| 152065 | 49 | SUL - GENTILICO - PR | `sul-gentilico-pr` | não | 3.990 | 0 | 399 |
| 152089 | 50 | SUL - ORIGEM | `sul-origem` | não | 12.111 | 0 | 1.217 |
| 152090 | 51 | SUL - ORIGEM - RS | `sul-origem-rs` | não | 5.078 | 0 | 512 |
| 152091 | 52 | SUL - ORIGEM - SC | `sul-origem-sc` | não | 3.016 | 0 | 299 |
| 152092 | 53 | SUL - ORIGEM - PR | `sul-origem-pr` | não | 4.017 | 0 | 406 |
| 152246 | 54 | Mascotes Club | `mascotes-club` | não | 0 | 0 | 0 |
| 148635 | 55 | Dia dos Pais | `dia-dos-pais` | não | 49 | 17 | 0 |
| 152270 | 56 | Novidades | `novidades` | sim | 53 | 53 | 0 |
| 152317 | 57 | Rio Grande do Sul | `rio-grande-do-sul` | sim | 2 | 2 | 0 |
| 152318 | 58 | Santa Catarina | `santa-catarina` | sim | 5 | 5 | 0 |
| 152319 | 59 | Paraná | `parana` | sim | 3 | 3 | 0 |
| 152332 | 60 | ZZ - CO | `zz-co` | não | 12.593 | 0 | 0 |
| 152333 | 61 | ZZ - CO - MS | `zz-co-ms` | não | 3.228 | 0 | 0 |
| 152334 | 62 | ZZ - CO - FEITO | `zz-co-feito` | não | 5.020 | 0 | 0 |
| 152335 | 63 | ZZ - CO - FEITO - MS | `zz-co-feito-ms` | não | 790 | 0 | 0 |
| 152347 | 64 | ZZ - CO - ORIG | `zz-co-orig` | não | 883 | 0 | 0 |
| 152348 | 65 | ZZ - CO - ORIG - MS | `zz-co-orig-ms` | não | 760 | 0 | 0 |
| 152354 | 66 | ZZ - CO - TERR | `zz-co-terr` | não | 730 | 0 | 0 |
| 152355 | 67 | ZZ - CO - TERR - MS | `zz-co-terr-ms` | não | 730 | 0 | 0 |
| 152358 | 68 | ZZ - CO - COORD | `zz-co-coord` | não | 5.000 | 0 | 0 |
| 152359 | 69 | ZZ - CO - COORD - DF | `zz-co-coord-df` | não | 330 | 0 | 0 |
| 152360 | 70 | ZZ - CO - COORD - GO | `zz-co-coord-go` | não | 2.460 | 0 | 0 |
| 152361 | 71 | ZZ - CO - COORD - MS | `zz-co-coord-ms` | não | 790 | 0 | 0 |
| 152362 | 72 | ZZ - CO - COORD - MT | `zz-co-coord-mt` | não | 1.420 | 0 | 0 |
| 152363 | 73 | ZZ - CO - DF | `zz-co-df` | não | 747 | 0 | 0 |
| 152364 | 74 | ZZ - CO - FEITO - DF | `zz-co-feito-df` | não | 350 | 0 | 0 |
| 152365 | 75 | ZZ - CO - FEITO - GO | `zz-co-feito-go` | não | 2.460 | 0 | 0 |
| 152366 | 76 | ZZ - CO - FEITO - MT | `zz-co-feito-mt` | não | 1.420 | 0 | 0 |
| 152367 | 77 | ZZ - CO - GENT | `zz-co-gent` | não | 461 | 0 | 0 |
| 152368 | 78 | ZZ - CO - GENT - DF | `zz-co-gent-df` | não | 1 | 0 | 0 |
| 152369 | 79 | ZZ - CO - GENT - GO | `zz-co-gent-go` | não | 245 | 0 | 0 |
| 152370 | 80 | ZZ - CO - GENT - MS | `zz-co-gent-ms` | não | 79 | 0 | 0 |
| 152371 | 81 | ZZ - CO - GENT - MT | `zz-co-gent-mt` | não | 136 | 0 | 0 |
| 152372 | 82 | ZZ - CO - GO | `zz-co-go` | não | 5.501 | 0 | 0 |
| 152373 | 83 | ZZ - CO - LEG | `zz-co-leg` | não | 499 | 0 | 0 |
| 152374 | 84 | ZZ - CO - LEG - DF | `zz-co-leg-df` | não | 33 | 0 | 0 |
| 152375 | 85 | ZZ - CO - LEG - GO | `zz-co-leg-go` | não | 246 | 0 | 0 |
| 152376 | 86 | ZZ - CO - LEG - MS | `zz-co-leg-ms` | não | 79 | 0 | 0 |
| 152377 | 87 | ZZ - CO - LEG - MT | `zz-co-leg-mt` | não | 141 | 0 | 0 |
| 152378 | 88 | ZZ - CO - MT | `zz-co-mt` | não | 3.117 | 0 | 0 |
| 152379 | 89 | ZZ - CO - ORIG - DF | `zz-co-orig-df` | não | 33 | 0 | 0 |
| 152380 | 90 | ZZ - CO - ORIG - GO | `zz-co-orig-go` | não | 90 | 0 | 0 |
| 152381 | 91 | ZZ - CO - ORIG - MT | `zz-co-orig-mt` | não | 0 | 0 | 0 |
| 152382 | 92 | ZZ - CO - TERR - DF | `zz-co-terr-df` | não | 0 | 0 | 0 |
| 152383 | 93 | ZZ - CO - TERR - GO | `zz-co-terr-go` | não | 0 | 0 | 0 |
| 152384 | 94 | ZZ - CO - TERR - MT | `zz-co-terr-mt` | não | 0 | 0 | 0 |
| 152385 | 95 | ZZ - CO - TIPOG | `zz-co-tipog` | não | 0 | 0 | 0 |
| 152386 | 96 | ZZ - CO - TIPOG - DF | `zz-co-tipog-df` | não | 0 | 0 | 0 |
| 152387 | 97 | ZZ - CO - TIPOG - GO | `zz-co-tipog-go` | não | 0 | 0 | 0 |
| 152388 | 98 | ZZ - CO - TIPOG - MS | `zz-co-tipog-ms` | não | 0 | 0 | 0 |
| 152389 | 99 | ZZ - CO - TIPOG - MT | `zz-co-tipog-mt` | não | 0 | 0 | 0 |
| 152390 | 100 | ZZ - CO - TRACO | `zz-co-traco` | não | 0 | 0 | 0 |
| 152391 | 101 | ZZ - CO - TRACO - DF | `zz-co-traco-df` | não | 0 | 0 | 0 |
| 152392 | 102 | ZZ - CO - TRACO - GO | `zz-co-traco-go` | não | 0 | 0 | 0 |
| 152393 | 103 | ZZ - CO - TRACO - MS | `zz-co-traco-ms` | não | 0 | 0 | 0 |
| 152394 | 104 | ZZ - CO - TRACO - MT | `zz-co-traco-mt` | não | 0 | 0 | 0 |
| 152395 | 105 | ZZ - NO | `zz-no` | não | 8.228 | 0 | 0 |
| 152396 | 106 | ZZ - NO - AC | `zz-no-ac` | não | 506 | 0 | 0 |
| 152397 | 107 | ZZ - NO - AM | `zz-no-am` | não | 1.426 | 0 | 0 |
| 152398 | 108 | ZZ - NO - AP | `zz-no-ap` | não | 367 | 0 | 0 |
| 152399 | 109 | ZZ - NO - COORD | `zz-no-coord` | não | 4.500 | 0 | 0 |
| 152400 | 110 | ZZ - NO - COORD - AC | `zz-no-coord-ac` | não | 220 | 0 | 0 |
| 152401 | 111 | ZZ - NO - COORD - AM | `zz-no-coord-am` | não | 620 | 0 | 0 |
| 152402 | 112 | ZZ - NO - COORD - AP | `zz-no-coord-ap` | não | 160 | 0 | 0 |
| 152403 | 113 | ZZ - NO - COORD - PA | `zz-no-coord-pa` | não | 1.440 | 0 | 0 |
| 152404 | 114 | ZZ - NO - COORD - RO | `zz-no-coord-ro` | não | 520 | 0 | 0 |
| 152405 | 115 | ZZ - NO - COORD - RR | `zz-no-coord-rr` | não | 150 | 0 | 0 |
| 152406 | 116 | ZZ - NO - COORD - TO | `zz-no-coord-to` | não | 1.390 | 0 | 0 |
| 152407 | 117 | ZZ - NO - FEITO | `zz-no-feito` | não | 2.721 | 0 | 0 |
| 152408 | 118 | ZZ - NO - FEITO - AC | `zz-no-feito-ac` | não | 220 | 0 | 0 |
| 152409 | 119 | ZZ - NO - FEITO - AM | `zz-no-feito-am` | não | 620 | 0 | 0 |
| 152410 | 120 | ZZ - NO - FEITO - AP | `zz-no-feito-ap` | não | 160 | 0 | 0 |
| 152411 | 121 | ZZ - NO - FEITO - PA | `zz-no-feito-pa` | não | 1.440 | 0 | 0 |
| 152412 | 122 | ZZ - NO - FEITO - RO | `zz-no-feito-ro` | não | 127 | 0 | 0 |
| 152413 | 123 | ZZ - NO - FEITO - RR | `zz-no-feito-rr` | não | 15 | 0 | 0 |
| 152414 | 124 | ZZ - NO - FEITO - TO | `zz-no-feito-to` | não | 139 | 0 | 0 |
| 152415 | 125 | ZZ - NO - GENT | `zz-no-gent` | não | 457 | 0 | 0 |
| 152416 | 126 | ZZ - NO - GENT - AC | `zz-no-gent-ac` | não | 22 | 0 | 0 |
| 152417 | 127 | ZZ - NO - GENT - AM | `zz-no-gent-am` | não | 62 | 0 | 0 |
| 152418 | 128 | ZZ - NO - GENT - AP | `zz-no-gent-ap` | não | 15 | 0 | 0 |
| 152419 | 129 | ZZ - NO - GENT - PA | `zz-no-gent-pa` | não | 153 | 0 | 0 |
| 152420 | 130 | ZZ - NO - GENT - RO | `zz-no-gent-ro` | não | 51 | 0 | 0 |
| 152421 | 131 | ZZ - NO - GENT - RR | `zz-no-gent-rr` | não | 15 | 0 | 0 |
| 152422 | 132 | ZZ - NO - GENT - TO | `zz-no-gent-to` | não | 139 | 0 | 0 |
| 152423 | 133 | ZZ - NO - LEG | `zz-no-leg` | não | 450 | 0 | 0 |
| 152424 | 134 | ZZ - NO - LEG - AC | `zz-no-leg-ac` | não | 22 | 0 | 0 |
| 152425 | 135 | ZZ - NO - LEG - AM | `zz-no-leg-am` | não | 62 | 0 | 0 |
| 152426 | 136 | ZZ - NO - LEG - AP | `zz-no-leg-ap` | não | 16 | 0 | 0 |
| 152427 | 137 | ZZ - NO - LEG - PA | `zz-no-leg-pa` | não | 144 | 0 | 0 |
| 152428 | 138 | ZZ - NO - LEG - RO | `zz-no-leg-ro` | não | 52 | 0 | 0 |
| 152429 | 139 | ZZ - NO - LEG - RR | `zz-no-leg-rr` | não | 15 | 0 | 0 |
| 152430 | 140 | ZZ - NO - LEG - TO | `zz-no-leg-to` | não | 139 | 0 | 0 |
| 152431 | 141 | ZZ - NO - ORIG | `zz-no-orig` | não | 100 | 0 | 0 |
| 152432 | 142 | ZZ - NO - ORIG - AC | `zz-no-orig-ac` | não | 22 | 0 | 0 |
| 152433 | 143 | ZZ - NO - ORIG - AM | `zz-no-orig-am` | não | 62 | 0 | 0 |
| 152434 | 144 | ZZ - NO - ORIG - AP | `zz-no-orig-ap` | não | 16 | 0 | 0 |
| 152435 | 145 | ZZ - NO - ORIG - PA | `zz-no-orig-pa` | não | 0 | 0 | 0 |
| 152436 | 146 | ZZ - NO - ORIG - RO | `zz-no-orig-ro` | não | 0 | 0 | 0 |
| 152437 | 147 | ZZ - NO - ORIG - RR | `zz-no-orig-rr` | não | 0 | 0 | 0 |
| 152438 | 148 | ZZ - NO - ORIG - TO | `zz-no-orig-to` | não | 0 | 0 | 0 |
| 152439 | 149 | ZZ - NO - PA | `zz-no-pa` | não | 3.177 | 0 | 0 |
| 152440 | 150 | ZZ - NO - RO | `zz-no-ro` | não | 750 | 0 | 0 |
| 152441 | 151 | ZZ - NO - RR | `zz-no-rr` | não | 195 | 0 | 0 |
| 152442 | 152 | ZZ - NO - TERR | `zz-no-terr` | não | 0 | 0 | 0 |
| 152443 | 153 | ZZ - NO - TERR - AC | `zz-no-terr-ac` | não | 0 | 0 | 0 |
| 152444 | 154 | ZZ - NO - TERR - AM | `zz-no-terr-am` | não | 0 | 0 | 0 |
| 152445 | 155 | ZZ - NO - TERR - AP | `zz-no-terr-ap` | não | 0 | 0 | 0 |
| 152446 | 156 | ZZ - NO - TERR - PA | `zz-no-terr-pa` | não | 0 | 0 | 0 |
| 152447 | 157 | ZZ - NO - TERR - RO | `zz-no-terr-ro` | não | 0 | 0 | 0 |
| 152448 | 158 | ZZ - NO - TERR - RR | `zz-no-terr-rr` | não | 0 | 0 | 0 |
| 152449 | 159 | ZZ - NO - TERR - TO | `zz-no-terr-to` | não | 0 | 0 | 0 |
| 152450 | 160 | ZZ - NO - TIPOG | `zz-no-tipog` | não | 0 | 0 | 0 |
| 152451 | 161 | ZZ - NO - TIPOG - AC | `zz-no-tipog-ac` | não | 0 | 0 | 0 |
| 152452 | 162 | ZZ - NO - TIPOG - AM | `zz-no-tipog-am` | não | 0 | 0 | 0 |
| 152453 | 163 | ZZ - NO - TIPOG - AP | `zz-no-tipog-ap` | não | 0 | 0 | 0 |
| 152454 | 164 | ZZ - NO - TIPOG - PA | `zz-no-tipog-pa` | não | 0 | 0 | 0 |
| 152455 | 165 | ZZ - NO - TIPOG - RO | `zz-no-tipog-ro` | não | 0 | 0 | 0 |
| 152456 | 166 | ZZ - NO - TIPOG - RR | `zz-no-tipog-rr` | não | 0 | 0 | 0 |
| 152457 | 167 | ZZ - NO - TIPOG - TO | `zz-no-tipog-to` | não | 0 | 0 | 0 |
| 152458 | 168 | ZZ - NO - TO | `zz-no-to` | não | 1.807 | 0 | 0 |
| 152459 | 169 | ZZ - NO - TRACO | `zz-no-traco` | não | 0 | 0 | 0 |
| 152460 | 170 | ZZ - NO - TRACO - AC | `zz-no-traco-ac` | não | 0 | 0 | 0 |
| 152461 | 171 | ZZ - NO - TRACO - AM | `zz-no-traco-am` | não | 0 | 0 | 0 |
| 152462 | 172 | ZZ - NO - TRACO - AP | `zz-no-traco-ap` | não | 0 | 0 | 0 |
| 152463 | 173 | ZZ - NO - TRACO - PA | `zz-no-traco-pa` | não | 0 | 0 | 0 |
| 152464 | 174 | ZZ - NO - TRACO - RO | `zz-no-traco-ro` | não | 0 | 0 | 0 |
| 152465 | 175 | ZZ - NO - TRACO - RR | `zz-no-traco-rr` | não | 0 | 0 | 0 |
| 152466 | 176 | ZZ - NO - TRACO - TO | `zz-no-traco-to` | não | 0 | 0 | 0 |

### Norte — 22 coleções

| id | pos | nome | slug | na loja | ids reportados | casam (merch) | casam (cidades) |
|---:|---:|---|---|:-:|---:|---:|---:|
| 141895 | 1 | AC | `ac` | sim | 1.503 | 11 | 176 |
| 141896 | 2 | AM | `am` | sim | 4.196 | 7 | 494 |
| 141897 | 3 | AP | `ap` | sim | 1.162 | 8 | 128 |
| 141898 | 4 | PA | `pa` | sim | 9.613 | 11 | 1.148 |
| 141899 | 5 | RO | `ro` | sim | 3.646 | 8 | 412 |
| 141900 | 6 | RR | `rr` | sim | 1.081 | 8 | 117 |
| 141901 | 7 | TO | `to` | sim | 9.595 | 7 | 1.109 |
| 141902 | 8 | Made In Norte | `made-in-norte` | sim | 138 | 14 | 0 |
| 141903 | 9 | Eixo Norte | `eixo-norte` | sim | 457 | 0 | 447 |
| 141904 | 10 | Ponto de Origem | `ponto-de-origem` | sim | 21.191 | 0 | 2.237 |
| 142802 | 11 | Básicos de Origem | `basicos-de-origem` | sim | 14 | 14 | 0 |
| 142833 | 12 | Identidade | `identidade` | sim | 7 | 7 | 0 |
| 142840 | 13 | Fala de Onde | `fala-de-onde` | sim | 24 | 24 | 0 |
| 146522 | 14 | Território | `territorio` | sim | 4.490 | 0 | 449 |
| 146523 | 15 | Tipografia | `tipografia` | sim | 4.500 | 0 | 450 |
| 146525 | 16 | Legado | `legado` | sim | 4.491 | 0 | 450 |
| 146526 | 17 | Traço | `traco` | sim | 4.381 | 0 | 442 |
| 146939 | 18 | Tocantins | `tocantins` | não | 25 | 7 | 0 |
| 149297 | 19 | Feito Em | `feito-em` | sim | 449 | 0 | 449 |
| 150123 | 20 | Gentílico | `gentilico` | sim | 4.473 | 0 | 450 |
| 150620 | 21 | Ruas de Origem | `ruas-de-origem` | sim | 0 | 0 | 0 |
| 150676 | 22 | Rondônia | `rondonia` | não | 8 | 8 | 0 |

### Centro-Oeste — 26 coleções

| id | pos | nome | slug | na loja | ids reportados | casam (merch) | casam (cidades) |
|---:|---:|---|---|:-:|---:|---:|---:|
| 139338 | 1 | MT | `mt` | sim | 11.589 | 24 | 1.122 |
| 139339 | 2 | MS | `ms` | sim | 6.468 | 22 | 636 |
| 139340 | 3 | GO | `go` | sim | 19.746 | 24 | 1.965 |
| 139672 | 4 | DF | `df` | sim | 546 | 10 | 104 |
| 139341 | 5 | Ponto de Origem | `ponto-de-origem` | sim | 23.248 | 0 | 2.356 |
| 139342 | 6 | Eixo Centro-Oeste | `eixo-centro-oeste` | sim | 4.601 | 0 | 498 |
| 139343 | 7 | Fala de Onde | `fala-de-onde` | sim | 220 | 22 | 0 |
| 139344 | 8 | Made in Centro-Oeste | `made-in-centro-oeste` | sim | 107 | 8 | 0 |
| 139345 | 9 | Identidade | `identidade` | sim | 79 | 8 | 0 |
| 139346 | 10 | Básicos de Origem | `basicos-de-origem` | sim | 24 | 6 | 0 |
| 142186 | 11 | Personalizados | `personalizados` | sim | 24 | 1 | 2 |
| 142525 | 12 | Lenda do Centro | `lenda-do-centro` | sim | 170 | 17 | 0 |
| 142528 | 13 | Dito no Centro | `dito-no-centro` | sim | 160 | 16 | 0 |
| 142573 | 14 | Mato Grosso | `mato-grosso` | não | 22 | 13 | 0 |
| 142574 | 15 | Mato Grosso do Sul | `mato-grosso-do-sul` | não | 7 | 7 | 0 |
| 142575 | 16 | Goiás | `goias` | não | 10 | 10 | 0 |
| 142576 | 17 | Distrito Federal | `distrito-federal` | não | 5 | 4 | 1 |
| 146435 | 18 | Território | `territorio` | sim | 4.563 | 0 | 459 |
| 146436 | 19 | Legado | `legado` | sim | 4.585 | 0 | 461 |
| 146437 | 20 | Traço | `traco` | sim | 4.642 | 0 | 466 |
| 146438 | 21 | Tipografia | `tipografia` | sim | 4.660 | 0 | 466 |
| 148479 | 22 | Cidades mais pedidas | `cidades-mais-pedidas` | não | 6 | 0 | 6 |
| 148495 | 23 | Novidades | `novidades` | sim | 0 | 0 | 0 |
| 149251 | 24 | Feito Em | `feito-em` | sim | 4.992 | 0 | 501 |
| 150122 | 25 | Gentílico | `gentilico` | sim | 4.648 | 0 | 466 |
| 150619 | 26 | Ruas de Origem | `ruas-de-origem` | sim | 0 | 0 | 0 |

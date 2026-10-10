# Use Origens — reconciliação INK Centro/Norte → loja Sul unificada

Execução `20261005050850-ef5901c1d` (mapa v1), leitura das lojas feita em 05/10/2026, das 02:46 às 05:05 UTC. Tudo foi feito só com GET e
offline, sem nenhuma escrita na INK nem na produção do storefront.

## Resumo

- **A cópia já terminou.** Os 7.553 itens do migrador têm as 10 peças na loja Sul (Camiseta + 9 cópias): 75.535 peças CO/NO, todas
  **ocultas**. Não há etapa de cópia a preparar.
- **Mapa antigo → novo:** das 69.219 peças de Norte e Centro, **67.881 (98,1%) têm correspondência confirmada** na Sul. Os 1.338
  casos restantes estão explicados: merch sem chave, variantes fora do escopo do migrador, itens bloqueados e 2 desenhos ambíguos.
- **O bloqueio real para ativar é a imagem.** **3.264 das 7.553 Camisetas base estão sem mockup** desde 12–14/09. Ao todo, 8.132 peças CO/NO
  da Sul estão sem imagem. Com a ativação feita hoje, só 4.289 desenhos CO/NO teriam card.
- **Modo sombra pronto.** O snapshot da loja única que o storefront já sabe ler mantém Sul igual à produção (9.535 vínculos contra
  9.531, merch 244 = 244) e preserva a cobertura de cidades de Norte (450) e CO (468 municípios / 503 localidades). Ficam faltando o
  merch de Norte/CO e as famílias cujas bases estão sem imagem.
- **Preços:** todos os tipos de peça mudam de preço ao passar para a Sul (tabela em §5). Nada foi corrigido, os valores estão só
  sinalizados no mapa.

## 1. Onde está cada coisa

| Item | Local |
|---|---|
| Migrador (cria na Sul a partir do acervo de artes, chave `modelo/UF/cidade`) | `../orgulhoregional/scripts/migracao-{lote,config,verificar,piloto,corrigir}.mjs` |
| Estado do migrador (original, **não tocado**) | `../orgulhoregional/scripts/.migracao-estado.jsonl`, sha256 `f5901c1d…`, última linha 30/09 13:32Z |
| Cópia preservada (somente leitura) | `data/unificado/estado/migracao-estado-f5901c1ddcfb1dbf.jsonl` |
| Contrato de identidade | `docs/decisions/0001-ink-catalog-indexing-and-store-consolidation.md` (emenda 21/09) |
| Leitura sombra (bruta, retomável) | `data/unificado/leitura/{use-sul,use-norte,use-centro}.jsonl` + `colecoes-use-sul.json` (gitignored) |
| Saídas da execução | `data/unificado/saida/20261005050850-ef5901c1d/` (gitignored) |
| **Mapa versionado (no Git)** | `docs/migracao-ink/mapa-antigo-novo-v1-20261005050850-ef5901c1d.csv.gz` (69.219 linhas) |
| Resumo da execução (no Git) | `docs/migracao-ink/resumo-20261005050850-ef5901c1d.json` |
| Estado complementar (no Git) | `docs/migracao-ink/estado-complementar-20261005050850-ef5901c1d.jsonl.gz` |

Os cinco documentos de planejamento de 28/09 (`arquitetura-alvo.md`, `contrato-de-dados.md`, `plano-de-migracao.md`,
`pre-condicoes.md`, `auditoria-dependencias.md`) **não existem nesta máquina** (busquei em `~/projects`, `~/Downloads`, `~/Documents` e
`~/Desktop`). O contrato usado foi o que está no código: o ADR 0001 e o plano do migrador
(`orgulhoregional/docs/features/plano-migracao-criacao-produtos.md`).

IDs confirmados na API (coleções da Sul, todas ocultas): `SUL` **152030** (82.822 produtos), `ZZ - CO` **152332** (39.554), `ZZ - NO`
**152395** (35.981).

## 2. Como reproduzir

```bash
cd ~/projects/useorigens
# 1) Leitura sombra: só GET, 1 req/1,5 s por loja, retomável por página. Leva cerca de 1h20 (a Sul tem 1.607 páginas).
#    Use caffeinate: em 05/10 o Mac entrou em repouso no meio e a leitura travou (a INK também tem picos de 429/timeout).
caffeinate -ims npm run unificado:ler                       # as três lojas; rodar de novo retoma de onde parou
# 2) Cópia preservada do estado (nunca aponte para o original)
H=$(shasum -a 256 ../orgulhoregional/scripts/.migracao-estado.jsonl | cut -c1-16)
cp -p ../orgulhoregional/scripts/.migracao-estado.jsonl data/unificado/estado/migracao-estado-$H.jsonl
# 3) Reconciliação + índice sombra: offline, cerca de 30 s
npm run unificado:reconciliar -- --estado=data/unificado/estado/migracao-estado-$H.jsonl
# 4) Ver o catálogo sombra no storefront local (o snapshot de produção não muda)
CATALOG_SNAPSHOT_DIR=$PWD/data/unificado/saida/<runId>/sombra npm run dev
```

No passo 4 o diretório sombra só tem `catalog-snapshot.json`. As abas de peça e as coleções aparecem vazias nessa pré-visualização, e
isso é esperado.

## 3. O que mudou no código

| Arquivo | Mudança |
|---|---|
| `src/lib/catalog/parse.ts` | `Feito em <Cidade> <UF>` sem hífen (forma do migrador) passa a extrair a UF, mas só quando é um código de UF exato. `resolveCity` ganhou o parâmetro opcional `scopeUfs`. **Sem o parâmetro, o comportamento é o de produção.** Nenhum produto visível das três lojas muda de classificação (conferido na leitura de 05/10: 0 afetados). |
| `src/lib/catalog/indexer.ts` | `buildStoreIndex(..., scope?)`: UFs e região vêm do chamador quando informados, o que só acontece no modo sombra. O padrão continua o da produção. |
| `src/lib/catalog/unificado/` (novo) | `leitura.ts` (GET de todos os produtos, inclusive ocultos, com checkpoint por página e prazo total que inclui o corpo da resposta), `produto-bruto.ts`, `estado-migracao.ts` (mesmo redutor do migrador), `chave.ts` (identidade), `reconciliar.ts` (região, mapa, sombra), `destino.ts` (trava contra gravar em `data/generated/`) |
| `scripts/ink-unificado-ler.mts`, `scripts/ink-unificado-reconciliar.mts` | CLIs `npm run unificado:ler` / `unificado:reconciliar` |
| `tests/unit/ink-unificado.test.ts` | 16 testes cobrindo parser, redutor do estado (`reaberto`), chave, RA com dois nomes, corte da migração, região/conflito, mapa (estado, catálogo, duplicata na origem, colisão), sombra e a trava de produção |

Suíte completa: 91 arquivos, 1.234 testes passando, incluindo os 16 novos. Typecheck e lint estão limpos.

## 4. Como a correspondência é decidida

**Unidades, nunca misturadas:** *desenho* = lugar + família + variante (o card da vitrine). *Peça* = um produto INK, ou seja, um desenho
num `product_type`; é a unidade do mapa, linha a linha. *Variante* = SKU (cor × modelo × tamanho) dentro da peça; ela é só contada.

**Chave** (parte estável da chave do ADR 0001, sem chave nova): `chaveProduto = <município IBGE | RA do DF>|<família>|<variante>[|sub:<localidade>]`
e `chavePeca = chaveProduto|t<product_type.id>`. O `product_type.id` é global na INK. Por isso o ID INK antigo **não** é igual ao novo,
e o mapa nunca supõe que ele seja igual a um `retailer_id` da Meta.

**Região de cada peça da Sul** (nunca "está na loja Sul, logo é Sul"):
1. estado do migrador (o id pertence ao item `modelo/UF/cidade`);
2. coleção regional `SUL` / `ZZ - CO` / `ZZ - NO`;
3. `anterior-migracao`: id menor que o primeiro produto do migrador (4.938.261) **e** criado antes de 12/09 13:53Z. Até ali a loja Sul só
   tinha PR/RS/SC (ADR 0001 e plano do migrador §10). Essa regra só vale para peças sem as evidências 1 e 2.

A UF do nome só serve para diagnóstico. Evidências divergentes viram `conflito`; nenhuma evidência vira `desconhecida`.

**Correspondência de cada peça antiga**, em ordem:
1. **estado-migrador**: o item do estado tem id para aquele tipo e o id existe na Sul com a mesma região → `confirmado`.
2. **catalogo-chave**: há exatamente uma peça na Sul com a mesma `chavePeca`, de região CO/NO confirmada por estado ou coleção. Se houver
   mais de uma, o desempate é pela chave do migrador do próprio produto (caso "SCIA" × "Estrutural", dois itens que o índice junta numa
   RA só). O gentílico migrado não tem tag de cidade: a cidade vem da chave do estado, e as cópias herdam pelo `product_cluster_id`
   (única ligação entre peças que o ADR autoriza).
3. Sem nenhuma das duas → `ausente`, com o motivo. Merch ou desenho sem cidade → `sem-chave`; um nome igual no destino aparece só como
   **pista** em `candidatos`, nunca como prova.

**Colisões:** duas peças antigas com o **mesmo nome** apontando para a mesma nova são uma duplicata na origem. Isso é muitos-para-um
legítimo (as duas URLs levam à mesma peça) e fica anotado no `motivo`. Nomes diferentes contam como `ambiguo`.

## 5. Resultado

### Universo lido (peças = produtos INK, todas as visibilidades)

| Loja | Peças | Visíveis | Desenhos com chave | Variantes (SKU) |
|---|---:|---:|---:|---:|
| Norte (origem) | 30.816 | 3.655 | 3.591 | 1.033.242 |
| Centro-Oeste (origem) | 38.403 | 3.923 | 3.835 | 1.222.949 |
| Sul (destino) | 160.662 | 9.834 | — | — |

Classificação da loja Sul: **Sul** 85.017 (9.834 visíveis) · **Norte** 35.981 · **Centro-Oeste** 39.554 (as CO/NO estão todas ocultas)
· **desconhecida** 110 · **conflito** 0. As 110 desconhecidas são 100 peças não geográficas e 10 peças cujo nome indica UF do Sul, todas
criadas na Sul **depois** de 12/09 sem a coleção `SUL` (ex.: `Paranaense | Pé Vermelho`, `Gaúcho | Bagual`, `Praia Paraíso | Origem
Localidade RS`). Onze delas estão visíveis. Elas estão listadas em `classificacao-sul.jsonl`, nada foi descartado.

### Mapa antigo → novo, por região (unidade: peça)

| | Norte | Centro-Oeste |
|---|---:|---:|
| Peças de origem | 30.816 | 38.403 |
| **Confirmadas** | **30.575** | **37.306** |
| ↳ pelo estado do migrador | 21.563 | 28.705 |
| ↳ pela chave no catálogo (feitas depois da cópia local do estado) | 9.012 | 8.601 |
| ↳ duplicatas na origem (2 antigas → 1 nova) | 0 | 670 (335 pares) |
| Ausentes | 24 | 262 |
| Ambíguas | 20 | 0 |
| Sem chave (merch / sem cidade) | 197 | 835 |
| Desenhos com alguma peça confirmada | 3.586 de 3.591 | 3.808 de 3.835 |
| Confirmadas ocultas no destino | 30.575 (todas) | 37.306 (todas) |
| Confirmadas sem imagem no destino | 2.878 | 3.865 |
| Confirmadas com problema de variante | 0 | 1 (`4957721`, `resizing`) |
| Confirmadas com preço diferente | 28.838 | 36.847 |
| Variantes (SKU) nas peças novas confirmadas | 1.092.210 | 1.276.946 |

As variantes de origem e de destino **não** são comparáveis 1 a 1: cada loja tem a sua paleta por tipo de peça. Essas contagens só
dimensionam o volume. O que o mapa sinaliza é objetivo: peça sem variante, sem variante disponível, modelo (Baby Look/Clássica) ausente,
`resizing` ou `rejected`.

A Sul tem **5.406 peças NO** e **2.583 peças CO** que não correspondem a nenhuma peça antiga. São desenhos que o acervo tinha e a loja
antiga não. Ficam no destino e não entram no mapa.

### Pendências, com motivo

| Motivo | Norte | CO | O que é |
|---|---:|---:|---|
| Item bloqueado no migrador | 20 | 150 | 9 gentílicos ambíguos (`cuiabano (papa peixe)`, `rio-verdense ou rio-verdino`, `nova-mamonense ou…`, `tartarugalense ou…`…), 7 tipografias com a arte sem apóstrofo (`Mirassol d'Oeste`…), `origem/DF/brasilia`. É a mesma lista do plano do migrador §10.4. |
| Variante fora do escopo | 4 | 112 | `Origem Localidade/Regional/Legenda/Explicativa` (14 desenhos: Iporá, Caçu, Dourados, Campo Grande…). O migrador só cria a base. |
| Merch / linha não geográfica | 186 | 789 | `Made in <UF> [Clean]`, DDD (`Marajó \| 091`), `Dizeres`, mesorregiões. Visíveis: 62 + 85. Não há equivalente na Sul. |
| Desenho sem cidade na origem | 11 | 46 | `São Luiz \| Origem RR`, `Areião \| Origem Localidade GO`, 4 `uf-mismatch (MG)`. O próprio indexador de produção já os exclui hoje. |
| Ambíguo | 20 | 0 | `Maraã \| Origem AM` × `Sou de Maraã \| Origem AM`: dois desenhos antigos, uma peça nova por tipo. |
| Duplicata no destino | 1 | — | `Feito em Cacoal RO`, Camiseta Infantil: `5006450` (estado, mantida no mapa) e `4962967` (fora do estado). |

### Preço: só sinalizado, nunca corrigido

Peças confirmadas por par (preço antigo → preço Sul atual). A tabela mostra os maiores grupos; a lista completa está em
`resumo-*.json`/`precosDivergentes`.

| Peça | Antigo → Sul | Peças |
|---|---|---:|
| Hoodie Moletom | 199,00 → 209,90 | 6.648 |
| Cropped Moletom | 159,00 → 169,90 | 6.647 |
| Suéter Moletom | 189,00 → **179,90** | 6.636 |
| Camiseta Infantil | 96,00 → 99,90 | 6.196 |
| Body Infantil | 96,00 → **89,90** | 6.188 |
| Cropped / Regata | 94,00 / 96,00 → 99,90 | 6.164 / 6.164 |
| Camiseta Oversized | 129,00 → 139,90 | 5.820 |
| Camiseta Algodão Peruano | 129,90 / 119,00 → 139,90 | 2.780 / 2.556 |
| Camiseta | 99,90 → 109,90 · 119,90 → 109,90 · 114,90 → 109,90 · 94,90 → 104,90 | 1.885 · 1.865 · 1.825 · 909 |

### Índice sombra

`sombra/catalog-snapshot.json`: mesmo formato do snapshot de produção, com **uma loja (`use-sul`) servindo as três regiões**. Ele contém
o que hoje é visível e publicado na Sul **mais** a Camiseta base de cada item migrado, como se tivesse sido ativada (4.289; ver
`simulados.json`). As 3.264 bases sem imagem ficaram de fora e foram contadas.

| Região | Desenhos visíveis hoje (loja regional) | Na sombra | Em ambos | Só hoje | Merch hoje → sombra |
|---|---:|---:|---:|---:|---:|
| Sul | 9.531 vínculos | 9.535 | — | 1 (`Praia Paraíso`, desconhecida) | 244 → 244 |
| Norte | 3.584 | 1.944 | 1.930 | 1.654 (gentílico 450, legado 450, feito-em 449, coordenadas 202, origem 99…) | 60 → **0** |
| Centro-Oeste | 3.826 | 2.344 | 2.230 | 1.596 (feito-em 501, gentílico 462, legado 460, origem 124…) | 81 → **0** |

O "só hoje" de Norte/CO é quase todo explicado pelas bases sem imagem: 1.649 e 1.576 Camisetas visíveis hoje correspondem a uma base nova
sem mockup. Lido pelo storefront (`getCatalog()` com `CATALOG_SNAPSHOT_DIR` apontando para a sombra), o resultado é **Sul 1.191
cidades, Norte 450, CO 468 municípios / 503 localidades**, igual à produção. Cuiabá já aponta para
`https://www.usesul.com.br/usesul/product/cuiaba-origem-mt-…`.

### Verificações direcionadas

- **Integridade:** 69.219 linhas = 69.219 peças antigas lidas, uma por peça. Nenhuma confirmada sem `idNovo`, com `idNovo` inexistente na
  Sul, com tipo de peça diferente ou com região diferente.
- **Estado × Sul:** os 56.863 ids vigentes do estado existem na Sul (0 ausentes). Os 7.553 itens têm as 10 peças.
- **Separação regional:** 0 vínculos da sombra numa UF de outra região; 0 merch sem região confirmada.
- **Produção intocada:** sha256 de `data/generated/catalog-snapshot.json` igual antes e depois (`d4098854…`). A saída é recusada por
  código se apontar para o diretório de produção (`assertForaDaProducao`). Nenhum cache, índice de peças, coleção ou last-known-good foi
  lido para escrita.

## 6. Limites desta leitura

1. **O estado local do migrador está desatualizado.** A última linha é de 30/09 13:32Z, mas a Sul recebeu 18.667 peças CO/NO depois
   disso (Hoodie, Regata, Body e Cropped Moletom, em 30/09 e 01/10). O migrador continuou rodando em outra máquina: o acervo aponta para
   `/Users/gtomazi/...`, que não existe aqui. Essas peças foram confirmadas pelo catálogo (chave + coleção `ZZ` + cluster), e
   `estado-complementar-*.jsonl.gz` as registra no formato do próprio estado.
2. **O acervo de artes não está nesta máquina**, então o `--plano` e o `--executar` do migrador não rodam aqui (precisam de
   `MIGRACAO_ARTES_DIR`).
3. **A leitura é uma fotografia.** As lojas continuam recebendo produtos: há peças da Norte criadas em 04/10 (`Vista Alegre | Origem
   Localidade RO`) e da Sul também em 04/10. Basta repetir os passos 1 a 3 da §2 antes de ativar.
4. A credencial lê produtos ocultos (verificado), então nenhum limite de visibilidade se aplicou.

## 7. Próximas ações executáveis (não executadas)

### A. Fechar o estado do migrador antes de qualquer nova rodada dele (offline, sem risco)

O modo `--copias` do migrador **não** indexa o catálogo: confia só no estado. Rodado com a cópia local, ele recopiaria as 18.667 peças
feitas depois de 30/09 e deixaria órfãs, porque a API não tem DELETE. Na máquina do operador (a que tem o acervo):

```bash
cd ~/projects/orgulhoregional
cp scripts/.migracao-estado.jsonl /tmp/estado-reconciliado.jsonl
gzcat ../useorigens/docs/migracao-ink/estado-complementar-20261005050850-ef5901c1d.jsonl.gz >> /tmp/estado-reconciliado.jsonl
MIGRACAO_ESTADO=/tmp/estado-reconciliado.jsonl MIGRACAO_ARTES_DIR=<acervo> node scripts/migracao-lote.mjs --plano
for p in 165 72 2 178 23 28 119 8 120; do   # ids: nomes como "infantil"/"cropped" são ambíguos no resolverTipo
  MIGRACAO_ESTADO=/tmp/estado-reconciliado.jsonl MIGRACAO_ARTES_DIR=<acervo> node scripts/migracao-lote.mjs --plano --copias="$p"
done
```

Esses comandos leem e simulam, sem escrever. O esperado é **"a processar 0"** em todos, com só os itens bloqueados listados como
bloqueados. O complemento tem 18.667 linhas `copia` e 5.699 `concluido`, sem nenhuma colisão. Se o estado vivo daquela máquina estiver
completo, use-o no lugar e compare: deve dar o mesmo resultado.

### B. Imagens: etapa de PAINEL (substitui o reparo por API)

> Atualizado em 05/10. Os produtos Norte/CO ocultos na Sul estão **ocultos de propósito**: as lojas regionais seguem operando, e a
> publicação só acontece na migração. A falta de imagem nas Camisetas base **não** é mockup preso em `resizing`: o relatório do
> `migracao-verificar.mjs` acusou só 1 peça presa, uma Cropped. É a **imagem de vitrine, que nunca foi definida**. Isso se faz no painel
> INK, e a criação pela API não faz. O reparo por reaplicação de artes ou de variantes pela API **não** deve ser usado para isso.
> Procedimento, fila e resultado estão em `origens-mockups-painel-execucao.md`. As linhas Identidade, DDD, Made In e similares serão
> criadas manualmente pelo usuário.

### C. Duplicata no destino

`4962967` (Feito em Cacoal RO, Camiseta Infantil, fora do estado). Pode ser apagada à mão no painel ou deixada oculta para sempre. O mapa
usa `5006450`.

### D. Ativação: depende da decisão de negócio abaixo

Hoje há **4.289 Camisetas base prontas** (`ativacao-pronta.jsonl`: Norte 1.944, CO 2.345) e 3.264 bloqueadas por imagem
(`ativacao-bloqueada.jsonl`). Nem o migrador nem o storefront têm um comando de ativação. Seria um `PATCH /v1/stores/products/:id
{ "visible_in_store": true }` por id da lista pronta, o mesmo endpoint com que o piloto grava `false`. Não foi escrito nesta rodada.
Para a vitrine passar a usar a loja única, falta também ligar o `catalog:sync` de produção a esta classificação, atrás de uma flag.
O código de leitura e de classificação já está pronto e testado.

## 8. Decisões de negócio que o resultado exige

Nenhuma delas bloqueia o que foi entregue. Elas condicionam a ativação e a troca das vitrines.

1. **Preço:** ativar significa vender Norte/CO pelo preço da Sul em todas as peças (§5). Alguns sobem (Hoodie +10,90, Camiseta 99,90 →
   109,90) e outros caem (Body 96,00 → 89,90, Suéter 189,00 → 179,90, Camiseta 119,90 → 109,90). É preciso aceitar ou ajustar antes de
   ativar.
2. **Merch de Norte/CO** (975 peças; 147 visíveis: Made in, DDD, Dizeres) **não existe na Sul**. Trocar a vitrine para a loja única
   esvazia o merch dessas regiões. Opções: recriar na Sul, ou manter a loja regional servindo o merch em coexistência.
3. **`Maraã` × `Sou de Maraã`** (AM): qual dos dois desenhos a peça nova representa.
4. **110 peças novas da Sul sem a coleção `SUL`** (11 visíveis): incluí-las na coleção, que é uma escrita na INK para outra rodada.
   Sem isso elas ficam fora da vitrine Sul na leitura da loja única.
5. Itens bloqueados e variantes fora do escopo (17 itens e 14 desenhos) seguem a lista que o plano do migrador já tinha. Afetam 31
   desenhos visíveis hoje.

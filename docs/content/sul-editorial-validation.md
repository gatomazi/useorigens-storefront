# Validação editorial do `/sul` V2

Status geral: **PENDENTE DE VALIDAÇÃO**. Nada aqui foi interpretado nem explicado: os textos são os nomes exatos dos produtos da INK.

Gerado a partir do catálogo sincronizado e do código da storefront (`buildLore`, `getRegionHome`), sem edição manual dos dados.

## Como ler

- **Texto/nome exato do produto**: o `name` do produto na INK, sem alteração.
- **Tipo**: `expressão` (`Expressão | Cidade`) ou `padroeiro` (`Cidade | Santo`). É inferido só pelo padrão do nome.
- **Ambiguidade**: comparação de nomes com a lista completa de municípios do IBGE (5.570). Homônimo = mesmo nome em outra UF, ou texto impresso que também é nome de município. Não é juízo sobre o significado.
- Nenhuma expressão tem significado explicado neste documento. Se a loja precisar explicar, isso exige fonte.

## 1. Itens de “Fala de <cidade>” e “Cidades para começar”

**14 itens em 11 cidades.** “Cidades para começar” usa 4 delas (Blumenau/SC, Curitiba/PR, Florianópolis/SC, Foz do Iguaçu/PR), só com itens do tipo expressão.

| # | Cidade | UF | Tipo | Texto impresso | Nome exato do produto | ID INK | Página na storefront | URL de compra na INK | Onde aparece | Observação de ambiguidade | Status |
|---:|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Caxias do Sul | RS | padroeiro | Santa Teresa D'Ávila | `Caxias do Sul \| Santa Teresa D'Ávila` | 4679045 | `/sul/rs/caxias-do-sul` | https://www.usesul.com.br/usesul/product/caxias-do-sul-santa-teresa-d-avila | Página da cidade, bloco “Fala de Caxias do Sul” (rótulo “Padroeiro · Caxias do Sul”) | O tipo “padroeiro” vem só do padrão do nome (`Cidade \| nome de santo`); nenhum campo da INK confirma que é o padroeiro. | PENDENTE DE VALIDAÇÃO |
| 2 | Santa Maria | RS | padroeiro | Nossa Senhora Medianeira | `Santa Maria \| Nossa Senhora Medianeira` | 4678903 | `/sul/rs/santa-maria` | https://www.usesul.com.br/usesul/product/santa-maria-nossa-senhora-medianeira | Página da cidade, bloco “Fala de Santa Maria” (rótulo “Padroeiro · Santa Maria”) | **HOMÔNIMO:** o nome da cidade também é município em Santa Maria/RN (lista IBGE). O tipo “padroeiro” vem só do padrão do nome (`Cidade \| nome de santo`); nenhum campo da INK confirma que é o padroeiro. O nome da cidade começa com “Santa”, o mesmo padrão dos nomes de santos; foi lido como cidade por ser município. | PENDENTE DE VALIDAÇÃO |
| 3 | Blumenau | SC | expressão | Ein Prosit | `Ein Prosit \| Blumenau` | 3778942 | `/sul/sc/blumenau` | https://www.usesul.com.br/usesul/product/ein-prosit-blumenau | Página da cidade, bloco “Fala de Blumenau” (rótulo “Expressão · Blumenau”); Home `/sul`, bloco “Cidades para começar” | Nenhuma encontrada na lista IBGE. | PENDENTE DE VALIDAÇÃO |
| 4 | Florianópolis | SC | expressão | Dazumbanho | `Dazumbanho \| Florianópolis` | 3778594 | `/sul/sc/florianopolis` | https://www.usesul.com.br/usesul/product/dazumbanho-florianopolis | Página da cidade, bloco “Fala de Florianópolis” (rótulo “Expressão · Florianópolis”); Home `/sul`, bloco “Cidades para começar”; Home `/sul`, carrossel “Fala daqui” (rótulo “Florianópolis · SC”) | Nenhuma encontrada na lista IBGE. | PENDENTE DE VALIDAÇÃO |
| 5 | Florianópolis | SC | expressão | Tax Tolo | `Tax Tolo \| Florianópolis` | 3778596 | `/sul/sc/florianopolis` | https://www.usesul.com.br/usesul/product/tax-tolo-florianopolis | Página da cidade, bloco “Fala de Florianópolis” (rótulo “Expressão · Florianópolis”); Home `/sul`, bloco “Cidades para começar”; Home `/sul`, carrossel “Fala daqui” (rótulo “Florianópolis · SC”) | Nenhuma encontrada na lista IBGE. | PENDENTE DE VALIDAÇÃO |
| 6 | Florianópolis | SC | padroeiro | Nossa Senhora do Desterro | `Florianópolis \| Nossa Senhora do Desterro` | 4679022 | `/sul/sc/florianopolis` | https://www.usesul.com.br/usesul/product/florianopolis-nossa-senhora-do-desterro | Página da cidade, bloco “Fala de Florianópolis” (rótulo “Padroeiro · Florianópolis”) | O tipo “padroeiro” vem só do padrão do nome (`Cidade \| nome de santo`); nenhum campo da INK confirma que é o padroeiro. | PENDENTE DE VALIDAÇÃO |
| 7 | Laguna | SC | padroeiro | Santo Antônio | `Laguna \| Santo Antônio` | 4678967 | `/sul/sc/laguna` | https://www.usesul.com.br/usesul/product/laguna-santo-antonio | Página da cidade, bloco “Fala de Laguna” (rótulo “Padroeiro · Laguna”) | **HOMÔNIMO:** o texto impresso “Santo Antônio” também é nome de município em Santo Antônio/RN (lista IBGE). O tipo “padroeiro” vem só do padrão do nome (`Cidade \| nome de santo`); nenhum campo da INK confirma que é o padroeiro. | PENDENTE DE VALIDAÇÃO |
| 8 | Navegantes | SC | expressão | Navegue-se | `Navegue-se \| Navegantes` | 3971200 | `/sul/sc/navegantes` | https://www.usesul.com.br/usesul/product/navegue-se-navegantes-cd3e3d88-9c0e-4420-87ba-99791023b9ed | Página da cidade, bloco “Fala de Navegantes” (rótulo “Expressão · Navegantes”) | Nenhuma encontrada na lista IBGE. | PENDENTE DE VALIDAÇÃO |
| 9 | Tijucas | SC | padroeiro | São Sebastião | `Tijucas \| São Sebastião` | 4678846 | `/sul/sc/tijucas` | https://www.usesul.com.br/usesul/product/tijucas-sao-sebastiao | Página da cidade, bloco “Fala de Tijucas” (rótulo “Padroeiro · Tijucas”) | **HOMÔNIMO:** o texto impresso “São Sebastião” também é nome de município em São Sebastião/AL, São Sebastião/SP (lista IBGE). O tipo “padroeiro” vem só do padrão do nome (`Cidade \| nome de santo`); nenhum campo da INK confirma que é o padroeiro. | PENDENTE DE VALIDAÇÃO |
| 10 | Curitiba | PR | expressão | Frio e Cinza | `Frio e Cinza \| Curitiba` | 3778600 | `/sul/pr/curitiba` | https://www.usesul.com.br/usesul/product/frio-e-cinza-curitiba | Página da cidade, bloco “Fala de Curitiba” (rótulo “Expressão · Curitiba”); Home `/sul`, bloco “Cidades para começar”; Home `/sul`, carrossel “Fala daqui” (rótulo “Curitiba · PR”) | Nenhuma encontrada na lista IBGE. | PENDENTE DE VALIDAÇÃO |
| 11 | Curitiba | PR | expressão | Ta Frio Né | `Ta Frio Né \| Curitiba` | 3778601 | `/sul/pr/curitiba` | https://www.usesul.com.br/usesul/product/ta-frio-ne-curitiba | Página da cidade, bloco “Fala de Curitiba” (rótulo “Expressão · Curitiba”); Home `/sul`, bloco “Cidades para começar”; Home `/sul`, carrossel “Fala daqui” (rótulo “Curitiba · PR”) | Nenhuma encontrada na lista IBGE. | PENDENTE DE VALIDAÇÃO |
| 12 | Foz do Iguaçu | PR | expressão | Fronteira | `Fronteira \| Foz do Iguaçu` | 3778602 | `/sul/pr/foz-do-iguacu` | https://www.usesul.com.br/usesul/product/fronteira-foz-do-iguacu | Página da cidade, bloco “Fala de Foz do Iguaçu” (rótulo “Expressão · Foz do Iguaçu”); Home `/sul`, bloco “Cidades para começar”; Home `/sul`, carrossel “Fala daqui” (rótulo “Foz do Iguaçu · PR”) | **HOMÔNIMO:** o texto impresso “Fronteira” também é nome de município em Fronteira/MG (lista IBGE). Existe outro produto, “Foz do Iguaçu \| São João Batista”, **excluído** por ambiguidade (São João Batista também é município em SC e MA, segundo a lista IBGE). Não aparece na loja. | PENDENTE DE VALIDAÇÃO |
| 13 | Londrina | PR | padroeiro | Sagrado Coração de Jesus | `Londrina \| Sagrado Coração de Jesus` | 4678947 | `/sul/pr/londrina` | https://www.usesul.com.br/usesul/product/londrina-sagrado-coracao-de-jesus | Página da cidade, bloco “Fala de Londrina” (rótulo “Padroeiro · Londrina”) | O tipo “padroeiro” vem só do padrão do nome (`Cidade \| nome de santo`); nenhum campo da INK confirma que é o padroeiro. | PENDENTE DE VALIDAÇÃO |
| 14 | Maringá | PR | padroeiro | Nossa Senhora da Glória | `Maringá \| Nossa Senhora da Glória` | 4678925 | `/sul/pr/maringa` | https://www.usesul.com.br/usesul/product/maringa-nossa-senhora-da-gloria | Página da cidade, bloco “Fala de Maringá” (rótulo “Padroeiro · Maringá”) | **HOMÔNIMO:** o texto impresso “Nossa Senhora da Glória” também é nome de município em Nossa Senhora da Glória/SE (lista IBGE). O tipo “padroeiro” vem só do padrão do nome (`Cidade \| nome de santo`); nenhum campo da INK confirma que é o padroeiro. | PENDENTE DE VALIDAÇÃO |

### Casos homônimos em destaque

- **Santa Maria/RS** (`Santa Maria | Nossa Senhora Medianeira`): **HOMÔNIMO:** o nome da cidade também é município em Santa Maria/RN (lista IBGE). O tipo “padroeiro” vem só do padrão do nome (`Cidade | nome de santo`); nenhum campo da INK confirma que é o padroeiro. O nome da cidade começa com “Santa”, o mesmo padrão dos nomes de santos; foi lido como cidade por ser município.
- **Laguna/SC** (`Laguna | Santo Antônio`): **HOMÔNIMO:** o texto impresso “Santo Antônio” também é nome de município em Santo Antônio/RN (lista IBGE). O tipo “padroeiro” vem só do padrão do nome (`Cidade | nome de santo`); nenhum campo da INK confirma que é o padroeiro.
- **Tijucas/SC** (`Tijucas | São Sebastião`): **HOMÔNIMO:** o texto impresso “São Sebastião” também é nome de município em São Sebastião/AL, São Sebastião/SP (lista IBGE). O tipo “padroeiro” vem só do padrão do nome (`Cidade | nome de santo`); nenhum campo da INK confirma que é o padroeiro.
- **Foz do Iguaçu/PR** (`Fronteira | Foz do Iguaçu`): **HOMÔNIMO:** o texto impresso “Fronteira” também é nome de município em Fronteira/MG (lista IBGE). Existe outro produto, “Foz do Iguaçu | São João Batista”, **excluído** por ambiguidade (São João Batista também é município em SC e MA, segundo a lista IBGE). Não aparece na loja.
- **Maringá/PR** (`Maringá | Nossa Senhora da Glória`): **HOMÔNIMO:** o texto impresso “Nossa Senhora da Glória” também é nome de município em Nossa Senhora da Glória/SE (lista IBGE). O tipo “padroeiro” vem só do padrão do nome (`Cidade | nome de santo`); nenhum campo da INK confirma que é o padroeiro.

### Cobertura por cidade

| Cidade | UF | Expressões | Padroeiros |
|---|---|---:|---:|
| Blumenau | SC | 1 | 0 |
| Caxias do Sul | RS | 0 | 1 |
| Curitiba | PR | 2 | 0 |
| Florianópolis | SC | 2 | 1 |
| Foz do Iguaçu | PR | 1 | 0 |
| Laguna | SC | 0 | 1 |
| Londrina | PR | 0 | 1 |
| Maringá | PR | 0 | 1 |
| Navegantes | SC | 1 | 0 |
| Santa Maria | RS | 0 | 1 |
| Tijucas | SC | 0 | 1 |

A escolha e a ordem das quatro cidades de “Cidades para começar” (Florianópolis, Blumenau, Curitiba, Foz do Iguaçu) é editorial e também está **pendente de validação**.

## 2. Também pendente, fora dos dois blocos acima

O carrossel “Fala daqui” da home mistura os itens acima com outros dois grupos. Estão listados só para que nada editorial fique sem registro. Não entram na contagem da seção 1.

### 2.1 Dizeres com atribuição editorial

O catálogo não informa estado nem cidade para estes produtos. A atribuição vem de `DIZERES_CONTEXT` em `src/lib/editorial/sul.ts` e foi escrita por nós, não pela INK.

| Texto | ID INK | Atribuição exibida na loja | Status |
|---|---|---|---|
| Bah | 3859884 | Rio Grande do Sul | PENDENTE DE VALIDAÇÃO |
| Talvez esteja em Jaraguá | 3893784 | Jaraguá do Sul · SC | PENDENTE DE VALIDAÇÃO |
| Tchê | 3822417 | Rio Grande do Sul | PENDENTE DE VALIDAÇÃO |
| Ô piá | 3822429 | Paraná | PENDENTE DE VALIDAÇÃO |

### 2.2 Expressões de estado ou região

| Nome exato do produto | ID INK | UF atribuída pelo código | Atribuição exibida | Status |
|---|---|---|---|---|
| `Bah Meu \| Rio Grande do Sul` | 3778615 | RS | Rio Grande do Sul | PENDENTE DE VALIDAÇÃO |
| `Tri Legal \| Rio Grande do Sul` | 3778603 | RS | Rio Grande do Sul | PENDENTE DE VALIDAÇÃO |
| `Vai da Onda \| Litoral Catarinense` | 3778599 | SC | Santa Catarina | PENDENTE DE VALIDAÇÃO |

“Vai da Onda | Litoral Catarinense” recebe SC porque “catarinense” só existe em Santa Catarina; a loja mostra “Santa Catarina”, não “Litoral Catarinense”.

## 3. Hero e busca, exatamente como estão hoje

Registro sem alteração. A revisão é visual e será feita depois.

### 3.1 Hero (`/sul`)

Copy atualizada em `CLAUDE_HERO_SUL_PRODUCT_CARDS_REFINEMENT.md` (a anterior falava de DDD e "jeito de falar").

```text
H1:        De qual Sul / você é?          (duas linhas)
Apoio:     Encontre sua cidade e vista o lugar que faz parte de você.
Campo:     Busque sua cidade…             (botão que abre a busca; no desktop também mostra “Buscar”)
Legenda:   1.191 cidades do Sul em camiseta. Ou explore por estado.   (“Ou explore por estado.” leva a #estados)
```

Três cards de produto (Ponto de Origem, Feito em, Coordenadas), cada um com nome da família, cidade · UF e preço, levando à página da família:

```text
Ponto de Origem   Porto Alegre · RS   R$ 109,90
Feito em          Curitiba · PR       R$ 109,90
Coordenadas       Joinville · SC      R$ 109,90
```

Barra de aviso no topo: mobile “1.191 cidades do Sul em camiseta.”; desktop acrescenta “Você escolhe aqui e finaliza a compra na loja Use Sul.”

### 3.2 Busca

A busca do hero, do cabeçalho e dos links abre uma folha (tela cheia no celular). Nas páginas de estado e no 404 o mesmo campo aparece na página, sem folha.

**Antes de digitar** (texto real da folha aberta):

```text
De qual Sul você é?                Fechar ✕
[ Busque sua cidade… ]             (placeholder; o rótulo lido por leitor de tela é “Busque sua cidade”)
(nada abaixo do campo: sem sugestões, sem lista)
```

**Com resultado** (consulta `flo`, texto real):

```text
Florianópolis
Santa Catarina · Região de Florianópolis
Floraí
Paraná · Região de Maringá
Flórida
Paraná · Região de Maringá
Floresta
Paraná · Região de Maringá
Florestópolis
Paraná · Região de Londrina
Flor do Sertão
Santa Catarina · Região de Chapecó
(leitor de tela: “6 resultados. Use as setas para navegar.”)
```

Cada linha: nome da cidade e, abaixo, “Estado · Região de X” (divisão do IBGE de 2017, ver `docs/decisions/0002-ibge-2017-intermediate-regions.md`). Resultado que é estado mostra “Ver as cidades do estado” como subtítulo (conforme o código). Enquanto o índice carrega: “Carregando cidades…”. Se falhar: “Não conseguimos carregar as cidades agora. Tente de novo em instantes.”

**Sem resultado** (consulta `zzzxq`, texto real):

```text
Ainda não encontramos essa cidade.
Tente buscar pelo nome completo ou escolha o estado.
[ Paraná ]  [ Santa Catarina ]  [ Rio Grande do Sul ]
(leitor de tela: “Nenhum resultado.”)
```

### 3.3 Observações, sem mudança

- O título da folha, “De qual Sul você é?”, tem “Sul” escrito no componente (`SearchDialog`). Vai precisar vir da região quando existirem Norte e Centro-Oeste.
- A folha vazia mostra só o campo. Ainda não existem sugestões antes de digitar.


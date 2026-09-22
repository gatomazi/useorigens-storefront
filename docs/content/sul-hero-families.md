# Hero do `/sul`: os três produtos protagonistas

O hero deixou de usar DDD. Passou a liderar com as três famílias de cidade comercialmente mais fortes, nesta ordem, **um produto real de cada**. Preservados: headline, busca na primeira dobra, comportamento mobile-first e estrutura do hero.

DDD continua na seção editorial "O número de cada região".

## Produtos escolhidos

| Ordem | Família | Cidade / UF | ID INK | Slug INK | Página na storefront | URL de compra (INK) | Preço |
|---:|---|---|---|---|---|---|---:|
| 1 | Ponto de Origem | Porto Alegre / RS | 3789951 | `porto-alegre-origem-rs-1d6e71c3-7598-45b5-a26d-a19319681d23` | `/sul/rs/porto-alegre/ponto-de-origem` | https://www.usesul.com.br/usesul/product/porto-alegre-origem-rs-1d6e71c3-7598-45b5-a26d-a19319681d23 | R$ 109,90 |
| 2 | Feito em | Curitiba / PR | 4702917 | `feito-em-curitiba` | `/sul/pr/curitiba/feito-em` | https://www.usesul.com.br/usesul/product/feito-em-curitiba | R$ 109,90 |
| 3 | Coordenadas | Joinville / SC | 3791950 | `joinville-coordenadas-41d969bb-aca1-49c8-b89d-c41bb0aefd14` | `/sul/sc/joinville/coordenadas` | https://www.usesul.com.br/usesul/product/joinville-coordenadas-41d969bb-aca1-49c8-b89d-c41bb0aefd14 | R$ 109,90 |

São os produtos primários (variante base) de cada cidade e família, escolhidos pelo mesmo ranking determinístico do resto do site. O clique leva à página da família na storefront, onde está o botão para a INK. Nada foi inventado: se um dos três deixar de existir no catálogo, ele simplesmente sai do hero.

## Por que estes três

- **Ponto de Origem**: é o design mais expressivo em miniatura (o mapa do estado ocupa a camiseta). Porto Alegre é também a única das candidatas cuja peça primária é **azul-marinho**, o que dá variação de cor a uma fileira de três camisetas quase todas pretas.
- **Feito em**: Curitiba tem nome curto e legível em tamanho pequeno, e as três barras nas cores do estado ajudam a distinguir a peça.
- **Coordenadas**: Joinville, com a rosa dos ventos e as coordenadas.
- **Distribuição**: um produto por estado (RS, PR, SC), porque ficou visualmente bom. Não foi forçada nenhuma cidade.
- **Joinville, e não Florianópolis, em Coordenadas.** Florianópolis também era uma boa peça, mas "Florianópolis" em Bodoni 15 px tem ~125 px e a coluna do hero a 375 px tem ~106 px, o que estourava a largura da página. Joinville tem o mesmo design e cabe. A escolha do nome curto está documentada no código (`HERO_FAMILIES`, `src/lib/editorial/sul.ts`).

## Vendas

O snapshot não guarda vendas dos produtos de cidade (só do merch), então **não há dado de venda** para justificar estas escolhas. A escolha é visual e de estrutura de catálogo, e está **pendente de validação editorial**.

## Como aparece (cards suaves, Opção A)

- **Cards:** cada produto é um card com a superfície no **mesmo cinza da foto da INK** (`#e5e5e5`), então o mockup é absorvido sem moldura branca nem emenda. A arte não é tocada. Um traço de luz e uma sombra bem suave descolam o card da paisagem. Abaixo da arte: nome da família, cidade · UF e preço.
- **Desktop:** texto e busca à esquerda; os três cards em uma linha à direita, alinhados.
- **Celular:** headline, subtexto e busca primeiro; os cards vêm logo depois, grandes (cerca de 62% da largura), num carrossel horizontal com swipe. Cabem na primeira dobra de 375, 390 e 430 px, com o preço visível.
- **Fundo:** só a paisagem, sob um único overlay escuro e uniforme (`.hero-wash`), com texto branco. Se a imagem falhar, sobra uma cor escura de base e o texto continua legível. Sem imagem, o hero volta ao tipográfico (tinta sobre o cinza da página).
- **Sem** camisetas, texto, busca, logo ou UI dentro da imagem de fundo. Tudo isso é desenhado em código.

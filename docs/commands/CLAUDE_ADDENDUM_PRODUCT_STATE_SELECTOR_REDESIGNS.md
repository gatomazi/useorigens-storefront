# Addendum — produto/cidade, seletor de estado mobile e sessões de redesenhos

Este documento complementa os comandos anteriores.

Há 3 ajustes que faltaram e precisam entrar na próxima rodada:

1. ajustar melhor o layout **dentro da página de cidade / estilos / produto**;
2. refazer o módulo de **Estados no mobile**, porque carrossel não está funcionando bem para esse caso;
3. incluir o **esquema de sessões para estampas de redesenhos/recriações**.

Não fazer commit.
Não fazer push.
Não iniciar Norte/Centro/raiz.
Trabalhar somente no `/sul`.

---

# 1. Ajuste dentro da página de cidade / estilos / produto

O problema não está só na home.

Na página de cidade, os produtos/estilos ainda podem parecer:

- soltos;
- desbalanceados;
- com hierarquia estranha;
- com excesso de espaço vazio;
- sem sensação de coleção organizada.

Exemplo claro:
- produto principal muito dominante;
- os demais itens parecem espalhados;
- a leitura da grade não fica natural.

## Direção

Quero aplicar a mesma lógica de organização também **dentro das páginas internas**, especialmente:

```text
/sul/{uf}/{cidade}
/sul/{uf}/{cidade}/{familia}
```

## Página de cidade

A seção de estilos deve parecer uma coleção organizada.

### Desktop
Preferência:

```text
1 destaque principal + grade bem amarrada
```

ou

```text
grade coerente com todos os cards em proporções consistentes
```

Mas sem deixar os produtos “flutuando” no espaço.

Se for manter um item principal em destaque:
- ele precisa estar claramente ancorado;
- os demais precisam formar um bloco visual coeso;
- o conjunto precisa parecer deliberado.

Se isso não ficar bom:
- prefira estrutura mais uniforme.

## Regras

- reduzir espaço morto;
- alinhar melhor os cards;
- manter consistência de escala;
- nome, preço e descrição precisam ficar visualmente próximos do produto;
- evitar produto grande + textos muito afastados;
- evitar sensação de “card perdido em um canvas cinza”.

## Mobile
No mobile, a lógica deve ser ainda mais objetiva.

Quero:
- leitura rápida;
- produto principal cedo;
- outros estilos em grade/coerência;
- sem excesso de rolagem antes de ver os estilos.

---

# 2. PDP / página da família

Na PDP, a prioridade continua sendo:

```text
produto
nome
cidade/UF
preço
variante
CTA
```

Mas quero revisar a composição dessa área para deixá-la mais firme visualmente.

## Ajustes pedidos

- melhorar o agrupamento visual entre imagem, nome, preço e CTA;
- reduzir sensação de elementos soltos;
- revisar espaçamentos verticais;
- garantir que a área comercial pareça um bloco de decisão claro;
- manter CTA muito visível.

Se houver grade de “outros estilos da cidade” abaixo:
- aplicar também maior consistência;
- evitar respiros exagerados;
- deixar mais parecido com coleção e menos com elementos espalhados.

---

# 3. Módulo de Estados no mobile

O carrossel de estados **não está bom para esse tipo de conteúdo**.

Para essa seção, o usuário quer:

- entender rapidamente os estados;
- ver quantas cidades existem;
- acessar regiões;
- eventualmente ver o produto/linha editorial daquele estado.

Carrossel atrapalha isso.

## Nova direção obrigatória

No mobile, trocar o carrossel por algo no estilo:

```text
accordion / dropdown por estado
```

## Estrutura proposta

Cada estado vira um item recolhido:

```text
Rio Grande do Sul
497 cidades
[ abrir ]
```

Ao abrir, mostra:

- banner/imagem do estado;
- nome do estado;
- quantidade de cidades;
- regiões;
- link/CTA;
- eventualmente o produto/linha daquele estado.

### Exemplo conceitual

```text
[ Rio Grande do Sul           v ]
  imagem
  497 cidades
  Regiões:
  - Região de Porto Alegre
  - Região de Passo Fundo
  - Região de Ijuí
  ...
  Produto/linha:
  Rio Grande do Sul | Clean
  R$ 109,90
  [ Ver na loja ]

[ Paraná                       > ]

[ Santa Catarina               > ]
```

## Regras importantes

- apenas um estado aberto por vez;
- fechado, o componente precisa ser compacto;
- aberto, precisa ficar bem organizado;
- o banner do estado entra dentro do conteúdo expandido;
- não usar carrossel horizontal para estados no mobile.

## Desktop

No desktop, pode manter layout expandido por cards/colunas, se estiver bom.

Esse pedido é especificamente mais importante para mobile.

---

# 4. Sessões para estampas de redesenhos / recriações

Faltou tratar as estampas de redesenhos/recriações.

Essas estampas não devem desaparecer no sistema.

Elas precisam entrar como uma camada editorial própria, sem competir com a lógica principal da cidade.

## Objetivo

Criar uma lógica de seção para:

```text
releituras
redesenhos
artes recriadas
interpretações visuais
```

Sem misturar isso de forma confusa com as 8 famílias-base de cidade.

## Regra

As 8 famílias-base continuam sendo o eixo principal de descoberta por cidade.

Já as estampas de redesenhos entram como:

- coleção editorial;
- seção temática;
- trilha paralela de descoberta.

## Como organizar

Criar uma seção específica, com naming consistente.

Exemplos conceituais:

```text
Releituras do Sul
Do Nosso Jeito
Clássicos Redesenhados
```

Você pode escolher o nome mais alinhado ao catálogo/branding existente, mas a ideia precisa ficar clara:
- não é uma família-base;
- é uma coleção editorial temática.

## Onde pode aparecer

### Na home
Pode existir um bloco específico para redesenhos, mais abaixo na página.

Exemplo:

```text
Redesenhos do Sul
Obras, referências e ícones reinterpretados com sotaque local.
```

Com alguns cards.

### Na página da cidade
Usar com cautela.

Não quero poluir a página de cidade.

Se houver uso ali, que seja como módulo secundário e pequeno, não como eixo principal.

### Melhor lugar inicial
Minha preferência inicial:
- home;
- páginas editoriais/coleções;
- talvez uma seção específica depois da home principal.

---

# 5. Estrutura visual da seção de redesenhos

Essa seção deve parecer diferente das 8 famílias-base, para o usuário entender que é outra lógica.

Pode usar:
- cards um pouco mais editoriais;
- imagens maiores;
- menos foco em comparação direta entre 8 variações;
- mais cara de coleção temática.

Mas ainda dentro do sistema visual da Use Origens.

Não virar uma loja paralela.

## Conteúdo do card

Se possível:

- imagem da estampa/produto;
- nome da peça;
- tema/referência curta;
- preço;
- CTA/link.

---

# 6. Hierarquia geral

Quero deixar clara a hierarquia:

## Nível 1 — principal
- busca por cidade;
- 8 estilos da cidade;
- estados;
- fala daqui;
- cidades.

## Nível 2 — editorial complementar
- DDD;
- redesenhos / releituras;
- campanhas;
- coleções especiais.

As releituras entram aqui.

---

# 7. O que NÃO fazer

- não misturar redesenhos com as 8 famílias-base como se fossem a mesma coisa;
- não colocar redesenhos na frente da descoberta principal da cidade;
- não usar carrossel mobile para estados;
- não deixar produto/estilo espalhado na página interna;
- não criar layouts confusos;
- não iniciar novas regiões;
- não gerar novos banners;
- não mexer na INK;
- não fazer commit/push.

---

# 8. Entrega esperada

Retorne com:

1. ajuste da página de cidade, com melhor organização dos estilos;
2. ajuste da PDP/família, com área comercial mais coesa;
3. módulo de estados no mobile refeito em accordion/dropdown;
4. proposta implementada para a seção de redesenhos/recriações;
5. screenshots mobile e desktop das áreas alteradas;
6. explicação rápida das decisões;
7. confirmação de que o carrossel de estados foi removido no mobile;
8. confirmação de que redesenhos viraram uma seção própria;
9. confirmação de que não houve commit/push.

Depois disso, pare para revisão.

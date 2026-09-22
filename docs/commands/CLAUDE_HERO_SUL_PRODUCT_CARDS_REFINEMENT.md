# Ajuste final do Hero `/sul` — integração visual dos produtos

A direção do hero melhorou, mas ainda não está resolvida.

O principal problema agora é que os 3 produtos estão com **cara de recorte sobreposto em cima de mockup da INK**, e o **fundo branco do mockup** está aparecendo demais. Isso quebra o acabamento premium do hero.

Quero uma nova iteração do hero com os seguintes ajustes.

---

## 1. Tirar a sensação de “mockup colado”

Os produtos não devem parecer thumbnails da INK jogadas em cima do banner.

Ajuste para que eles pareçam **cards/editoriais de produto**, não simples imagens recortadas.

### Regras

- remover ou reduzir drasticamente a presença visual do fundo branco do mockup;
- não deixar o card parecer um bloco branco duro flutuando;
- integrar melhor os produtos ao hero;
- manter legibilidade e clareza comercial.

---

## 2. Melhorar o tratamento dos produtos

Quero testar uma destas direções, ou duas variações para comparar.

### Opção A — cards suaves

- cada produto em um card com fundo muito suave;
- usar off-white ou cinza claro quente;
- borda muito discreta ou nenhuma;
- sombra extremamente sutil;
- aparência editorial/premium;
- produto centralizado;
- texto bem organizado abaixo.

### Opção B — recorte mais limpo

- produto com recorte visual mais limpo;
- sem bloco branco pesado;
- base/placa neutra extremamente discreta;
- sensação de produto “apoiado” no layout, não colado.

Se precisar escolher uma primeiro, prefiro começar pela **Opção A**.

---

## 3. Hierarquia comercial dos 3 produtos

Os 3 itens protagonistas do hero continuam sendo:

1. Ponto de Origem
2. Feito em
3. Coordenadas

Não usar DDD como protagonistas do hero.

Quero que esses 3 produtos fiquem mais organizados visualmente e com leitura rápida.

---

## 4. Ajustar o texto do hero

O subtexto atual ainda está desalinhado, porque continua falando de DDD.

Substituir por:

### Headline

```text
DE QUAL SUL VOCÊ É?
```

### Subtexto

```text
Encontre sua cidade e vista o lugar que faz parte de você.
```

### Linha de apoio abaixo da busca

```text
1.191 cidades do Sul em camiseta. Ou explore por estado.
```

---

## 5. Fundo do hero

Gostei mais da direção com paisagem viva, mas o hero ainda precisa ficar mais coeso.

Ajustar o fundo para:

- manter a paisagem;
- aplicar um overlay mais uniforme e elegante;
- melhorar a legibilidade do texto;
- evitar competição excessiva entre fundo e produtos.

O fundo deve parecer proposital e premium, não apenas uma imagem com blur atrás.

---

## 6. Composição

Quero que o lado esquerdo continue com:

- headline;
- subtexto;
- busca;
- linha de apoio.

E o lado direito com:

- os 3 produtos;
- melhor integrados visualmente;
- nome;
- cidade/UF;
- preço;
- estrutura mais refinada.

---

## 7. Relação entre banner e produtos

Importante:

A paisagem do hero é apenas o **background**.

Os produtos continuam sendo renderizados pelo próprio site em overlay.

Portanto:

- não inserir camisetas dentro da imagem do banner;
- não inserir texto dentro da imagem do banner;
- não inserir busca dentro da imagem;
- não inserir logo dentro da imagem;
- não inserir elementos de UI dentro da imagem.

O background deve ser apenas paisagem, com composição pensada para receber:

```text
texto + busca
```

à esquerda e:

```text
3 cards de produto
```

à direita.

---

## 8. Produto com fundo da INK

As imagens atuais da INK possuem fundo claro/branco.

Não tratar esse fundo como se fosse parte do card final.

O card deve absorver visualmente o mockup para que o conjunto pareça intencional.

Se o fundo do mockup for inevitável:

- aproximar o tom do card do fundo da imagem;
- reduzir contraste entre imagem e card;
- evitar moldura branca perceptível;
- preservar toda a camiseta sem recorte destrutivo.

Não modificar a arte do produto.

---

## 9. Mobile-first

Lembrar que ~90% dos acessos são mobile.

A composição não pode funcionar apenas no desktop.

No mobile:

- headline e busca continuam prioritários;
- produtos devem aparecer logo depois, sem ficarem minúsculos;
- os 3 produtos podem virar carrossel horizontal se isso gerar melhor leitura;
- cada card precisa continuar mostrando bem a arte;
- nome, cidade/UF e preço precisam permanecer legíveis;
- evitar 3 produtos espremidos lado a lado.

Validar principalmente em:

```text
375 px
390 px
430 px
```

---

## 10. O que NÃO fazer

- não mudar a arquitetura geral do hero;
- não mexer no fluxo de busca;
- não voltar para DDD como foco principal;
- não inserir produtos dentro do banner;
- não alterar outras seções da página;
- não fazer commit;
- não fazer push;
- não escrever na INK.

---

## 11. Entrega

Retorne com:

1. screenshot do novo hero em desktop;
2. screenshot do novo hero em 375 px;
3. screenshot em 430 px;
4. qual direção foi escolhida para os cards (A ou B);
5. quais produtos reais foram usados;
6. preço mostrado em cada produto;
7. breve justificativa visual;
8. confirmação de que o banner continua sendo apenas background;
9. confirmação de que nenhuma outra parte da home foi alterada;
10. confirmação de que não houve commit/push.

Depois disso, pare para revisão.

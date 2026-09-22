# Ajuste de posicionamento dos modelos — seção de estilos `/sul`

A seção atual dos modelos/estilos está funcional, mas visualmente os produtos parecem **soltos no espaço**.

O problema principal é a hierarquia inconsistente:

- um produto muito grande;
- vários pequenos;
- outra fileira com tamanhos diferentes;
- muito espaço vazio;
- dificuldade de entender por que um item é maior que outro.

Quero transformar essa área em uma coleção mais organizada, comparável e comercial.

---

# 1. Objetivo

A seção deve comunicar:

```text
8 maneiras diferentes de vestir a mesma cidade
```

Ela precisa parecer:

```text
coleção de moda
```

e não:

```text
composição editorial aleatória
```

---

# 2. Regra principal

Não criar hierarquia artificial por tamanho.

As 8 famílias devem usar uma estrutura visual consistente.

Prioridade comercial deve ser comunicada principalmente por:

```text
ordem
```

e não por:

```text
card gigante vs card pequeno
```

---

# 3. Ordem dos modelos

Usar esta ordem:

1. Ponto de Origem
2. Feito Em
3. Coordenadas
4. Legado
5. Território
6. Tipografia
7. Traço
8. Gentílico

Os três primeiros vêm primeiro porque são os mais fortes comercialmente.

Não aumentar o tamanho deles apenas por isso.

---

# 4. Desktop

Preferência principal:

```text
4 colunas × 2 linhas
```

Todos com:

- mesma largura;
- mesma área de imagem;
- mesma altura visual;
- mesmo alinhamento;
- mesmo espaçamento.

Estrutura conceitual:

```text
[ Ponto Origem ] [ Feito Em ] [ Coordenadas ] [ Legado ]

[ Território    ] [ Tipografia ] [ Traço       ] [ Gentílico ]
```

---

# 5. Card de produto

O card não precisa parecer uma caixa pesada.

Preferir:

```text
imagem grande
nome
preço
descrição curta
```

O card deve existir pelo alinhamento e espaçamento.

Evitar:

- borda grossa;
- sombra forte;
- fundo branco destacado demais;
- aparência de marketplace.

---

# 6. Área da imagem

Todas as camisetas devem ficar dentro de uma área visual consistente.

Regras:

- mesma proporção;
- mesma escala aparente;
- mesmo alinhamento vertical;
- produto centralizado;
- evitar uma camiseta ocupando 70% e outra 40%;
- preservar o mockup original sem distorção.

Se a imagem da INK tiver fundos diferentes:

- equalizar visualmente o container;
- não recortar a camiseta;
- não alterar a estampa.

---

# 7. Tipografia do card

Estrutura:

```text
Ponto de Origem
R$ 109,90
Sua cidade no mapa do estado.
```

Nome:
- forte;
- curto;
- sem underline permanente.

Preço:
- próximo do nome;
- não solto no extremo do card.

Descrição:
- pequena;
- objetiva;
- no máximo 1–2 linhas no desktop.

---

# 8. Descrições

Reduzir as descrições atuais.

Sugestões:

### Ponto de Origem
```text
Sua cidade marcada no mapa do estado.
```

### Feito Em
```text
Cidade e estado em composição tipográfica.
```

### Coordenadas
```text
Nome e coordenadas da cidade.
```

### Legado
```text
Silhueta do estado com cidade e origem.
```

### Território
```text
Mapa do estado com a cidade em destaque.
```

### Tipografia
```text
O nome da cidade como protagonista.
```

### Traço
```text
Contorno do estado em linha minimalista.
```

### Gentílico
```text
O jeito de chamar quem é dali.
```

Não inventar detalhes que não correspondam à arte real.

---

# 9. Headline da seção

A headline atual:

```text
Escolha como vestir a sua cidade
```

funciona, mas pode ser refinada.

Quero testar como principal:

```text
SUA CIDADE, DE 8 JEITOS.
```

Subtexto:

```text
Do mapa às coordenadas. Escolha a estampa que mais combina com o seu lugar.
```

Alternativa mais neutra:

```text
ESCOLHA O SEU ESTILO.
```

```text
Oito maneiras de levar a sua cidade com você.
```

Preferência inicial:

```text
SUA CIDADE, DE 8 JEITOS.
```

---

# 10. Mobile

Como ~90% do tráfego é mobile, essa seção deve ser pensada primeiro em:

```text
375
390
430
```

Preferência:

```text
2 colunas × 4 linhas
```

Mas somente se:

- camiseta continuar legível;
- título não quebrar demais;
- preço continuar associado ao produto.

No mobile:

- remover descrição do card;
- manter apenas:
  - imagem;
  - nome;
  - preço.

Exemplo:

```text
[ produto ]   [ produto ]
Ponto Origem  Feito Em
R$ 109,90     R$ 109,90
```

---

# 11. Espaçamento mobile

Evitar:

- gaps gigantes;
- cards altos demais;
- descrições fazendo a seção ficar interminável.

A seção deve ser compacta e fácil de escanear.

---

# 12. Tablet

Em 768 px:

Preferir:

```text
2 ou 3 colunas
```

de acordo com legibilidade.

Não forçar 4 colunas se as camisetas ficarem pequenas.

---

# 13. Hover desktop

Hover discreto.

Pode usar:

- leve aumento da imagem;
- linha/acento da paleta Sul;
- pequena mudança de background.

Não usar:

- sombra grande;
- animação exagerada;
- card levantando demais.

---

# 14. Paleta Sul

Usar acentos com moderação:

```text
#4d543d
#d6ba8d
```

Exemplos:

- underline no hover;
- pequeno divisor;
- label;
- focus state.

Não pintar o card inteiro.

---

# 15. O que NÃO fazer

- não manter um produto gigante e os outros pequenos;
- não usar 3 tamanhos diferentes de card;
- não criar destaque artificial sem razão comercial;
- não usar underline permanente;
- não aumentar muito a altura da seção;
- não alterar os produtos;
- não alterar estampas;
- não alterar preços;
- não mexer em outras seções;
- não fazer commit;
- não fazer push.

---

# 16. QA visual

Depois do ajuste, capturar:

```text
/sul
375 px
430 px
768 px
1440 px
```

Capturar especificamente a seção completa.

---

# 17. Retorno esperado

Retorne:

1. estrutura final escolhida no desktop;
2. estrutura final no mobile;
3. ordem dos 8 modelos;
4. headline/subtexto final;
5. screenshot 375;
6. screenshot 430;
7. screenshot 768;
8. screenshot 1440;
9. confirmação de que todos os cards possuem escala consistente;
10. confirmação de que nenhuma outra seção foi alterada;
11. confirmação de que não houve commit/push.

Depois disso, pare para revisão.

# Ajuste de posicionamento dos banners — `/sul`

A implementação atual dos banners **não ficou boa**.

O problema é que os banners foram inseridos **como blocos soltos entre seções**, funcionando como separadores independentes.  
Isso deixa a home com aparência quebrada, interrompe o fluxo e faz parecer que os banners foram “jogados” entre os conteúdos.

Quero corrigir isso com a seguinte diretriz:

---

## 1. Regra principal

**Banners não devem virar seções independentes soltas entre os blocos da página.**

Eles devem funcionar de uma destas formas:

### A. Background da própria seção
Como já foi feito no hero:
- a imagem entra por trás;
- o conteúdo da seção continua em cima;
- o banner ajuda a ambientar a seção.

### B. Fundo/apoio na parte inferior da seção
Se não funcionar como background da seção inteira, o banner pode entrar:
- como base visual na parte de baixo do bloco;
- como encerramento visual do próprio módulo;
- sem parecer uma nova seção separada.

### C. Imagem editorial interna da seção
Em alguns casos, o banner pode funcionar como:
- uma faixa editorial dentro da própria seção;
- um complemento visual acoplado ao bloco;
- nunca como uma “quebra” aleatória entre um módulo e outro.

---

## 2. O que NÃO fazer

Não:

- inserir o banner como um bloco full-width isolado entre duas seções;
- usar o banner como divisor genérico;
- interromper a leitura da home com grandes imagens soltas;
- criar sensação de que a página foi “fatiada” por banners;
- repetir a lógica de “sessão de conteúdo -> banner -> sessão de conteúdo -> banner”.

A navegação precisa continuar fluida.

---

## 3. Como aplicar por slot

## HERO
Permanece como está conceitualmente:

- banner como background do hero;
- texto, busca e produtos em overlay.

Esse está no caminho certo.

---

## CAMPAIGN
O banner de campanha **não deve entrar como uma faixa solta entre seções**.

Ele deve virar um **bloco editorial integrado**.

Preferência:

- usar o banner como background de uma seção editorial;
- com headline, texto curto e CTA por cima;
- funcionando como um módulo de marca/campanha.

Exemplo de função:
- fechar a home;
- abrir uma campanha;
- destacar uma mensagem institucional/regional.

---

## CITY
O banner de cidade não deve ser um separador.

Ele deve entrar **dentro do contexto da seção de cidades**.

Exemplos válidos:

### Opção A
como apoio visual dentro de “Cidades para começar”

### Opção B
como background leve da área de introdução da seção

### Opção C
como um card editorial grande no final da seção

Mas sempre **dentro do bloco da seção**, nunca solto.

---

## FALA DAQUI
O banner de “Fala daqui” deve ser usado **junto da própria seção Fala daqui**.

Melhor abordagem:

- a seção pode ter fundo regional;
- o banner pode aparecer na lateral, no topo ou no rodapé do próprio bloco;
- ou a parte superior do módulo pode usar esse banner como área editorial.

O banner não deve abrir uma nova seção isolada.

---

## STATE
Os banners de estado não devem aparecer como faixas entre seções.

Eles devem ser usados:

- dentro dos cards de estado;
- como imagem de capa de cada estado;
- ou como background das áreas específicas de cada estado.

Ou seja:
- PR → dentro do card/área do Paraná;
- SC → dentro do card/área de Santa Catarina;
- RS → dentro do card/área do Rio Grande do Sul.

Nunca como blocos separados da seção “Escolha o seu estado”.

---

## DDD
O banner de DDD também não deve virar bloco independente.

Se for usado, deve estar acoplado à seção:

```text
O número de cada região
```

Possibilidades:
- como background da seção;
- como apoio lateral;
- como pequena faixa editorial no rodapé do módulo.

Se não ficar bom, é melhor nem usar banner nessa seção por enquanto.

---

## 4. Hierarquia correta da home

A home precisa parecer uma narrativa contínua.

O modelo desejado é:

```text
Hero
↓
Sessão de estilos
↓
DDD
↓
Fala daqui
↓
Estados
↓
Cidades para começar
↓
Bloco editorial/campanha
↓
Footer
```

Os banners devem **reforçar essa narrativa**, não quebrá-la.

---

## 5. Onde os banners funcionam melhor

Na prática, os melhores usos são:

### muito bons
- Hero como background;
- Campaign como bloco editorial integrado;
- State dentro dos cards de estado;
- Fala daqui como reforço visual da própria seção.

### médios
- City como apoio visual de uma seção existente;
- DDD apenas se integrado com muito cuidado.

### ruins
- qualquer banner como seção solta entre módulos.

---

## 6. Diretriz visual

Quero que a página pareça:

```text
uma storefront premium contínua
```

e não:

```text
uma landing page interrompida por artes aleatórias
```

A imagem deve servir ao módulo.

O módulo não deve existir só para “encaixar banner”.

---

## 7. Implementação pedida

Revisar o uso de todos os slots de banner do `/sul` e reposicioná-los com esta lógica:

- **hero** = background do hero;
- **campaign** = bloco editorial integrado;
- **city** = apoio interno da seção de cidades;
- **fala-daqui** = integrado à seção Fala daqui;
- **state** = dentro dos cards/blocos de estado;
- **ddd** = apenas se integrado à própria seção; se ficar forçado, não usar.

Se algum slot ainda não tiver uma integração boa, prefiro:

```text
deixar o slot sem uso por enquanto
```

a usar de forma errada.

---

## 8. Entrega

Retorne com:

1. screenshots atualizados da home em desktop;
2. screenshot da home em 375 px;
3. lista de onde cada slot foi usado;
4. quais slots ficaram temporariamente sem uso, se houver;
5. breve justificativa das decisões;
6. confirmação de que os banners deixaram de aparecer como seções soltas;
7. confirmação de que não houve commit/push.

Depois disso, pare para revisão.

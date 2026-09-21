# Rodada de inspeção visual — screenshots via Claude in Chrome

## Objetivo

Antes de continuar para `/norte`, `/centro-oeste` ou qualquer nova fase, faça uma rodada exclusivamente de **inspeção e captura visual** do estado atual do storefront.

Não altere código nesta rodada.

Não faça refactor.
Não ajuste layout.
Não mexa em tipografia.
Não mexa em spacing.
Não mexa em cores.
Não mexa em animações.
Não mexa em conteúdo.
Não altere dados.
Não escreva na INK.
Não faça commit nem push.

A função desta rodada é apenas:

```text
abrir
→ observar
→ capturar
→ organizar
→ relatar
```

Quero levar esse material para revisão visual externa antes de autorizar qualquer nova mudança.

---

# 1. Use Claude in Chrome

Use Claude in Chrome para abrir a aplicação atual em ambiente de produção/local de produção equivalente.

A análise precisa ser feita sobre a página renderizada de verdade.

Não faça apenas inspeção de HTML/CSS.

---

# 2. Rotas obrigatórias

Capture e revise pelo menos:

```text
/sul
/sul/rs/torres
/sul/rs/torres/ponto-de-origem
/sul/pr/pato-branco/ponto-de-origem
```

Se a rota exata de família diferir, use a rota real correspondente.

Inclua também:

```text
1 página de estado
1 página com localidade
1 página com variante real
```

Escolha exemplos reais já existentes no catálogo.

---

# 3. Breakpoints obrigatórios

Para cada rota relevante, capture:

```text
375 px
430 px
768 px
1280 px
1440 px
```

Não é necessário capturar absolutamente todas as páginas em todos os tamanhos se isso gerar redundância extrema.

Mas é obrigatório ter:

## `/sul`

```text
375
430
768
1280
1440
```

## Cidade principal

```text
375
1440
```

## Família / PDP interna

```text
375
1440
```

## Variante

```text
375
1440
```

## Estado

```text
375
1440
```

---

# 4. Capturas por seção da home

Além das screenshots de página inteira, capture cortes específicos da `/sul`:

```text
01-header-hero
02-busca
03-estados
04-design-families
05-produtos-ou-destaques
06-bloco-editorial
07-made-in-carousel
08-footer
```

Quero conseguir analisar cada bloco isoladamente.

---

# 5. Estados de interação

Capture também alguns estados que screenshot estático de página inteira não mostra bem.

## Header

- topo da página;
- após scroll.

## Busca

- busca fechada;
- busca aberta;
- busca com resultados;
- versão mobile em fullscreen/sheet.

Use uma busca real, por exemplo:

```text
flo
```

ou

```text
tij
```

## Carrossel

Capture:

- posição inicial;
- posição intermediária.

## Produto/família

Se houver hover visual em desktop, capture:

- normal;
- hover.

## Variante

Capture:

- variante padrão;
- outra variante selecionada.

---

# 6. Não faça correções durante a inspeção

Mesmo que encontre algo claramente ruim, NÃO ajuste agora.

Registre.

Exemplos:

```text
hero parece pesado
headline agressiva demais
camisetas grandes demais
spacing apertado
grid parece bruto
busca ocupa espaço demais
Bodoni conflita com Big Shoulders
bloco preto pesa demais
dourado aparece demais
carrossel parece desconectado
mobile muito denso
```

Esses são apenas exemplos.

Não use essas frases como conclusão prévia.

Avalie o que realmente está renderizado.

---

# 7. Crie um relatório crítico visual

Crie:

```text
docs/design/current-visual-review.md
```

Estruture assim:

# Impressão geral

Descreva objetivamente como a storefront atual se apresenta.

Não tente defender as decisões anteriores.

Faça crítica real.

---

## Home `/sul`

Para cada bloco:

```text
Header
Hero
Busca
Estados
Design Families
Produtos
Editorial
Made In
Footer
```

registre:

### O que funciona

### O que parece pesado/grosseiro

### O que parece refinado

### O que está desbalanceado

### O que merece revisão

---

## Página de cidade

Analise:

- impacto do título;
- uso do contorno do estado;
- densidade;
- grid de famílias;
- produto;
- localidade;
- mobile.

---

## Página de família/produto

Analise:

- parece PDP premium?
- hierarquia;
- preview;
- preço;
- CTA;
- variante;
- whitespace;
- conexão visual com a home.

---

## Mobile

Analise especificamente:

- densidade;
- escala da tipografia;
- busca;
- hero;
- product cards;
- carrosséis;
- footer;
- sensação de fluidez.

---

# 8. Use linguagem crítica, não defensiva

Não escreva:

```text
ficou ótimo porque...
```

Quero avaliação honesta.

Use formulações como:

```text
Funciona porque...
Pesa porque...
Falta refinamento em...
Existe excesso de...
A composição perde equilíbrio quando...
O mobile parece mais denso por...
```

---

# 9. Não compare com benchmarks nesta rodada

Não volte agora para:

- Ark Club;
- Kith;
- Fear of God;
- Osklen;
- PACE;
- Carhartt;
- Patagonia;
- Aimé Leon Dore.

A comparação com referências será feita depois, com base nas screenshots atuais.

Nesta rodada quero apenas documentar o estado real da Use Origens.

---

# 10. Organize screenshots

Salve em:

```text
docs/design/screenshots/current-review/
```

Sugestão:

```text
current-review/
  home/
    full/
    sections/
    interactions/

  city/
  family/
  variant/
  state/
  mobile/
```

Use nomes claros.

Exemplo:

```text
home-1440-full.png
home-375-full.png

home-1440-hero.png
home-1440-search.png
home-1440-families.png

search-1440-open-results.png
search-375-fullscreen.png

torres-1440-full.png
torres-375-full.png

ponto-origem-1440-full.png
ponto-origem-375-full.png
```

---

# 11. Monte um índice visual

Crie:

```text
docs/design/current-visual-review-index.md
```

Com a lista organizada das capturas.

Exemplo:

```text
HOME
- home-1440-full.png
- home-375-full.png

HERO
- home-1440-hero.png
- home-375-hero.png

SEARCH
- search-1440-open-results.png
- search-375-fullscreen.png

CITY
- torres-1440-full.png
- torres-375-full.png
```

A ideia é facilitar o envio do material para revisão.

---

# 12. Gere também um compilado, se possível

Se for possível sem adicionar dependências desnecessárias, gere um ou mais contact sheets/compilados em PNG ou PDF.

Sugestão:

```text
docs/design/screenshots/current-review/
  review-desktop.png
  review-mobile.png
```

ou:

```text
review-desktop.pdf
review-mobile.pdf
```

Cada compilado deve organizar as capturas em sequência, com identificação simples da rota/seção.

Não reduza tanto a resolução a ponto de impedir a leitura.

Se não for prático, não force.

As screenshots individuais são prioritárias.

---

# 13. Não altere o baseline

Reforçando:

Esta rodada NÃO autoriza:

```text
mudança de layout
mudança de hero
mudança de fonte
mudança de cor
mudança de grid
mudança de spacing
mudança de conteúdo
mudança de animação
```

Mesmo que a crítica encontre problemas.

Registre tudo e pare.

---

# 14. Retorno esperado

Ao terminar, me retorne somente:

1. caminho do relatório:
   ```text
   docs/design/current-visual-review.md
   ```

2. caminho do índice:
   ```text
   docs/design/current-visual-review-index.md
   ```

3. pasta com screenshots:
   ```text
   docs/design/screenshots/current-review/
   ```

4. lista das rotas capturadas;

5. lista dos breakpoints;

6. se conseguiu gerar compilado desktop/mobile;

7. os 5 principais pontos visuais que, na sua avaliação, mais merecem revisão;

8. confirmação de que nenhum arquivo de implementação foi alterado.

Não faça commit nem push.

Depois disso, pare e aguarde revisão.

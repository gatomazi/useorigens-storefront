# GO — Executar rodada noturna de refinamento premium

O milestone funcional `/sul` está aprovado como baseline.

Agora execute o arquivo:

```text
docs/commands/CLAUDE_NIGHTLY_PREMIUM_STOREFRONT_PASS.md
```

como continuação direta do trabalho atual.

Não espere nova confirmação.

## Regras adicionais para esta rodada

### 1. Preserve o que já está funcionando

O fluxo atual já está validado:

```text
/sul
→ busca
→ estado/cidade
→ família
→ variante quando existir
→ preview real
→ preço real
→ CTA real da INK
```

Não reescreva parser, indexer, resolver, commerce mapping, sincronização INK, regras de localidade, binding, rotas ou testes existentes, a menos que um problema real encontrado durante QA exija correção.

A rodada agora é principalmente de:

```text
layout
direção visual
hierarquia
tipografia
spacing
hero
search UX
carrosséis
editorial
motion
mobile
polish
```

### 2. Use o estado atual como baseline visual

Antes de alterar o layout:
- capture as screenshots atuais;
- preserve-as como `before`;
- faça o benchmark;
- só então faça alterações.

Não mude algo apenas porque outra marca faz diferente.

Toda alteração precisa melhorar percepção de marca, clareza, impacto, produto, descoberta, mobile ou consistência.

### 3. O fundo `#e5e5e5` pode continuar

O fato de ele coincidir com o fundo das imagens da INK e eliminar a sensação de “caixa” de produto é uma vantagem.

Não troque esse fundo apenas para seguir um benchmark.

Use-o como parte consciente do sistema visual, desde que:
- contraste esteja correto;
- sections editoriais consigam criar ritmo;
- a página não fique visualmente plana.

Pode introduzir áreas claras/escuras/editoriais pontuais para criar contraste e cadência.

### 4. Preserve a direção tipográfica se ela estiver funcionando

Baseline atual:

```text
Big Shoulders
→ display/headlines

Hanken Grotesk
→ UI/body

Bodoni Moda
→ nomes de lugar/editorial
```

Não troque fontes só porque outro site usa algo diferente.

Avalie no Chrome:
- impacto;
- legibilidade;
- personalidade;
- mobile;
- contraste entre as três famílias tipográficas.

Só substitua se existir ganho visual claro e documentado.

### 5. Benchmark não é redesign de marca

Use Ark Club, Kith, Fear of God, Carhartt WIP, Osklen, PACE, Patagonia e Aimé Leon Dore como referências de:
- ritmo;
- hierarchy;
- scale;
- photography;
- product presentation;
- editorial commerce;
- whitespace;
- mobile;
- interactions.

Não copie assets, composição exata, tipografia, cores, textos ou grid idêntico.

Use Origens precisa continuar parecendo própria.

### 6. Hero é prioridade

O hero atual usa apenas produto INK.

Tente extrair o máximo disso antes de exigir novos assets.

Pode explorar:
- escala maior;
- crop melhor;
- composição editorial;
- superposição tipográfica;
- produto parcialmente saindo da composição;
- uso de whitespace;
- entrada animada sutil;
- contraste entre produto e headline.

Mas não invente fotografia lifestyle falsa dentro do projeto.

Ao final, se ainda faltar campanha real, documente exatamente o asset necessário.

### 7. Busca de cidade deve virar assinatura da loja

A busca é uma das maiores diferenças da Use Origens.

Faça uma rodada dedicada nela.

Avalie:
- entrada na home;
- autocomplete;
- teclado;
- estados ativos;
- hover;
- resultado;
- mobile;
- abertura via header;
- sheet/fullscreen no mobile;
- transição para cidade.

Ela precisa parecer um recurso central da marca, não um filtro.

### 8. Página de cidade também entra no polish

Não refine apenas `/sul`.

Revise visualmente também:

```text
/sul/rs/torres
```

e pelo menos uma página de família/variante real.

Verifique:
- família primary;
- variantes;
- “Também de Torres”;
- produto;
- preço;
- CTA;
- breadcrumb/contexto;
- mobile.

A experiência precisa continuar premium depois da home.

### 9. Não mexa no catálogo por causa do layout

Cobertura desigual é comportamento esperado.

A UI deve continuar se adaptando ao que existe.

Nunca crie visualmente uma família inexistente só para preencher grid.

Use as famílias disponíveis de forma dinâmica.

### 10. Trate o carrossel “Made in…” como problema visual real

Hoje ele destoa porque os produtos possuem fundos coloridos.

Faça experimentos de apresentação antes de alterar produto/imagem.

Possíveis soluções:
- seção com background próprio;
- crop consistente;
- frame editorial;
- tratamento de layout;
- agrupamento em campanha;
- carousel com ritmo diferente dos city designs.

Não tente apagar ou adulterar a imagem real da INK só para igualar o fundo.

### 11. Revise as copies não confirmadas

A frase:

```text
Frete calculado na loja, antes de pagar
```

só pode permanecer se for realmente verdadeira para o fluxo da INK.

Se não houver confirmação suficiente, prefira copy factual e conservadora.

As descrições das 8 famílias foram inferidas visualmente.

Revise-as e deixe-as descritivas, sem inventar história ou característica que a arte não sustente.

Não transforme esse ponto em bloqueio visual.

### 12. Motion

A dependência `motion` está instalada e ainda não é usada.

Nesta rodada:
- use Motion apenas se realmente melhorar transições;
- CSS continua preferível para interações simples.

Se ao final `motion` continuar sem uso:

```text
remova a dependência
```

Não deixe dependência morta.

### 13. Lighthouse deve rodar nesta rodada

O milestone anterior não executou Lighthouse.

Agora execute pelo menos em:

```text
/sul
/sul/rs/torres
```

Preferencialmente em build de produção.

Registre:
- Performance;
- Accessibility;
- Best Practices;
- SEO;
- LCP;
- CLS;
- INP/TBT quando aplicável.

Não persiga score 100 sacrificando o visual.

Corrija regressões óbvias.

### 14. Não produza Norte/Centro/root completo ainda

Continuam fora de escopo nesta rodada:

```text
/
/norte
/centro-oeste
```

Também não iniciar:
- CMS;
- autenticação;
- wishlist;
- carrinho;
- checkout;
- Postgres;
- sitemap/analytics/redirects;
- consolidação de lojas.

A rodada é para provar que a experiência Sul consegue atingir o nível visual esperado.

### 15. QA visual

Execute os 3 ciclos previstos no MD noturno:

```text
baseline
→ refinement
→ polish
```

Nos breakpoints:

```text
375
430
768
1280
1440
```

Além disso, teste ao menos:

```text
/sul
/sul/rs/torres
uma página de família
uma página com variante
```

Não basta a home estar bonita.

### 16. Entrega ao final

Retorne:

1. comparação antes/depois;
2. benchmark resumido;
3. screenshots finais;
4. decisões visuais tomadas;
5. mudanças no hero;
6. mudanças na busca;
7. mudanças na página de cidade;
8. mudanças nos products/families/carrosséis;
9. motion utilizado;
10. mobile;
11. Lighthouse;
12. build/lint/unit/e2e;
13. lista de assets ainda necessários;
14. qualquer ponto que você NÃO mudou por considerar o baseline melhor.

Não faça commit nem push.

Não escreva na INK.

Não altere tokens ou remote.

## Critério de saída

A rodada termina quando o conjunto:

```text
/sul
+
cidade
+
família
+
produto real
```

parecer visualmente parte da mesma marca premium, e não apenas uma home bonita conectada a páginas funcionais.

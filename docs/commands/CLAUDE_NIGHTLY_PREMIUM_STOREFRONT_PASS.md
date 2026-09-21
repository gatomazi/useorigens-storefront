# Rodada Noturna — Benchmark visual + refinamento premium do storefront Use Origens

## Contexto

Este comando é um complemento ao comando anterior.

Se o trabalho anterior ainda estiver em execução, termine-o primeiro. Não interrompa, não reverta e não recomece a implementação já feita.

Depois de concluir o milestone anterior, continue automaticamente com esta rodada noturna.

Não espere nova confirmação.
Não faça commit nem push.
Não altere dados na Reserva INK. A integração com a INK continua estritamente read-only.

---

# Objetivo da rodada

A meta desta rodada NÃO é aumentar o escopo funcional do projeto.

A meta é transformar o vertical slice `/sul` em uma experiência visualmente muito mais próxima de uma storefront premium de moda, com:

- direção de arte clara;
- ritmo editorial;
- hero forte;
- fotografia/produto bem apresentado;
- tipografia refinada;
- espaçamento consistente;
- carrosséis bons;
- busca de cidade com acabamento premium;
- microinterações;
- motion sutil;
- mobile realmente projetado;
- estados de loading elegantes;
- headers e navegação bem resolvidos;
- consistência visual entre as seções.

Ao final da rodada, `/sul` deve parecer uma candidata real à storefront pública da Use Origens.

---

# 1. Use Claude in Chrome para fazer benchmark visual real

Use Claude in Chrome para abrir e estudar sites reais de moda/e-commerce.

Não faça apenas leitura do HTML.
Quero análise VISUAL das páginas renderizadas.

Estude pelo menos:

1. Ark Club
2. Kith
3. Fear of God
4. Carhartt WIP
5. Osklen
6. PACE
7. Patagonia
8. Aimé Leon Dore, se estiver acessível

Não copie nenhum desses sites.

O objetivo é entender como marcas maduras resolvem:

- header;
- hero;
- grids;
- produto;
- fotografia;
- ritmo;
- whitespace;
- tipografia;
- carrosséis;
- navegação;
- campanhas;
- editorial;
- mobile;
- transições;
- hierarquia.

---

# 2. O que observar em cada referência

Para cada site, analise:

## Header
- altura;
- densidade;
- sticky behavior;
- uso da logo;
- navegação;
- busca;
- contraste;
- transparência sobre hero ou não;
- mudança após scroll.

## Hero
- altura em relação à viewport;
- relação entre imagem e texto;
- tamanho da tipografia;
- quantidade de copy;
- posição do CTA;
- uso de full bleed;
- crop da fotografia;
- versão mobile;
- movimento.

## Produto
- proporção da imagem;
- quantidade de informação;
- espaçamento;
- nome/preço;
- hover;
- segunda imagem;
- número de itens por viewport;
- navegação de carrossel.

## Editorial
Observe como intercalam:

```text
produto
→ campanha
→ produto
→ história
→ categoria
→ produto
```

Evite uma página composta apenas de:

```text
hero
grid
grid
grid
grid
footer
```

## Tipografia
Analise:
- contraste entre display e body;
- tamanhos;
- uppercase vs sentence case;
- tracking;
- line-height;
- uso de serif/sans;
- headlines grandes vs minimalistas.

## Motion
Observe:
- entradas;
- hover;
- troca de imagem;
- header;
- carrossel;
- reveal;
- scroll behavior.

---

# 3. O que extrair de cada referência

## Ark Club
Use como referência para:
- storefront visual limpa;
- hierarquia de ecommerce;
- hero;
- produto como protagonista;
- carrosséis;
- blocos editoriais;
- percepção de marca antes de catálogo.

Não replique o layout.

## Kith
Observe:
- direção editorial;
- fotografia de campanha;
- mistura de campanha e commerce;
- Shop the Look;
- hierarquia entre coleção e produto;
- densidade visual controlada.

## Fear of God
Observe:
- uso extremo de espaço;
- campanhas full-bleed;
- pouco texto;
- CTAs discretos;
- fotografia dominante;
- minimalismo;
- impacto através da escala.

Não deixe Use Origens austera demais. Extraia apenas confiança visual, escala, silêncio e uso de imagem.

## Carhartt WIP
Referência especialmente útil para:
- hero editorial;
- produtos logo após campanhas;
- lookbooks;
- novas coleções;
- alternância entre lifestyle e ecommerce;
- grid;
- conexão entre cultura e produto.

## Osklen
Observe:
- identidade brasileira premium;
- Made in Brazil;
- minimalismo;
- produto + origem;
- como comunicar identidade brasileira sem parecer souvenir.

## PACE
Observe:
- linguagem brasileira contemporânea;
- streetwear premium;
- tipografia;
- produto;
- grids;
- simplicidade de navegação;
- sensação de marca independente.

## Patagonia
Use principalmente para:
- arquitetura de descoberta;
- navegação;
- histórias;
- categorias;
- mistura commerce/editorial;
- experiência de catálogo grande.

## Aimé Leon Dore
Se acessível, observar:
- editorial;
- composição;
- imagem;
- storytelling;
- produto;
- sensação de coleção;
- fotografia lifestyle.

---

# 4. Produza um benchmark interno antes de alterar o layout

Crie:

```text
docs/design/storefront-benchmark.md
```

Para cada referência registre:

```text
Marca
O que funciona
O que NÃO devemos trazer
Padrão que pode ser reinterpretado
Onde pode entrar na Use Origens
```

No final, sintetize no máximo 10 princípios visuais para Use Origens.

Não transforme isso em relatório enorme. O benchmark deve orientar decisões.

---

# 5. Defina uma direção visual própria

Crie:

```text
docs/design/use-origens-visual-direction.md
```

A experiência deve parecer:

- brasileira;
- contemporânea;
- premium;
- regional;
- humana;
- editorial;
- fashion;
- pertencimento;
- identidade.

Não deve parecer:

- souvenir;
- loja turística;
- marketplace;
- POD;
- SaaS;
- dashboard;
- template genérico;
- cópia da Ark;
- ecommerce de dropshipping.

---

# 6. Conceito visual para `/sul`

Não represente o Sul com clichês turísticos o tempo inteiro.

Evite depender de:
- chimarrão;
- pinhão;
- tainha;
- bandeiras;
- mapas em excesso;
- monumentos óbvios.

O visual da loja deve comunicar Sul principalmente através de:
- direção fotográfica;
- paisagem;
- arquitetura;
- textura;
- luz;
- clima;
- cidades;
- cotidiano;
- pessoas;
- identidade.

---

# 7. Refine o hero

Faça screenshots antes de alterar.

Pergunte:
- existe impacto?
- parece moda?
- parece marca?
- parece campanha?
- existe espaço?
- a imagem está boa?
- a tipografia está grande o suficiente?
- o CTA é claro?
- tem elementos demais?
- parece template?

Prefira:

```text
fotografia/produto forte
+
headline curta
+
uma linha auxiliar
+
1 CTA principal
```

Evite badges e texto excessivo.

---

# 8. Buscador de cidade como feature de marca

Não trate como um input genérico.

Explore algo como:

```text
DE ONDE VOCÊ É?

[ Busque sua cidade...                         ]
```

Resultados:

```text
Tijucas
Santa Catarina · Sul
```

Pode utilizar overlay, command palette, dropdown grande ou sheet no mobile.

No mobile, considere busca full-screen/sheet se melhorar muito a experiência.

---

# 9. Design Families devem ser editoriais

Não quero uma grade monótona de cards idênticos.

Explore:
- carousel grande;
- grid assimétrico;
- destaque de uma família;
- cards com imagem dominante;
- alternância de formatos;
- editorial horizontal;
- primeira família destacada e demais em grid.

A página precisa ter ritmo.

---

# 10. Produtos reais devem elevar a percepção

Use produtos reais da INK.

- imagem grande;
- fundo limpo;
- card quase invisível;
- muito espaço;
- nome claro;
- preço claro;
- hover discreto;
- segunda imagem quando existir;
- motion curto.

Evite border-radius gigante, sombras pesadas, badges demais e excesso de botões.

---

# 11. Insira pelo menos um grande bloco editorial

A storefront precisa respirar entre grids.

Inclua ao menos um bloco grande de campanha:

```text
imagem grande
+
copy curta
+
CTA
```

Conceito de referência:

```text
NÃO É SOBRE O LUGAR NO MAPA.
É SOBRE O LUGAR EM VOCÊ.
```

Não precisa usar essa copy literalmente.

---

# 12. Trabalhe o ritmo vertical

Evite todas as seções repetindo a mesma estrutura.

Alterne:
- full bleed;
- container;
- grid;
- carousel;
- imagem;
- whitespace;
- dark/light section;
- produto;
- manifesto.

---

# 13. Header premium

Experimente:

Estado inicial:
- transparente sobre hero quando houver contraste.

Após scroll:
- background sólido;
- altura levemente menor;
- blur apenas se fizer sentido;
- borda ou sombra mínima.

---

# 14. Motion pass

Depois que o layout estiver forte sem animação, faça motion.

Possíveis efeitos:
- hero copy entrance;
- hero image reveal;
- stagger discreto;
- header transition;
- product image hover;
- carousel;
- city preview crossfade;
- search opening;
- state hover;
- scroll reveal leve.

Regras:

```text
180–500ms na maioria das transições
sem bounce aleatório
sem scroll hijacking
sem parallax pesado
sem animação infinita
```

Suportar `prefers-reduced-motion`.

---

# 15. Mobile-first refinement separado

Faça uma rodada exclusiva para:

```text
375x812
430x932
```

Avalie:
- header;
- logo;
- menu;
- busca;
- hero;
- CTA;
- headlines;
- crop;
- families;
- carrosséis;
- spacing;
- footer;
- sticky UI;
- touch targets.

Pode haver layout diferente do desktop.

---

# 16. QA visual em 3 ciclos

## Ciclo 1 — baseline
Capture:

```text
375
430
768
1280
1440
```

Registre problemas.

## Ciclo 2 — refinement
Corrija:
- hierarquia;
- spacing;
- crop;
- typography;
- grid;
- search;
- carousel;
- hero;
- motion.

Capture novamente.

## Ciclo 3 — polish
Compare qualidade percebida com os benchmarks, sem copiar.

Pergunte:
- parece barato?
- parece template?
- parece POD?
- existe personalidade?
- existe marca?
- primeira dobra tem impacto?
- existe motivo para continuar scrollando?
- busca de cidade é memorável?
- produto está valorizado?

Corrija novamente.

---

# 17. Screenshot archive

Salve em algo como:

```text
docs/design/screenshots/
  benchmark/
  sul-before/
  sul-pass-1/
  sul-pass-2/
  sul-final/
```

Se não for apropriado versionar binários pesados, mantenha fora do Git e documente os caminhos.

---

# 18. Não expanda escopo funcional esta noite

NÃO faça, salvo se necessário para `/sul`:

- `/norte`;
- `/centro-oeste`;
- homepage `/` completa;
- CMS;
- autenticação;
- wishlist;
- carrinho próprio;
- checkout próprio;
- sincronização bidirecional;
- writes na INK;
- backend complexo;
- refatoração ampla sem necessidade.

A noite é para:

```text
/sul
+
cidade
+
design
+
preview
+
transição para INK
+
visual premium
```

---

# 19. Não invente assets finais

Se faltarem fotografias:
1. procure assets existentes;
2. use imagens reais de produto da INK;
3. faça composição forte;
4. marque onde uma fotografia de campanha melhor elevaria o layout.

Não reutilize assets dos benchmarks.

---

# 20. Não redesenhe a marca

Pode melhorar aplicação da logo, tamanho, whitespace, posição e contraste.

Não crie outra logo, símbolo ou branding paralelo.

---

# 21. Performance

Depois do visual:
- confira LCP;
- CLS;
- peso das imagens;
- JS;
- carrosséis;
- fontes;
- preload;
- bibliotecas de motion.

Prefira transform/opacity.

---

# 22. Acessibilidade

Não destrua:
- focus;
- contraste;
- teclado;
- labels;
- reduced motion;
- semântica;
- acessibilidade de carrossel;
- busca via teclado.

---

# 23. Final design review

Antes de encerrar, execute revisão com:
- Frontend Design;
- web-design-guidelines;
- vercel-react-best-practices.

Corrija problemas concretos.

---

# 24. Estado final esperado

```text
marca de roupa
↓
identidade regional
↓
descoberta editorial
↓
cidade
↓
estampa
↓
produto real
↓
INK
```

E não:

```text
aplicação web
↓
filtros
↓
cards
↓
link externo
```

---

# 25. Relatório da manhã

Crie:

```text
docs/design/nightly-visual-pass.md
```

Inclua:

## Benchmark
- sites estudados;
- principais aprendizados;
- princípios escolhidos.

## Mudanças
- hero;
- header;
- search;
- families;
- product presentation;
- editorial;
- motion;
- mobile;
- footer.

## Screenshots
Liste os caminhos.

## Dados reais
- cidade usada;
- families disponíveis;
- produtos INK;
- destino real testado.

## Qualidade
- build;
- lint;
- tests;
- Lighthouse/performance se executado;
- accessibility review.

## Pendências
Separe em:
- bloqueio;
- melhoria futura;
- asset necessário.

## Assets que devemos produzir
Descreva precisamente cada asset necessário, por exemplo:

```text
Hero Sul desktop
1440x900 ou maior
modelo real
camiseta visível
espaço negativo à esquerda
luz natural editorial
sem texto aplicado na fotografia
```

---

# 26. Regra de autonomia

Pode decidir:
- spacing;
- typography;
- layout;
- motion;
- grid;
- component composition;
- responsive behavior;
- apresentação visual.

Não decida:
- preços;
- catálogo;
- consolidação de lojas;
- checkout;
- regras comerciais;
- exclusão de produtos;
- writes na INK;
- branding estrutural.

Se houver incerteza funcional não bloqueante, documente e continue.

---

# 27. Encerramento

Não faça commit.
Não faça push.
Não escreva na API da INK.
Não altere tokens.
Não mude remotes.
Não exponha credenciais.

Termine com:

1. `/sul` executável;
2. fluxo cidade → produto → INK funcionando;
3. três ciclos de QA visual;
4. screenshots;
5. benchmark documentado;
6. direção visual documentada;
7. relatório noturno;
8. build/lint/test status;
9. lista precisa de assets que ainda precisamos criar.

O principal critério desta rodada é qualidade percebida.

Não pare no primeiro layout funcional.

Refine até que a storefront pareça intencional, consistente, premium e própria da Use Origens.

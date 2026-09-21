# Use Origens V2 — Comando compilado

Este documento reúne em uma única instrução:

- implementação V2 do `/sul`;
- regionalismo real;
- mobile-first com prioridade absoluta;
- busca como principal feature;
- refinamento visual;
- preparação para banners regionais;
- arquitetura da raiz `/`;
- plano futuro de Norte e Centro-Oeste;
- documentação final de produção de banners.

Use este arquivo como comando principal. Os arquivos anteriores passam a ser referência histórica e não precisam ser enviados separadamente.

---

# Implementação V2 Sul — Regionalismo real + Mobile First

## Status

O plano `docs/design/sul-v2-regional-plan.md` está aprovado como base de implementação.

A arquitetura funcional atual também está aprovada:

```text
/sul
→ busca
→ estado/cidade
→ família
→ variante
→ produto real
→ CTA real para INK
```

A V2 deve melhorar principalmente:

```text
identidade regional
+
refinamento visual
+
mobile
```

Não reescrever:

- parser;
- indexer;
- resolver;
- commerce mapping;
- integração INK;
- binding;
- ranking;
- rotas;
- regras de localidade;

salvo correção necessária de regressão real.

Não fazer commit nem push ainda.
A INK continua read-only.

---

# 1. Diretriz principal

O projeto passa a ser tratado como:

```text
mobile-first commerce experience
```

e não:

```text
desktop storefront responsiva
```

Dado de negócio:

```text
~90% dos acessos são mobile
```

Portanto:

```text
MOBILE = experiência principal
DESKTOP = expansão da experiência mobile
```

Toda decisão deve ser validada primeiro em:

```text
375
390
430
```

e somente depois em:

```text
768
1280
1440
```

---

# 2. Direção emocional

A busca de cidade é o principal motor funcional.

O regionalismo é o principal motor emocional.

A pessoa precisa entrar no `/sul` e pensar:

> “Isso é daqui mesmo.”

Se removermos a palavra “Sul”, ainda deve restar identidade regional por meio de:

- cidades;
- DDDs;
- linguagem real;
- curadoria;
- produtos;
- microcontexto;
- geografia;
- cotidiano;
- contexto.

Não depender apenas de:

- mapas;
- bandeiras;
- dourado;
- símbolos folclóricos.

---

# 3. Decisões aprovadas para esta implementação

## 3.1 Hero

Implementar **Direção A agora**:

```text
“De qual Sul você é?”
```

com:

- três camisetas reais de DDD/geografia;
- uma por estado;
- busca dentro da primeira dobra;
- sem depender de fotografia lifestyle nova.

A estrutura deve ficar pronta para futuramente trocar a composição de produto por fotografia lifestyle (Direção B), sem refazer o layout inteiro.

### Produtos de referência

Usar produtos reais, preferencialmente:

- 054 — Serra Gaúcha;
- 048 — Grande Florianópolis;
- 041 — Grande Curitiba;

ou equivalentes reais que melhor funcionarem visualmente.

Não inventar produto.

### Risco

DDD não pode ficar críptico.

Sempre mostrar o contexto da região junto do número.

Exemplo:

```text
054
Serra Gaúcha
```

---

## 3.2 Busca

A busca vai para a primeira dobra.

No mobile, deve ser ainda mais central.

Fluxo:

```text
De qual Sul você é?

[ Busque sua cidade... ]
```

Ao tocar:

```text
full-screen search sheet
```

ou solução equivalente de alta qualidade.

Resultados devem carregar microcontexto automático e factual:

```text
Florianópolis
Santa Catarina · Grande Florianópolis
```

ou:

```text
Florianópolis
Santa Catarina · 048
```

somente quando o dado existir.

Não inventar.

---

## 3.3 Agrupamento geográfico

Usar como base inicial:

```text
A1 = mesorregião oficial IBGE e/ou DDD
```

Não usar ainda como estrutura oficial:

```text
Litoral
Serra
Interior
Campo
Fronteira
```

Esses agrupamentos editoriais continuam:

```text
PROPOSTA PARA VALIDAÇÃO FUTURA
```

A vantagem de A1:

- factual;
- escalável;
- reutilizável nas outras regiões;
- baixo risco de clichê;
- pouca manutenção manual.

---

## 3.4 Cidades

Substituir o muro atual de cidades por combinação:

```text
A1 + C
```

Ou seja:

```text
geografia factual
+
descoberta contínua
```

Com microcontexto automático.

Não manter apenas uma lista plana de 24 cidades.

Pode existir uma pequena camada B:

```text
3–4 cidades em destaque
```

somente quando houver conteúdo real suficiente.

---

## 3.5 Camadas editoriais que entram na home

Prioridade editorial aprovada:

### Alta prioridade

- DDD;
- Dizeres;
- Expressões de cidade;
- estaduais mais limpas:
  - Clean;
  - Minimal;
  - Escritas;
  - Atlas.

### Média prioridade

- Padroeiros;
- produtos estaduais sem bandeira dominante.

### Não priorizar na home

- Pocket;
- Clube;
- Treino;
- paródias;
- Vida no Sul;
- Lenda;
- linhas muito folclóricas;
- Made In com bandeira como elemento central.

Isso não remove nenhum produto do catálogo.

É apenas curadoria editorial.

---

# 4. Dizeres / “Fala daqui”

Criar uma camada editorial baseada nos **Dizeres reais**.

Não criar a coleção fictícia “Fala Daqui” se ela não existe no catálogo.

Pode usar o título editorial:

```text
FALA DAQUI
```

como nome de seção, desde que o conteúdo venha de produtos reais da linha Dizeres.

Não fazer do Sul inteiro uma caricatura de “bah”.

Equilibrar os três estados.

Toda expressão deve aparecer com contexto.

Exemplo:

```text
“Tá frio né”
Curitiba · PR
```

e não:

```text
“Tá frio né”
Sul
```

---

# 5. Página de cidade V2

A página precisa ir além de:

```text
nome + mapa + produtos
```

Sem reescrever rotas/resolver.

## Ordem recomendada

```text
breadcrumb
cidade
estado · mesorregião/DDD
famílias disponíveis
fala da cidade, quando existir
localidades, quando existirem
cidades da mesma região
```

Remover H2 repetitivo que repete o nome da cidade.

Exemplo:

```text
TORRES
Rio Grande do Sul · Metropolitana/Litoral/etc factual

Estilos
```

e não:

```text
TORRES
...
ESCOLHA COMO VESTIR TORRES
```

---

# 6. “Fala de <cidade>”

Quando o catálogo possuir produtos reais de:

- expressão de cidade;
- padroeiro;
- equivalentes mapeados com segurança;

pode existir módulo:

```text
FALA DE FLORIANÓPOLIS
```

ou equivalente.

Regras:

- não inferir homônimos;
- não adivinhar;
- respeitar as duas convenções de nome existentes;
- “São João Batista” e outros casos ambíguos precisam de validação determinística.

Se não houver conteúdo real:

```text
não mostrar a seção
```

---

# 7. Localidades

Hoje “Também de Torres” fica visualmente incompleto com um único item.

Mudar tratamento para algo menor e mais contextual.

Exemplo:

```text
LUGARES DE TORRES

Praia Paraíso
```

Não criar uma grande seção vazia.

A modelagem permanece:

```text
parentCityId = Torres
localityLabel = Praia Paraíso
```

---

# 8. Estados

Remover a sensação de:

```text
grande parede dourada
+
três caixas pesadas
```

Dourado passa a ser:

```text
acento
```

e não superfície dominante.

Implementar inicialmente uma mistura de:

```text
E1 + E3
```

### E1

Estado + produto estadual limpo.

Usar:

- Clean;
- Minimal;
- Escritas;
- Atlas;

quando existir.

Evitar usar Made In com bandeira como representação principal do estado.

### E3

Mostrar regiões oficiais/atalhos por mesorregião ou DDD.

No mobile, não empilhar três painéis gigantes.

Preferir:

```text
carousel horizontal
```

ou cards mais compactos.

A seção não deve consumir 1.400 px de altura.

---

# 9. Página de estado V2

Trocar a página A–Z gigante por:

```text
busca
+
mesorregiões/DDD
+
cidades agrupadas
```

A-Z pode continuar como modo secundário.

No mobile:

- atalhos por grupo;
- busca no topo;
- listas colapsáveis ou agrupadas;
- evitar 12.000 px de página linear.

---

# 10. Regionalismo

Não usar como base:

## Sul
- chimarrão;
- pinhão;
- tainha;
- CTG;
- araucária;
- churrasco;
- bombacha.

Esses produtos continuam no catálogo.

Mas a storefront deve comunicar Sul principalmente por:

- cidade;
- DDD;
- linguagem real;
- clima;
- cotidiano;
- geografia;
- produto;
- contexto.

Símbolos podem entrar em produto.

Não podem sustentar sozinhos a home.

---

# 11. Tom de linguagem

Regra:

```text
UX funcional = clara e neutra
editorial/campanha = regional
```

## Funcional

Manter neutro:

- Buscar cidade
- Escolher estilo
- Ver na loja
- Escolher tamanho na loja
- Estados
- Voltar
- Buscar

## Editorial

Pode carregar regionalismo:

- hero;
- campanha;
- dizeres;
- cidades em destaque;
- títulos de coleção.

Nunca regionalizar toda a interface.

---

# 12. Visual Refinement V2

Além do regionalismo, suavizar o visual atual.

O problema atual:

```text
brutalismo demais
+
Big Shoulders em excesso
+
muitos blocos pretos
+
dourado chapado
+
muito underline
+
muitas seções gritando
```

Direção V2:

```text
editorial
premium
contemporâneo
regional
mais calmo
mais produto
mais respiro
```

---

# 13. Tipografia

Manter:

```text
Big Shoulders
Hanken Grotesk
Bodoni Moda
```

Mas mudar distribuição.

## Big Shoulders

Usar em:

- hero;
- city H1;
- alguns títulos fortes.

Não usar como resposta automática para todos os headings.

## Hanken

Ganhar protagonismo em:

- navegação;
- títulos menores;
- produto;
- preço secundário;
- labels;
- interface.

## Bodoni

Usar como acento editorial em:

- lugar;
- subtítulo;
- microcontexto;
- cidade.

---

# 14. Hero mobile

Mobile é prioridade.

Não adaptar apenas o desktop.

Em 375–430:

```text
headline
busca
produto
```

devem aparecer cedo.

Evitar:

```text
headline enorme
+
2 CTAs empilhados
+
produto
+
busca depois
```

### CTA

Ter no máximo:

```text
1 ação principal
```

Secondary CTA vira link ou desaparece.

---

# 15. Design Families mobile

Prioridade dos cards:

```text
imagem
nome
preço
```

Descrição é secundária.

Se competir:

```text
reduzir
ou remover no mobile
```

Não obrigar 2 colunas se a leitura ficar ruim.

Mas manter 2 colunas onde produto/título/preço funcionarem bem.

---

# 16. Produto / PDP mobile

A ordem mobile deve ser:

```text
contexto
produto
versão
preço
CTA
nota curta
outros estilos
```

O CTA precisa ficar próximo de imagem/preço.

Considerar sticky CTA apenas se testes mostrarem ganho.

Não implementar sticky automaticamente.

---

# 17. Header mobile

Prioridade:

```text
menu
logo
busca
```

Corrigir o bug do botão invisível.

Não adicionar ícones desnecessários.

Header não deve consumir altura excessiva.

---

# 18. Busca mobile

Testar com teclado virtual aberto.

Validar:

- input visível;
- resultados visíveis;
- scroll;
- close;
- foco;
- safe area;
- retorno.

Usar:

```css
env(safe-area-inset-top)
env(safe-area-inset-bottom)
```

quando necessário.

---

# 19. Mobile QA obrigatório

Validar manualmente primeiro em:

```text
360×780
375×812
390×844
412×915
430×932
```

Depois desktop.

Páginas obrigatórias:

```text
/sul
cidade
família
variante
estado
busca aberta
menu aberto
```

Capturar:

- full page;
- primeira dobra.

---

# 20. Interações mobile

Testar:

- menu abrir/fechar;
- busca abrir;
- digitar;
- escolher resultado;
- voltar;
- swipe no carousel;
- trocar variante;
- CTA para INK;
- scroll longo;
- teclado virtual;
- touch targets.

Tap target mínimo:

```text
44×44
```

---

# 21. Performance mobile

Manter foco em:

```text
LCP < 2.5s p75
CLS < 0.1
INP < 200ms
```

Testar em:

- Fast 4G;
- Slow 4G;
- CPU slowdown.

A V2 não pode melhorar estética e piorar perceptivelmente o mobile.

---

# 22. Fotografia

Não bloquear a V2 pela falta de foto.

Implementar agora o que funciona sem novos assets:

- hero A;
- DDD;
- Dizeres;
- estados;
- geografia;
- cidade V2;
- busca;
- hierarquia visual.

Preparar slots para fotografia futura.

Quando assets chegarem:

```text
hero B
campanha
estados
cidade cotidiana
hover
```

podem entrar sem refazer a arquitetura.

---

# 23. Bugs obrigatórios nesta rodada

Corrigir:

1. Busca invisível em páginas de estado/404.
2. Botão de fechar invisível no menu mobile.

Adicionar cobertura de teste se necessário.

---

# 24. Não fazer ainda

Não iniciar:

```text
/norte
/centro-oeste
/
```

Não iniciar:

- Postgres;
- CMS;
- wishlist;
- carrinho;
- checkout;
- sitemap completo;
- analytics;
- redirects;
- consolidação INK;
- mudança de preços.

Primeiro acertar definitivamente o sistema regional no Sul.

---

# 25. Ordem de implementação

Executar nesta ordem:

## Passo 1
Bugs + mobile shell.

## Passo 2
Hero A mobile-first + busca na primeira dobra.

## Passo 3
Estados E1/E3.

## Passo 4
DDD + Dizeres na home.

## Passo 5
Muro de cidades A1/C.

## Passo 6
Página de estado V2.

## Passo 7
Página de cidade V2.

## Passo 8
PDP/família refinada.

## Passo 9
Polish visual desktop.

---

# 26. QA

Fazer no mínimo 3 passes:

```text
mobile baseline
→ mobile refinement
→ desktop expansion/polish
```

Não fazer o contrário.

---

# 27. Screenshots

Gerar:

```text
docs/design/screenshots/sul-v2/
```

Para:

```text
375
390
430
768
1280
1440
```

Comparativos:

```text
before-vs-v2-home-375
before-vs-v2-home-1440
before-vs-v2-city-375
before-vs-v2-city-1440
before-vs-v2-pdp-375
before-vs-v2-pdp-1440
```

---

# 28. Critério de aprovação

A V2 só está pronta se:

## Mobile

- parece premium;
- parece Sul;
- busca é protagonista;
- cidade é fácil de encontrar;
- produto é legível;
- navegação é confortável;
- não há seções infladas;
- o caminho para INK é rápido.

## Regionalismo

Se remover a palavra “Sul”:

```text
ainda existe Sul
```

por:

- DDD;
- cidades;
- linguagem;
- curadoria;
- contexto;
- produto.

## Visual

Não parece:

- souvenir;
- streetwear brutalista demais;
- site genérico;
- catálogo POD;
- dashboard.

---

# 29. Entrega

Ao terminar, retorne:

1. resumo da V2;
2. screenshots mobile first;
3. screenshots desktop;
4. hero final;
5. busca final;
6. DDD utilizado;
7. Dizeres utilizados;
8. tratamento dos estados;
9. novo muro/descoberta de cidades;
10. página de estado;
11. página de cidade;
12. PDP/família;
13. bugs corrigidos;
14. Lighthouse mobile/desktop;
15. unit/e2e/lint/tsc/build;
16. regressões;
17. assets que ainda faltam;
18. pontos que ainda precisam de validação editorial.

Não faça commit nem push até revisão.


---

# ADDENDUM INTEGRADO — BANNERS REGIONAIS + STOREFRONT RAIZ `/`

# Addendum — Banners regionais + Storefront raiz `/`

Este addendum complementa a implementação V2 da Use Origens.

Ele NÃO substitui as decisões anteriores sobre:

- mobile-first;
- busca como eixo principal;
- regionalismo real;
- Sul como baseline;
- integração INK read-only;
- ausência de commit/push até revisão.

---

# 1. Banners passam a ser ferramenta principal de identidade regional

A partir desta fase, considerar que **banners/editoriais com fotografia e direção de arte regional serão a principal ferramenta visual para dar “cara de região” à storefront**.

A estrutura e os componentes continuam compartilhados.

A diferenciação emocional das regiões virá principalmente de:

- banners;
- fotografia;
- ambientação;
- copy editorial;
- cidades;
- produtos destacados;
- linguagem local;
- curadoria.

Não depender apenas de:

- paleta;
- mapa;
- nome da região;
- logo;
- DDD.

Esses elementos continuam úteis, mas os banners serão a camada visual mais forte.

---

# 2. Não bloquear a V2 atual por falta de banners

A implementação deve continuar funcionando sem assets novos.

Enquanto os banners definitivos não existirem:

- usar produto real;
- usar composição tipográfica;
- usar imagens existentes;
- criar slots com proporção e comportamento finais;
- evitar placeholders genéricos feios.

A UI deve ficar pronta para receber os banners depois sem refazer estrutura.

---

# 3. Criar um sistema de slots editoriais reutilizáveis

Definir componentes/slots claros para banners.

Exemplo conceitual:

```text
HeroBanner
RegionalEditorialBanner
StateBanner
CollectionBanner
CityEditorialBanner
CampaignBanner
```

Não precisa usar exatamente esses nomes.

O importante é haver tipos claros com:

- desktop asset;
- mobile asset;
- alt text;
- heading opcional;
- body opcional;
- CTA opcional;
- alignment;
- overlay;
- crop/focal point;
- região;
- destino.

---

# 4. Mobile e desktop precisam de assets próprios

Não assumir que o mesmo banner funciona em qualquer tela.

Para cada slot importante, prever:

```text
desktop landscape
mobile portrait
```

ou crop/focal point separado.

Como ~90% do tráfego é mobile, o asset mobile deve ser tratado como principal.

A especificação deve sempre começar pelo mobile.

---

# 5. Documento obrigatório de produção de banners

Ao final da implementação visual e antes de considerar a fase concluída, criar:

```text
docs/design/regional-banner-production-plan.md
```

Esse documento será usado para gerar os banners posteriormente diretamente no ChatGPT.

Ele precisa responder exatamente:

> Quantos banners precisamos criar para cada região e para a raiz?

---

# 6. Estrutura do documento de banners

Organizar por:

```text
ROOT / USE ORIGENS
SUL
NORTE
CENTRO-OESTE
```

Para cada uma, listar:

```text
Banner
Objetivo
Página/posição
Mobile/desktop
Dimensão recomendada
Aspect ratio
Conteúdo
Composição
Pessoa/produto
Espaço negativo
Copy sobreposta ou não
CTA
Focal point
Direção de luz
Cenário
O que evitar
Prioridade
Reutilizável?
```

---

# 7. Entregar contagem final

No início do documento, criar um resumo:

```text
ROOT
- X banners únicos
- Y arquivos finais considerando mobile + desktop

SUL
- X banners únicos
- Y arquivos finais

NORTE
- X banners únicos
- Y arquivos finais

CENTRO-OESTE
- X banners únicos
- Y arquivos finais

TOTAL
- X conceitos
- Y arquivos finais
```

Diferenciar:

```text
conceito/banner
```

de:

```text
arquivo final/crop
```

Exemplo:

```text
1 hero = 1 conceito
mas
hero desktop + hero mobile = 2 arquivos finais
```

---

# 8. Não inflar desnecessariamente a quantidade

Não quero dezenas de banners só porque existem muitos slots.

Priorizar o mínimo necessário para dar identidade forte.

Classificar:

```text
ESSENCIAL
IMPORTANTE
FUTURO
```

O documento deve dizer qual é o **mínimo de produção** para lançar cada região com boa percepção de marca.

---

# 9. Storefront raiz `/`

Não esquecer que:

```text
https://www.useorigens.com.br/
```

é uma storefront própria.

Ela NÃO é:

- `/sul`;
- redirect automático;
- tela neutra sem personalidade;
- página apenas com três links.

A raiz é a marca Use Origens.

---

# 10. Papel da raiz

A home `/` deve responder:

```text
O que é Use Origens?
+
De onde você é?
+
Qual região você quer explorar?
```

A busca global de cidade é um dos elementos principais.

---

# 11. Estrutura conceitual da raiz

Pensar em algo aproximadamente assim:

```text
HEADER USE ORIGENS

HERO MASTER
“QUAL É A SUA ORIGEM?”

[ BUSQUE SUA CIDADE ]

DIVISÓRIAS REGIONAIS

SUL
[ banner regional ]
[ explorar o Sul ]

NORTE
[ banner regional ]
[ explorar o Norte ]

CENTRO-OESTE
[ banner regional ]
[ explorar o Centro-Oeste ]

EDITORIAL DA MARCA

FOOTER
```

Não implementar exatamente assim se surgir composição melhor.

Mas a ideia de **divisórias claras de região** é obrigatória.

---

# 12. Divisórias regionais da raiz

Cada região precisa aparecer como uma “porta de entrada” visual.

Não usar apenas cards pequenos.

As divisórias devem ter presença.

Podem ser:

- banners full-width alternados;
- painéis grandes;
- scroll editorial;
- cards horizontais grandes;
- mosaico assimétrico.

Cada bloco regional deve transmitir imediatamente sua personalidade.

---

# 13. Busca global na raiz

Na rota `/`, a busca deve ser global.

Exemplo:

```text
Busque sua cidade...
```

Ao encontrar:

```text
Tijucas
Santa Catarina · Sul
```

deve levar para:

```text
/sul/sc/tijucas
```

Exemplo:

```text
Belém
Pará · Norte
```

leva para:

```text
/norte/pa/belem
```

Exemplo:

```text
Goiânia
Goiás · Centro-Oeste
```

leva para:

```text
/centro-oeste/go/goiania
```

Não duplicar lógica.

Usar o índice existente/expandido.

---

# 14. A raiz não deve favorecer visualmente uma região

A Use Origens precisa parecer marca-mãe.

Evitar usar a paleta do Sul como base dominante.

A raiz deve ter identidade neutra da marca e deixar cada bloco regional carregar seu próprio acento.

---

# 15. Relação visual raiz → região

A pessoa precisa perceber:

```text
Use Origens
↓
Sul
```

como mesma marca.

Mas `/sul` deve ter muito mais personalidade regional.

A raiz apresenta.

A região mergulha.

---

# 16. Banners da raiz

A raiz provavelmente precisará de:

- 1 hero master;
- 1 banner Sul;
- 1 banner Norte;
- 1 banner Centro-Oeste;
- 1 bloco editorial institucional opcional.

Validar no layout final.

Não assumir quantidade final antes do design.

O documento de produção deve fechar esse número.

---

# 17. Banners regionais

Cada região provavelmente terá, no mínimo:

- hero regional;
- bloco editorial/campanha;
- estados ou território;
- coleção regional;
- possível banner de cidade.

Mas novamente:

não fixar número final agora.

Primeiro desenhar o sistema.

Depois documentar a necessidade real.

---

# 18. Fotografias e geração futura via ChatGPT

Como os banners serão gerados depois via ChatGPT, o documento final deve ser suficientemente detalhado para virar prompt.

Para cada asset, escrever um mini-briefing reutilizável.

Exemplo:

```text
SUL — HERO MOBILE

Objetivo:
Apresentar identidade regional contemporânea.

Dimensão:
1440×1800 ou maior, 4:5.

Cena:
Pessoa adulta brasileira usando camiseta de cidade,
em rua urbana do Sul em dia nublado.

Composição:
Sujeito no terço inferior/direito.
Espaço negativo superior/esquerdo para headline.

Luz:
Natural difusa.

Evitar:
ponto turístico óbvio,
chimarrão,
bandeira,
roupa típica,
cara de banco de imagens.
```

---

# 19. Criar arquivo de prompts base

Além do plano de produção, criar:

```text
docs/design/banner-generation-prompts.md
```

Para cada banner essencial, gerar um prompt-base pronto para uso no ChatGPT.

Separar:

```text
ROOT
SUL
NORTE
CENTRO-OESTE
```

Não gerar imagens agora.

Apenas prompts.

---

# 20. Root architecture — preparar agora, implementar na hora certa

Mesmo que a implementação imediata esteja focada no Sul, a arquitetura de componentes deve considerar a raiz.

Não criar componente Sul-hardcoded que depois impeça `/`.

O sistema deve permitir:

```text
RootStorefront
RegionalStorefront
CityStorefront
Product/FamilyPage
```

ou equivalente.

Não precisa criar essas classes/componentes literalmente.

É uma regra de arquitetura.

---

# 21. Ordem futura de implementação

A sequência passa a ser:

```text
1. finalizar V2 Sul
2. validar visual e mobile
3. criar sistema regional compartilhado
4. implementar Norte
5. implementar Centro-Oeste
6. implementar raiz `/`
7. criar/gerar banners finais
8. inserir assets finais
9. SEO / analytics / redirects
```

Se for tecnicamente mais eficiente criar parte da raiz antes, documentar.

Mas não sacrificar a validação do Sul.

---

# 22. Documento final da fase

Ao final da fase visual/regional, entregar:

```text
docs/design/regional-banner-production-plan.md
docs/design/banner-generation-prompts.md
```

E também informar no retorno:

1. quantos banners únicos para a raiz;
2. quantos para Sul;
3. quantos para Norte;
4. quantos para Centro-Oeste;
5. quantos arquivos finais considerando mobile/desktop;
6. quais são essenciais;
7. quais podem esperar;
8. quais banners podem ser reutilizados;
9. quais precisam de produção regional única;
10. quais slots já estão preparados no código.

---

# 23. Critério de qualidade

Quando o usuário entrar em:

```text
/
```

deve sentir:

> “Aqui eu escolho minha origem.”

Quando entrar em:

```text
/sul
```

deve sentir:

> “Isso é daqui.”

E o mesmo deve funcionar no futuro para:

```text
/norte
/centro-oeste
```

A regionalização visual deve vir principalmente da soma de:

```text
banner
+
fotografia
+
cidade
+
curadoria
+
produto
+
linguagem
```

e não de trocar apenas cor, logo ou mapa.


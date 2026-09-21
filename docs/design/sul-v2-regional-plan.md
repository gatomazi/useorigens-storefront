# Plano V2 Regional do Sul

> **Nota (gate final):** este plano fala em mesorregiões do IBGE. Essa divisão foi descontinuada em 2017; o site agora usa as Regiões Geográficas Intermediárias. Ver `docs/decisions/0002-ibge-2017-intermediate-regions.md`. Onde este texto disser "mesorregião", ler "região intermediária".

Status: **plano, sem implementação**. Nenhum código, CSS, conteúdo, parser, indexer, resolver, mapeamento de
comércio, rota ou integração INK foi alterado para produzi-lo.
Base: `/sul` de produção (`docs/design/current-visual-review.md`) e a direção
`docs/commands/USE_ORIGENS_REGIONAL_IDENTITY_DIRECTION.md`.

Regra de leitura: tudo marcado **PROPOSTA PARA VALIDAÇÃO** é hipótese minha, não fato aprovado. Nada disso vai
para a tela sem a sua confirmação, principalmente agrupamentos geográficos, expressões atribuídas a estados e
escolha de cidades.

Fonte dos dados de catálogo: snapshot de 2026-09-21 da loja Use Sul (produtos publicados e visíveis: 9.834; 244 fora
das oito famílias). Volumes de vendas são os `total_sales_count` da INK e só existem para esses 244; não temos vendas
por cidade.

---

## 1. Avaliação por bloco (dois eixos)

Teste central aplicado em cada linha: *se eu remover a palavra "Sul", ainda sobra algo que comunica a região?*
**Superficial** = mapa + nome do estado + cor regional. **Mais profundo** = cidade + cotidiano + curadoria +
linguagem + produto + contexto.

| Bloco | É premium? | Parece Sul? | Problema atual | Direção V2 |
|---|---|---|---|---|
| **Announcement** | Sim, discreto e correto | Não. Sem "Sul" sobra só a contagem de cidades. Neutro por escolha | Nada regional; mas também não usa o espaço para a ponte de marca | Manter funcional. Alternar com a ponte: "A experiência regional da Use Sul, agora dentro da Use Origens" (PROPOSTA PARA VALIDAÇÃO) |
| **Header** | Sim, com ressalvas (links sublinhados o tempo todo; logo regional de 36 px vira mancha) | Não, e não precisa: é base da marca | Barra carregada; efeito "transparente no topo" quase imperceptível | Camada global. Só ajustes de acabamento; a região aparece no seletor e no acento |
| **Hero** | Sim na tipografia; pesa pela escala e pelo ritmo irregular das linhas | Superficial. Sem "Sul" sobra uma cidade (Florianópolis) em três camisetas e nenhum contexto | Produto sem cenário; copy serve a qualquer região; camisetas pequenas diante da headline | Três direções (seção 7). Recomendada para agora: direção A, sem fotografia nova |
| **Busca** | Sim, é o gesto mais distintivo | Parcial: 1.191 cidades reais do Sul são regionalismo profundo em dados, mas a apresentação é neutra | Abaixo da primeira dobra; placeholder cinza parece desabilitado; sem contexto por resultado | Subir para a primeira dobra; resultados com microcontexto automático (mesorregião, DDD) |
| **Design Families** | Sim, com hierarquia (destaque + bloco) | Parcial. É a linguagem do produto, não da região; a cidade é o conteúdo. Sem "Sul" fica "Florianópolis" | Escala invertida na última linha; preços repetidos; textos pequenos | Sistema base (global). Regional é a cidade escolhida e o par "Ponto de Origem / Florianópolis" |
| **Estados** | Sim, faixa dourada forte | Superficial: mapa + nome + número + cor | Painéis com vazio interno; nada além do contorno | Tratamentos E1–E3 (seção 6) |
| **Mais vendidos** | Parcial: pôsteres fortes, mas destoam do sistema | Superficial e fácil: o que mais vende hoje é "Made in" com bandeira | Cores saturadas isoladas; a seção mostra a linha mais previsível | Separar "mais vendidos" (dado) de coleções (curadoria); ver Made In |
| **Editorial / muro de cidades** | Sim, mas grita (48 px) e compete com o título | Parcial: cidades reais, mas em lista aleatória de "grandes" | Sem geografia nem contexto; parece índice | Alternativas A/B/C (seção 5) |
| **Made In / coleções** | Parcial | Fácil/superficial (bandeiras) e ainda pouco explorado: as camadas autênticas do catálogo não aparecem | O catálogo tem Dizeres, DDD, expressões de cidade e padroeiros; a home mostra bandeiras | Camadas editoriais reais (seção 4) |
| **Footer** | Sim, simples | Não | Texto legal pequeno; um único link social | Base global; incluir ponte de marca |
| **Página de cidade** | Sim no título; pesa no H2 repetido e no card gigante | Superficial: nome + contorno + produtos. Sem "Sul" sobra o nome da cidade | Nome e preço do destaque abaixo da dobra; "Também de" vazio; vizinhas por ordem alfabética | Seção 9 |
| **Página de família/produto** | Sim, limpa; fina como PDP | Não: é neutra. A região só aparece no nome da cidade | Nome da família mais alto que preço e CTA; sem contexto local | Manter estrutura; adicionar contexto da cidade (fala, DDD) quando existir |
| **Variante** | Sim, discreta | Não | O botão "Regional" não explica a diferença (a arte muda o texto, ex.: "Lá de Pato Branco, daí") | Rotular pelo que a arte diz, sem inventar; copy de variante vem do dado real |
| **Página de estado** | Não: lista A–Z de 295 cidades, contorno gigante no celular | Superficial | Busca invisível (BUG); página de 12.410 px no celular | Agrupar por mesorregião oficial; atalhos; bloco editorial curto |
| **Mobile** | Parcial: fluido, mas denso e longo | Superficial | Hero com produto pequeno; menu sem botão de fechar visível (BUG) | Busca na primeira dobra; sheet completo; rever ordem de blocos |

### Cinco maiores falhas regionais atuais
1. **Sem "Sul", quase nada resta.** A identidade regional é nome + contorno + dourado (que vem da logo, não de contexto).
2. **Nenhum cotidiano, nenhuma cidade "de verdade", nenhuma pessoa.** O hero mostra uma cidade em camisetas sem cenário.
3. **A linguagem regional que o catálogo já tem não aparece.** Dizeres, DDDs, expressões de cidade e padroeiros estão fora da home.
4. **Cidades como lista.** Muro de 24 nomes sem geografia nem microcontexto; página de estado A–Z.
5. **O que aparece em destaque como "Sul" é o regionalismo fácil** (Made in com bandeiras) e a copy é genérica ("Vista de onde você é", "Não é sobre o lugar no mapa") e serviria a qualquer região.

### Cinco maiores forças atuais
1. **A busca de cidade como eixo**: distintiva, com cobertura real (1.191 municípios).
2. **Cidade → estilo → produto com dados reais**, incluindo localidades (Praia Paraíso em Torres) e variantes reais.
3. **Sistema visual coeso** entre home, cidade e produto (a tipografia ecoa a arte das camisetas).
4. **UX funcional clara e neutra** (Buscar cidade, Escolher tamanho na loja), como a direção pede.
5. **O catálogo já tem camadas regionais autênticas** ainda sem uso editorial (seção 4): é o maior ganho disponível sem fotografia.

---

## 2. Regionalismo real vs superficial (o que a V2 precisa trocar)

| Superficial (hoje) | Mais profundo (V2) |
|---|---|
| Contorno + nome do estado + dourado | Cidade + microcontexto (mesorregião, DDD) + fala local + produto |
| Made in com bandeiras como "o Sul" | DDD como geografia; Dizeres como linguagem; expressões de cidade como humor local |
| "Vista de onde você é" | Uma frase que só funciona no Sul (ver hero, seção 7) |
| Muro de cidades "grandes" | Geografia editorial (litoral/serra/campo ou mesorregiões oficiais) |
| Uma foto de camiseta de Florianópolis | Cotidiano de cidade, luz, tempo, roupa (fotografia, seção 10) |

---

## 3. O que já vale sem validação

Fatos verificáveis, sem julgamento editorial: números de cidades por estado, mesorregiões oficiais do IBGE (seção 5),
DDDs presentes em produtos reais, nomes de produtos e vendas da INK.

---

## 4. Camadas editoriais reais do catálogo (Loja Use Sul)

Marcar: **P** = potencial na home, **R** = risco de clichê (baixo / médio / alto). "Vendas" = soma de vendas dos
produtos da camada. Nenhum destes itens é excluído do catálogo: aqui trata-se só de **destaque editorial na home**.

| Camada | Exemplos reais | Volume | Vendas | Potencial e onde entra | Risco de clichê |
|---|---|---|---|---|---|
| **Dizeres** (o "Fala Daqui" que existe) | "tongo.", "ô piá.", "bah.", "Guriazinha", "Talvez esteja em Jaraguá" | 36 | 59 | **Alto.** Linha "Fala daqui" na home e no contexto de cidade/estado. Tipografia limpa, premium | **Médio.** Bom por ser fala real; perigo de o Sul virar só "bah" (RS). Precisa de equilíbrio entre os três estados |
| **DDD** (geografia em número) | "ZERO CINCO QUATRO — Serra Gaúcha", "ZERO QUATRO OITO — Grande Florianópolis", "Litoral Paranaense 041" | 17 | 24 | **Alto.** É o regionalismo mais original que existe: geografia + design elegante (Didone). Base do muro de cidades e do hero A | **Baixo.** Nada de símbolo; risco é ser críptico para quem é de fora |
| **Expressões de cidade** (`<Expressão> \| <Cidade>`) | "Tax Tolo", "Dazumbanho" (Florianópolis), "Ein Prosit" (Blumenau), "Tá Frio Né", "Frio e Cinza" (Curitiba), "Fronteira" (Foz do Iguaçu), "Navegue-se" (Navegantes). Há ainda 3 de região/estado ("Vai da Onda \| Litoral Catarinense", "Bah Meu" e "Tri Legal \| Rio Grande do Sul") | 7 em 5 cidades (+ 3 de região/estado) | 10 (+ 6) | **Alto** na página da cidade (módulo "Fala de <cidade>"). Imagens são recortes reais em modelo | **Médio.** As artes usam o ícone turístico da cidade dentro do círculo; o texto é o que vale |
| **Padroeiros** (`<Cidade> \| <Santo>`, ordem inversa das expressões) | "Florianópolis \| Nossa Senhora do Desterro", "Caxias do Sul \| Santa Teresa D'Ávila", "Laguna \| Santo Antônio", "Santa Maria \| Nossa Senhora Medianeira" | 8 | 0 | **Médio.** Identidade de cidade pouco óbvia e original; entra na página da cidade | **Baixo** |
| **Estaduais** (linhas por estado) | Made in (8), Essência (6), Minimal (6), Clean (3), Atlas do Sul (3), Escritas (3), Mapa (3), Tela de pintura (3), "Catarine-se / Gaúche-se / Paranaense-se" (3) | ≈ 38 | ≈ 362 | **Alto** como produto de cada estado nos painéis de estado (E1) | **Alto em Made in** (bandeira); **baixo em Clean, Minimal, Escritas, Atlas** |
| **Lenda / Meu Pai / Raiz da Família / Presença que Fica / Mate de Origem** (personas e presentes) | "Pai Catarinense Pescador \| Lenda", "Mãe Gaúcha Gremista", "Pai \| Mate de Origem" | ≈ 40 | ≈ 26 | **Baixo** na home; melhor como coleção sazonal (Dia dos Pais/Mães) | **Alto** (times, churrasco, mate) |
| **Treino** (P&B e cor) | "Churrasco e Cerveja", "Cuca e Café", "Bretzel e Chopp", "Marreco e Chopp" | 18 | 1 | **Baixo.** Hábitos reais, mas em ilustração cartunesca que muda o tom | **Alto** (comida como identidade) |
| **Pocket / Clube** | "Capivara do Mate — Pocket", "Vale O Esforço — Pinhão Club", "… Tainha Club", "… Chimas Club" | 10 + 7 | 0 | **Muito baixo** para home | **Alto** (mascotes, pinhão, tainha, chimarrão) |
| **Arte e expressão sem linha** | "Gaúcho de Pedra", "Mas Bah!", "Ataque da Tainha", "Pinhões N' Roses", "Vida no Sul — Litoral / Serra / Estância Edition" | ≈ 56 | ≈ 56 | **Baixo** na home | **Muito alto** (folclore, paródia, estátua do gaúcho) |

Observações:
- **Dizeres tem tração real** (59 vendas, atrás apenas de Made in e Essência) e é a linha mais compatível com "premium
  + Sul".
- **O catálogo já pensa em geografia**: "Vida no Sul — Litoral / Serra / Estância Edition" e os 17 DDDs. Isso sustenta a
  hipótese de agrupar cidades por região, mas o agrupamento em si continua PROPOSTA PARA VALIDAÇÃO.
- Volume e vendas dessas camadas são pequenos (244 produtos, 544 vendas somadas nas 107 com venda): a V2 não deve
  depender de vendas para escolher a curadoria; deve escolher por identidade.
- Não há "Fala Daqui", "Do Nosso Jeito" ou "Da Nossa Terra" com esses nomes no Sul; os equivalentes reais são
  Dizeres, expressões de cidade e DDD.

---

## 5. Muro de cidades: três alternativas

Contexto: hoje são 24 cidades escolhidas por mim, em ordem arbitrária (capitais e cidades conhecidas). Isso não é
regionalismo, é lista.

**A. Geografia editorial** ("Do litoral à serra")
- **A1, base oficial**: cidades agrupadas por **mesorregião do IBGE** e/ou pelos **17 DDDs do catálogo**. Fato, não
  opinião. IBGE: RS 7 (Noroeste Rio-grandense 216 municípios, Metropolitana de Porto Alegre 98, Nordeste 54, Centro
  Oriental 54, Centro Ocidental 31, Sudeste 25, Sudoeste 19), SC 6 (Oeste 118, Vale do Itajaí 54, Sul 46, Serrana 30,
  Norte 26, Grande Florianópolis 21), PR 10 (Norte Central 79, Noroeste 61, Oeste 50, Norte Pioneiro 46, Sudoeste 37,
  Metropolitana de Curitiba 37, Centro-Sul 29, Centro Ocidental 25, Sudeste 21, Centro Oriental 14).
- **A2, nomes editoriais** **PROPOSTA PARA VALIDAÇÃO**: três grandes leituras do Sul: **Litoral**, **Serra**,
  **Interior/Campo** (o catálogo já usa Litoral, Serra e Estância em "Vida no Sul"). Exemplos de hipótese, a
  confirmar por você: Litoral: Florianópolis, Tijucas, Bombinhas, Torres, Paranaguá; Serra: Urubici, Gramado,
  Lages, Bento Gonçalves; Interior: Santa Maria, Pato Branco, Chapecó, Passo Fundo. Pode existir uma quarta leitura,
  a **Fronteira** (Foz do Iguaçu, Uruguaiana), também hipótese.

**B. Cidades em destaque** (poucas por vez, rotação editorial)
- 4 a 6 cidades por vez, cada uma com nome grande, uma fala local (quando existir no catálogo) e o produto real.
  Rotação manual semanal ou por campanha. Usa as expressões de cidade e os padroeiros.

**C. Descoberta contínua** (cidade + microcontexto + busca)
- Uma faixa que sugere cidades a partir da busca e do contexto: "Perto de Florianópolis", "No DDD 054". Microcontexto
  automático (mesorregião do IBGE, DDD onde houver produto, contagem de estilos) e uma linha editorial só nas cidades
  curadas.

| Critério | A1 (oficial) | A2 (editorial) | B (destaque) | C (descoberta) |
|---|---|---|---|---|
| Força regional | Média, é factual e original | **Alta**, se bem curada | Alta pontual | Média-alta |
| Escalabilidade (Norte/Centro) | **Muito alta** | Média (curadoria por região) | Baixa | **Alta** |
| Risco de clichê | Baixo | Médio (litoral/serra/campo é convenção) | Médio (depende das escolhas) | Baixo |
| Curadoria manual | Nenhuma | **Alta** | Alta e recorrente | Baixa (só as linhas editoriais) |
| Manutenção | Baixa | Média | **Alta** | Baixa |

Recomendação (a validar): **A1 como estrutura** (agrupar por região oficial ou DDD, sem opinião) com **C** como
comportamento (a cidade sugere as vizinhas) e **B em pequena dose**, com 3 a 4 cidades quando houver conteúdo real.
A2 só se você aprovar os grupos.

---

## 6. Estados com contexto (RS, SC, PR)

Dados: RS 497 cidades e 7 mesorregiões, SC 295 e 6, PR 399 e 10. DDDs no catálogo: RS 051, 053, 054, 055; SC 047, 048,
049; PR 041 (duas regiões), 042, 043, 044, 045, 046.

- **E1, Estado + produto do estado** (sem asset novo): cada painel mostra uma linha estadual real (Clean, Minimal,
  Escritas ou Atlas, evitando Made in com bandeira) e a contagem. Curadoria mínima: escolher a linha por estado.
- **E2, Estado + cidade destaque + frase curta** (sem asset novo, com curadoria): ex. SC com Florianópolis e a fala
  "tax tolo" (quando validada), PR com Curitiba e "tá frio né". **PROPOSTA PARA VALIDAÇÃO** (frase, cidade e produto).
- **E3, Estado + geografia** (sem asset novo): o painel lista suas regiões oficiais como atalhos (mesorregiões) e leva a
  uma página do estado agrupada por elas. Escala bem para Norte e Centro-Oeste.
- **Com fotografia futura** (qualquer uma das três): substituir o contorno por uma foto cotidiana do estado e usar o
  contorno como detalhe. **Depende de asset.**

Na página do estado: trocar A–Z por grupos de mesorregião (ou DDD) com contagem, manter A–Z como alternativa, buscar
no topo (corrigindo o BUG), e um bloco editorial curto opcional.

---

## 7. Hero regional V2: três direções

### Direção A, "De qual Sul você é?" (**funciona sem fotografia lifestyle nova**)
- **Estrutura**: mesmo esqueleto atual (texto à esquerda, produtos à direita), mas os três produtos deixam de ser a
  mesma cidade em três estilos e passam a ser três **camisetas reais de geografia e fala**: por exemplo os DDDs
  ("ZERO CINCO QUATRO / Serra Gaúcha", "ZERO QUATRO OITO / Grande Florianópolis", "ZERO QUATRO UM / Grande Curitiba"),
  um por estado.
- **Tipo de imagem**: produto real (INK) + tipografia de escala extrema. Sem fotografia nova.
- **Headline** (PROPOSTA PARA VALIDAÇÃO): "De qual Sul você é?" (alternativa: "Cada lugar do Sul, do seu jeito.").
- **Subtítulo** (PROPOSTA): "Cidades, DDDs e o jeito de falar de cada canto, em camiseta."
- **CTA**: "Encontrar minha cidade".
- **Papel da busca**: dentro da primeira dobra, logo abaixo do CTA (ou substituindo o CTA), com resultados que já
  mostram mesorregião/DDD.
- **Por que parece Sul**: a headline admite a pluralidade do Sul; usa geografia real (DDD) e fala; nenhum símbolo
  folclórico.
- **Risco de ficar genérico**: se os três produtos forem lidos só como "camisetas pretas com texto"; o DDD pode ser
  críptico para quem é de fora (resolvido por legenda curta com o nome da região). Precisa de boa hierarquia entre
  headline e produtos.

### Direção B, "Cotidiano" (**assume fotografia nova**)
- **Estrutura**: fotografia em tela cheia, sujeito à direita, espaço negativo à esquerda; o produto visível na roupa.
  Header transparente sobre a foto; busca como barra sobre a base da imagem.
- **Tipo de imagem**: lifestyle real em cidade cotidiana (ver seção 10).
- **Headline** (PROPOSTA): "De onde você é." (curta; a imagem carrega a região).
- **Subtítulo** (PROPOSTA): "Camisetas com o nome, o mapa e as coordenadas da sua cidade."
- **CTA**: "Encontrar minha cidade".
- **Papel da busca**: barra fixa na base do hero, primeira dobra, desktop e mobile.
- **Por que parece Sul**: luz, tempo, arquitetura e roupa cotidianos de uma cidade do Sul; pessoas reais.
- **Risco de ficar genérico**: alto se a locação e o elenco não forem específicos; moda editorial genérica com
  camiseta preta serve a qualquer lugar. Depende de direção fotográfica e de escolher cidades reconhecíveis sem
  cartão-postal.

### Direção C, "Cidade em destaque" (**híbrida: usa o que já existe, com rotação editorial**)
- **Estrutura**: o hero é uma cidade por vez: nome em escala extrema, a fala local dela em microcopy ("Tax tolo." em
  Florianópolis) e o produto de expressão dessa cidade em recorte em modelo (as imagens reais existentes).
- **Tipo de imagem**: recortes em modelo dos produtos de expressão de cidade (Florianópolis, Blumenau, Curitiba, Foz
  do Iguaçu); hoje são 800 px, então funcionam como detalhe, não como fotografia de campanha.
- **Headline** (PROPOSTA): o nome da cidade; **subtítulo**: "Camisetas de Florianópolis. Ou de onde você é."
- **CTA**: "Ver Florianópolis" com "ou busque a sua" ao lado.
- **Papel da busca**: ao lado do CTA, primeira dobra.
- **Por que parece Sul**: cidade real + fala real + produto real.
- **Risco de ficar genérico**: baixo, mas há risco de **clichê** (o ícone turístico dentro do círculo da arte), de pool
  pequeno (4 cidades hoje) e de manutenção (rotação manual).

**Recomendação (a validar)**: implementar **A agora**, deixando o layout pronto para trocar o lado do produto por
fotografia (**B**) quando ela existir, e usar o módulo da **C** dentro da página da cidade, onde ele faz mais sentido.

---

## 8. Busca como eixo

Narrativa: **origem → cidade → identidade**.
- **Origem**: "De qual Sul você é?" é a pergunta; a busca é a resposta (ou a escolha do estado).
- **Cidade**: a página da cidade confirma a escolha com contexto real (mesorregião, DDD, fala de cidade, localidades).
- **Identidade**: os estilos (Ponto de Origem, Coordenadas…) são a forma de vestir aquela cidade.

Posição ideal:
- **Desktop**: na primeira dobra, dentro do hero (input grande sob a headline) e replicada como faixa preta mais
  abaixo apenas se ainda fizer sentido (evitar o segundo grande bloco preto seguido).
- **Mobile**: campo no hero que abre o sheet em tela cheia (já existe) ao tocar; o resto da home vem depois. Sem
  campo escondido atrás do ícone do header.
- **Relação com o hero**: a busca não é mais uma seção depois; é a ação principal do hero.
- **Resultados**: manter o "quadro de partidas", com microcontexto automático ("Santa Catarina · Grande
  Florianópolis") e sem inventar dados.

---

## 9. Página de cidade V2

| Camada | Conteúdo | Automático ou editorial |
|---|---|---|
| Contexto | Breadcrumb, nome, estado, **mesorregião (IBGE)**, **DDD** quando houver produto | **Automático** (IBGE + catálogo) |
| Famílias | Estilos que existem para a cidade, sem inventar | **Automático** (já existe) |
| Fala de <cidade> | Produtos de expressão/padroeiro da cidade (ex.: "Tax Tolo", "Ein Prosit", "Nossa Senhora do Desterro") | **Automático, com duas regras de nome** (`Expressão \| Cidade` e `Cidade \| Santo`); existe hoje para **11 cidades distintas** (5 com expressão, 8 com padroeiro, 2 em comum). Exige cuidado com homônimos: "São João Batista" é santo e é cidade de SC, então a regra precisa de validação, não de adivinhação |
| Localidades ("Também de …") | Já existe; V2 explica em uma linha e mantém o padrão de link | Automático + uma linha editorial opcional |
| Cidades da região | Vizinhas pela **mesorregião** (não pela ordem alfabética) | **Automático** |
| Frase editorial | Uma linha de contexto por cidade, para as 20 a 30 principais | **Manual** (validação sua) |
| Fotografia | Detalhe/cotidiano da cidade | **Manual, depende de asset**, opcional |
| Estrutura | Remover o H2 repetido, reduzir o destaque para que nome e preço apareçam na primeira dobra | Design |

O que **não** muda: rotas, resolver, ranking e o comportamento das famílias e variantes.

---

## 10. Plano de fotografia regional — Sul

Princípio: cotidiano, não cartão-postal. Uma foto de Florianópolis não precisa da Ponte Hercílio Luz. Roupa é a
camiseta da cidade (preta, ou a mais fotogênica do catálogo) com peças reais do dia a dia.

Sugestão de produção enxuta (PROPOSTA PARA VALIDAÇÃO): **um dia de fotografia em uma cidade** (ex.: Curitiba ou Porto
Alegre ou Florianópolis, você decide), com 3 looks, 2 locações e 1 talento em cada, mais 1 a 2 meias-diárias em
outros estados quando fizer sentido.

### Lifestyle
- **Objetivo**: hero e bloco de campanha; a pessoa que "é daqui".
- **Proporção e tamanho**: 3:2 paisagem, **mín. 2880×1800**, ideal 3600×2400; versão retrato 4:5, **mín. 2400×3000**,
  para mobile e campanha.
- **Orientação**: as duas.
- **Posição do sujeito**: paisagem, sujeito no terço direito (aprox. 55 a 95% da largura); retrato, sujeito centralizado
  na metade superior.
- **Espaço negativo**: 35 a 45% à esquerda na paisagem (para headline), 25% no topo do retrato.
- **Luz**: natural, lateral; manhã fria ou fim de tarde; nada de flash duro; céu nublado é bem-vindo.
- **Cenário**: rua comum, ponto de ônibus, calçada, feira, padaria, terminal, muro pintado, escada de prédio, praça de
  bairro.
- **Roupa**: camiseta da cidade + jeans/calça de trabalho, camada leve (jaqueta, moletom, corta-vento).
- **Poses**: andando, esperando, encostado, sentado, olhar fora da câmera, gesto cotidiano (segurar café, amarrar tênis).
- **Evitar**: sorriso posado para a câmera, cuia de mate, bombacha ou traje típico, cenário de churrasco, praia de
  cartão-postal, filtros pesados, cara de banco de imagem.

### Cidade cotidiana
- **Objetivo**: dar lugar às páginas de estado, ao editorial e à busca.
- **Proporção e tamanho**: 16:9 **mín. 3840×2160** e 4:5 **mín. 2400×3000**.
- **Orientação**: paisagem principal; retrato de apoio.
- **Posição do sujeito**: a cena é o sujeito; se houver pessoas, ao fundo e pequenas.
- **Espaço negativo**: 30% livre em um dos lados para texto.
- **Luz**: manhã fria, neblina leve, luz lateral, dia cinza.
- **Cenário**: arquitetura cotidiana, terminais, feiras, fachadas, calçadas de pedra, ruas de bairro, cais de rio ou
  mar em uso, estradas.
- **Roupa**: não se aplica (ou passantes com roupa comum).
- **Poses**: não se aplica.
- **Evitar**: o monumento óbvio isolado, drone genérico, céu azul de folheto, hora dourada clichê.

### Detalhe
- **Objetivo**: textura e proximidade; alimenta cards de estado, capas de coleção e o hover dos produtos.
- **Proporção e tamanho**: 1:1 e 4:5, **mín. 2400 px** no lado maior.
- **Orientação**: as duas.
- **Posição do sujeito**: centralizado ou regra dos terços; sem texto aplicado.
- **Espaço negativo**: variável.
- **Luz**: lateral e suave, com sombra definida.
- **Cenário**: pedra, madeira, azulejo, muro pintado, trilho, tecido da camiseta com a estampa, mão segurando algo do
  dia a dia; **recortes em modelo** como os das camisetas de expressão (pescoço e peito).
- **Roupa**: a camiseta em foco.
- **Poses**: não se aplica.
- **Evitar**: natureza-morta com objeto folclórico, textura falsa de "rústico".

### Produto em cena
- **Objetivo**: mostrar a camiseta integrada ao cotidiano, sem modelo.
- **Proporção e tamanho**: 4:5, **mín. 2400×3000**; 1:1 opcional.
- **Orientação**: retrato.
- **Posição do sujeito**: camiseta dobrada ou pendurada no terço inferior/central.
- **Espaço negativo**: 25% acima.
- **Luz**: natural suave, sem reflexo forte; tom de fundo neutro-frio para conviver com o fundo `#e5e5e5` das fotos
  atuais.
- **Cenário**: cadeira, prateleira, varal, banco de ônibus, porta-malas, mesa de balcão.
- **Roupa**: a própria camiseta (mostrar o estampado de perto).
- **Poses**: não se aplica.
- **Evitar**: props regionais ("mate", "pinhão"), arranjo de loja de souvenir, flat lay genérico.

---

## 11. Assets mínimos

**ESSENCIAL** (destrava a direção B e o bloco de campanha; ≈ 8 a 10 imagens, um dia de fotografia):
1. 1 lifestyle paisagem + sua versão retrato (mesma cena).
2. 2 lifestyle retrato adicionais (mesmo dia).
3. 3 cidade cotidiana, uma por estado (podem sair de um dia de produção em uma só cidade se você preferir começar por
   uma).
4. 4 recortes em modelo (detalhe) de camisetas de cidade.
5. Logo em vetor (SVG) da Use Origens e das tags regionais (hoje 192×192).

**IMPORTANTE**:
- 3 imagens de estado (RS, SC, PR) para os painéis.
- 4 a 6 produtos em cena.
- Imagem Open Graph 1200×630 e favicon.
- 1 a 2 retratos para o bloco de campanha.

**PODE ESPERAR**:
- Fotografia por cidade específica.
- Vídeo/loop curto.
- Segunda imagem por produto para hover (a INK só entrega `main_image_url`).
- Sets equivalentes para Norte e Centro-Oeste.

---

## 12. Tom de linguagem Sul

Regra: **UX funcional = clara e neutra. Editorial/campanha = pode carregar identidade regional.**

- **Usar**: nomes de cidade e de lugar; falas reais quando aparecem no produto (Dizeres, expressões de cidade);
  frases curtas e concretas; "você", verbo no imperativo ("Encontre", "Escolha") nos CTAs.
- **Evitar**: "bah", "tchê", "tri" em elementos funcionais ou como saudação do site; tratar o Sul como sinônimo de
  "gaúcho"; exclamações; "raiz"; trocadilhos com comida ou mate; adjetivos de folheto ("autêntico", "tradicional").
- **Quanto regionalizar**: pouco, e em um lugar por vez. Cada tela tem no máximo uma fala regional.
- **Onde regionalizar**: headline do hero, títulos de coleção, uma linha por cidade destaque, microcopy ocasional
  (ex.: mensagem de busca vazia). Nunca em botões, rótulos de formulário, preços, erros.
- **Funcional (fica como está)**: "Buscar cidade", "Escolher estilo", "Escolher tamanho na loja", "Ver na loja".
- Cuidado de pluralidade: RS, SC e PR não falam igual. Uma fala só vira "do Sul" se aparecer com contexto (cidade ou
  estado). **A atribuição de cada expressão a um estado é PROPOSTA PARA VALIDAÇÃO** (ex.: "bah", "tongo", "ô piá",
  "tax tolo", "tá frio né").

---

## 13. Regionalismo válido vs fácil/clichê

| Regionalismo válido | Regionalismo fácil / clichê |
|---|---|
| Fala real com contexto (Dizeres, "Tax Tolo" em Florianópolis, "Tá Frio Né" em Curitiba) | "Bah" como assinatura do Sul inteiro |
| DDD como geografia tipográfica | Bandeira do estado em cores saturadas |
| Nome da cidade como tipografia | Estátua de gaúcho, bombacha, prenda |
| Padroeiro da cidade | Mate/cuia, chimarrão, churrasco como único motivo |
| Clima real (frio, cinza, neblina) | Pinhão, tainha, araucária como mascote |
| Região oficial (mesorregião) e cidades além das capitais | Ícone turístico como única imagem da cidade |
| Cotidiano de rua, terminal, padaria | Paródia com nome de banda ou "Vida no Sul" em estilo de videogame |
| Humor local com autoria clara | Mascote (capivara) para "representar" o Sul |

Símbolos regionais podem aparecer, mas **não sustentam sozinhos a identidade**: ficam em produto e coleção, não
na estrutura da home.

---

## 14. Sistema regional futuro: base vs camada Sul

| Elemento | Global Use Origens | Regional Sul |
|---|---|---|
| Tipografia | Big Shoulders (display), Hanken Grotesk (UI), Bodoni Moda (nomes de lugar) | Mesmas famílias; o Sul define quais palavras vão em display e em Bodoni |
| Header | Estrutura, comportamento e busca de acesso | Seletor de região e acento; nada mais |
| Busca | Componente, teclado, quadro de resultados, sheet no mobile | Índice de cidades e microcontexto (mesorregião, DDD) do Sul |
| Grid | Editorial (destaque + bloco), cards, carrossel | Quais famílias/coleções ocupam o destaque |
| Motion | Entrada do hero, header, hover, troca de variante | Nada regional |
| Cor | Preto, cinza-estúdio, papel | Acento do Sul (dourado da logo) e seu uso, com regra de quanto |
| Hero | Esqueleto (headline, produto/imagem, CTA, busca) | Headline, imagem, produtos e copy |
| Copy | Voz funcional e regras de tom | Titulares editoriais, falas, títulos de coleção |
| Fotografia | Direção de arte comum (cotidiano, luz natural, sem cartão-postal) | O banco de imagens do Sul |
| Cidades | Modelo de dados, IBGE, família → produto | Cidades destacadas, agrupamentos, frases |
| Coleções | Mecanismo de camada editorial por região | As linhas reais do Sul (Dizeres, DDD, expressões, estaduais) |
| Editorial | Blocos (campanha, faixa de cidades) | Conteúdo dos blocos |
| Footer | Estrutura e links | Ponte de marca Use Sul → Use Origens |

Norte e Centro-Oeste reaproveitam a base e a camada por configuração. **Não** há curadoria, hero ou páginas dessas
regiões neste plano.

---

## 15. Bugs prioritários

**BUG — implementar junto da V2**
1. **Busca invisível em página de estado e no 404.** Ao usar o componente sem o tema escuro, o texto fica branco sobre
   o cinza (`rgb(255,255,255)` sobre `#e5e5e5`). Arquivos de evidência: `state/santa-catarina-1440-full.png`,
   `mobile/santa-catarina-430-full.png`.
2. **Botão de fechar invisível no menu mobile.** Existe (44×44) mas fica preto sobre o menu preto, porque uma regra
   global de `dialog` sobrescreve a cor branca do menu. Evidência: `mobile/menu-375-open.png`.

Não foram corrigidos nesta etapa.

---

## 16. O que pode ser feito sem novos assets, e o que espera fotografia

**Sem novos assets** (depende só da sua validação de conteúdo):
- Os dois bugs.
- Hero direção A (produtos DDD, headline e busca na primeira dobra).
- Muro de cidades A1 (mesorregião/DDD) e comportamento C.
- Painéis de estado E1, E2 e E3 e página de estado agrupada por mesorregião.
- Linha "Fala daqui" com Dizeres na home; módulo "Fala de <cidade>" na página da cidade; padroeiros.
- Página de cidade V2: contexto automático, vizinhas por região, estrutura sem H2 repetido.
- Ajustes de hierarquia dos cards e de proporção do hero.
- Copy nova (depois de aprovada).

**Deve esperar fotografia**:
- Hero direção B e o bloco de campanha com pessoas.
- Imagens nos painéis de estado, capas de coleção e página de cidade.
- Cidades cotidianas e detalhes.
- Hover com segunda imagem.

---

## 17. Pontos que exigem a sua validação

1. **Agrupamento geográfico**: usar A1 (mesorregião/DDD) ou aprovar A2 (litoral/serra/interior) e quais cidades entram.
2. **Falas por estado**: quais expressões podem representar RS, SC e PR (bah, tongo, ô piá, tax tolo, tá frio né, ein
   prosit…) e se alguma incomoda.
3. **Quais linhas destacar na home** (Dizeres, DDD, expressões de cidade, estaduais Clean/Minimal/Escritas/Atlas) e
   quais deixar só no catálogo (Pocket, Clube, Vida no Sul, paródias, Lenda, Treino). Isto é destaque editorial, não
   exclusão.
4. **Headline e tom**: "De qual Sul você é?", "De onde você é." e as variações; nível de regionalização.
5. **Direção de hero**: A agora com B preparada? Ou C?
6. **Cidades em destaque** e se haverá rotação.
7. **Ponte de marca**: usar ou não "A experiência regional da Use Sul, agora dentro da Use Origens" e onde.
8. **Fotografia**: cidade de produção, elenco, quantidade, prazo.
9. **DDD como elemento de identidade**: aceitar o DDD como assinatura (e o risco de ser críptico).
10. **Uso do dourado**: manter como acento único do Sul e quanto dele aparece.

---

## 18. Ordem sugerida, após aprovação
1. Bugs + hero A + busca na primeira dobra + página de estado por mesorregião (base de tudo).
2. Faixa "Fala daqui", muro de cidades A1/C, estados E1–E3.
3. Página de cidade V2 (contexto, fala de cidade, vizinhas).
4. Slot de fotografia B e campanha quando os assets chegarem.

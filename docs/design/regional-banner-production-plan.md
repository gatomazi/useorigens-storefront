# Plano de produção de banners regionais

Fonte da verdade dos formatos: `SLOT_FRAMES` em `src/lib/editorial/banners.ts`. Se este documento e o código divergirem, o código manda e este arquivo deve ser corrigido.

Regra de partida: **mobile primeiro** (~90% do tráfego). Todo brief começa pelo retrato mobile; o desktop é a expansão do mesmo conceito, não um recorte do mobile.

---

## 1. Resposta direta: quantos banners?

**Conceito** = uma ideia fotográfica (cena, pessoa, luz). **Arquivo final** = cada recorte entregue (mobile, desktop). Um conceito costuma render 2 arquivos.

| Bloco | Conceitos | Arquivos finais |
|---|---:|---:|
| ROOT (`/`) | 2 | 4 |
| SUL | 8 | 13 |
| NORTE | 12 | 17 |
| CENTRO-OESTE | 9 | 14 |
| **TOTAL (catálogo completo)** | **31** | **48** |

### Por prioridade

| Prioridade | Conceitos | Arquivos | O que entra |
|---|---:|---:|---|
| **ESSENCIAL** | **7** | **14** | Hero master da raiz + hero e campanha de cada região |
| IMPORTANTE | 9 | 15 | Banner de cidade e "Fala daqui" por região; banners dos 3 estados do Sul |
| FUTURO | 15 | 19 | Editorial institucional da raiz; coleção DDD; estados do Norte (7) e do Centro-Oeste (4) |

### Mínimo de produção para lançar cada região com boa percepção de marca

| Região | Mínimo | Conceitos | Arquivos |
|---|---|---:|---:|
| ROOT | Hero master | 1 | 2 |
| SUL | Hero + campanha | 2 | 4 |
| NORTE | Hero + campanha | 2 | 4 |
| CENTRO-OESTE | Hero + campanha | 2 | 4 |
| **Lançamento das três + raiz** | | **7** | **14** |

Sem os banners, nada quebra: cada slot vazio mostra a composição tipográfica/produto já desenhada (nunca um placeholder genérico). Os banners sobem a "cara de região", não são pré-requisito de funcionamento.

### Por que não são 60+

- **Estados: 1 arquivo, não 2.** O slot `state` é 4:5 no mobile e 4:5 no desktop. Um único master de 1200×1500 serve aos dois.
- **Portas regionais da raiz reutilizam o hero de cada região** (mesmo arquivo mobile 4:5 e desktop 8:3). O texto ("Explorar o Sul") é HTML sobreposto, não vai na imagem. Isso também cria a continuidade que se quer: a mesma imagem que a pessoa vê na raiz aparece ao entrar na região. Se o layout final da raiz pedir um recorte próprio (por exemplo 21:9 em painel largo), promover a "porta" a IMPORTANTE: +3 conceitos, +6 arquivos. Não foi contado.
- **Banner de cidade é um template por região**, aplicado a todas as cidades (o slot aceita override por cidade no futuro, mas não é necessário para lançar).
- **Coleções**: "Fala daqui" (IMPORTANTE) e DDD (FUTURO). O DDD já é bem servido pelas fotos reais de produto.

---

## 2. Reutilizável x produção regional única

| Reutilizável (mesmo arquivo em mais de um lugar) | Produção regional única (fotografia própria) |
|---|---|
| Portas regionais da raiz = hero de cada região (0 arquivos novos) | Hero de cada região (3) |
| Banner de estado: 1 master serve mobile e desktop | Campanha de cada região (3) |
| Banner de cidade: 1 template por região serve a todas as cidades | "Fala daqui" de cada região (3) |
| Hero master da raiz: neutro de marca, sem sinal de região | Estados (14, se produzidos) |

O hero master da raiz **não** deve favorecer nenhuma região. Todo o resto carrega o sotaque do lugar.

---

## 3. Slots já preparados no código

| Slot (`BannerSlot`) | Onde está montado | Estado |
|---|---|---|
| `hero` | `RegionHero` na home da região (carrega o único `<h1>`; a busca fica como filho sobre a imagem) | Montado, vazio |
| `campaign` | `Campaign` na home da região | Montado, vazio |
| `city` | Página de cidade, entre o cabeçalho e "Estilos" | Montado, vazio |
| `state` | Página de estado, entre o cabeçalho e o navegador de cidades | Montado, vazio |
| `collection` (`ddd`, `fala-daqui`) | Home da região, antes de cada carrossel | Montado, vazio |
| Raiz `/` | **Não existe ainda.** Usará `RegionalBanner` com uma configuração de raiz (hero master) e `REGION_BANNERS[r].hero` para as portas | A fazer com a raiz |

`REGION_BANNERS` já existe para `sul`, `norte` e `centro-oeste`, todos vazios. Preencher um slot é editar um objeto, sem mudança de layout:

```ts
sul: { hero: { asset: { mobile: {src, width, height}, desktop: {...}, alt, focal: "50% 30%" }, heading, body, cta, align, overlay }, ... }
```

Campos de cada banner suportados hoje: asset mobile, asset desktop, `alt`, `heading`, `body`, `cta`, `align` (left/center/right), `overlay` (none/dark/light), ponto focal (`focal`), região (chave de `REGION_BANNERS`) e destino (`cta.href` ou `href`).

---

## 4. Formatos por slot (do código)

| Slot | Mobile | Desktop |
|---|---|---|
| Hero (fundo, ver 4.1) | 4:5, mín. 1440×1800 | 8:3, mín. 2880×1080 |
| Campanha | 4:5, mín. 1440×1800 | 16:9, mín. 2880×1620 |
| Estado | 4:5, mín. 1080×1350 | 4:5, mín. 1200×1500 (um master de 1200×1500 serve aos dois) |
| Coleção | 1:1, mín. 1440×1440 | 21:9, mín. 2880×1234 |
| Cidade | 4:3, mín. 1440×1080 | 21:9, mín. 2880×1234 |

### 4.1 Hero regional: é um fundo, não um quadro

O hero é feito **em código** (título, busca, legenda e as três camisetas de família). A imagem regional fica **atrás**, sob um véu leve em CSS. Ela não leva texto, produto nem pessoa em primeiro plano: o trio de camisetas já vem por cima.

Como a imagem cobre a caixa do hero (`object-cover`), o que vale é o tamanho **real** da caixa. Medido no site em produção:

| Largura da tela | Caixa do hero (largura×altura) | Proporção | Arquivo usado |
|---|---|---|---|
| 360 | 360×576 | 0,63 | mobile |
| 390 | 390×587 | 0,66 | mobile |
| 430 | 430×611 | 0,70 | mobile |
| 600 | 600×711 | 0,84 | mobile |
| 768 | 768×818 | 0,94 | mobile |
| 1023 | 1023×907 | 1,13 | mobile |
| 1024 | 1024×632 | 1,62 | desktop |
| 1280 | 1280×522 | 2,45 | desktop |
| 1440 | 1440×522 | 2,76 | desktop |
| 1920 | 1920×522 | 3,68 | desktop |
| 2560 | 2560×522 | 4,90 | desktop |

**Tamanhos recomendados**

| Arquivo | Tamanho recomendado | Mínimo aceitável | Proporção | Vale para |
|---|---|---|---|---|
| Mobile | **1440×1800** | 1122×1402 (só celular, fica mole em tablet) | 4:5 retrato | telas abaixo de 1024 px |
| Desktop | **2880×1080** | 2400×900 | 8:3 panorama | telas de 1024 px para cima |

**Zona segura** (o que precisa sobreviver ao corte):

- **Mobile 4:5:** em celular estreito (0,63) perdem-se ~10% de cada lado; em tablet (1,13) perdem-se ~14% em cima e embaixo. Mantenha o que importa na **faixa central, ~78% da largura e ~70% da altura**.
- **Desktop 8:3:** em 1440 px quase não corta. Em 1024 px aparece só ~61% da largura (o centro). Em 1920 aparecem ~72% da altura e em 2560 só ~54%. Mantenha o que importa na **faixa central, ~55% da altura e ~60% da largura**.
- **Composição:** paisagem com textura e profundidade, sem rosto nem objeto que precise ser lido. O texto ocupa a metade esquerda do desktop e o topo do mobile; as camisetas, a metade direita do desktop e a parte de baixo do mobile.
- **Ponto focal** (`focal` na config) escolhe o que fica no corte; um só valor vale para os dois arquivos. Hoje: `30% 35%`.
- **Peso:** WebP ou JPEG de alta qualidade, cerca de 150 a 400 KB cada. PNG funciona, mas fotografia em PNG passa fácil de 2 MB.

Formatos aceitos no código (`BANNER_IMAGE_EXTENSIONS`): **`.webp`, `.png`, `.jpg`, `.jpeg`**. Qualquer outro (por exemplo `.gif`) é recusado: o slot mostra a composição padrão e registra o erro no servidor. O Next reotimiza para AVIF/WebP, então PNG funciona, mas fotografia em PNG pesa muito no repositório (2 a 3 MB por arquivo); prefira WebP ou JPEG de alta qualidade quando possível. Não gravar texto na imagem: headline, corpo e CTA são HTML (idioma, acessibilidade e troca sem reprodução).

---

## 5. Direção comum a todos os banners

- Pessoas adultas brasileiras reais, sem pose de banco de imagens, vestindo a camiseta de cidade (fundo liso, estilo já usado nos produtos).
- Cenário cotidiano e contemporâneo: rua, esquina, feira, varanda, oficina, orla comum. Sem o cartão-postal óbvio.
- Luz natural, difusa e coerente com a hora e o clima do lugar. Nada de pôr do sol dourado genérico.
- Espaço negativo deliberado onde o texto vai entrar (indicado por banner). A busca do hero precisa de uma faixa limpa no terço inferior.
- **Evitar em toda a marca:** bandeira, mapa desenhado, ouro, folclore, roupa típica, chimarrão/cuia/chapéu como muleta visual, ponto turístico óbvio, cara de banco de imagens, texto dentro da imagem, logotipos de terceiros.
- Regionalismo vem de: rua, materiais, vegetação, luz, arquitetura comum, o jeito de se vestir e de estar no lugar.
- Pontos que precisam de validação editorial local antes de produzir estão marcados com **[validar]**.

---

## 6. ROOT / USE ORIGENS (`/`)

### R1. Hero master — ESSENCIAL — 1 conceito, 2 arquivos

| Campo | Mobile | Desktop |
|---|---|---|
| Objetivo | Responder "qual é a sua origem?" sem favorecer região | idem |
| Página/posição | `/`, primeira dobra, com a busca global sobre a imagem | idem |
| Dimensão | 1440×1800 | 2880×1920 |
| Aspect ratio | 4:5 | 3:2 |
| Conteúdo | Três pessoas de regiões diferentes, mesmo enquadramento, lado a lado (tríptico). Cada uma em seu lugar, todas de camiseta de cidade | idem, três painéis em linha |
| Composição | Mobile: três faixas verticais empilhadas ou lado a lado estreitas; sem hierarquia entre elas | Três painéis iguais em paisagem |
| Pessoa/produto | Pessoa em plano médio, camiseta legível; produto visível mas não catálogo | idem |
| Espaço negativo | Terço superior livre para headline; terço inferior livre para a busca | Coluna esquerda ou terço inferior livre |
| Copy sobreposta | Sim (HTML): "Qual é a sua origem?" + busca | Sim |
| CTA | Campo de busca de cidade | idem |
| Focal point | Centro (50% 45%): o rosto do painel central | 50% 45% |
| Direção de luz | Difusa e natural, temperatura neutra e igual nos três painéis, para nenhuma região "parecer mais quente" | idem |
| Cenário | Um cenário cotidiano de cada região (Sul, Norte, Centro-Oeste), sem cartão-postal | idem |
| O que evitar | Mapa do Brasil, bandeiras, uma região dominando o quadro, paleta do Sul como base | idem |
| Prioridade | ESSENCIAL | ESSENCIAL |
| Reutilizável | Não | Não |

### R2. Editorial institucional da marca — FUTURO — 1 conceito, 2 arquivos

Bloco "por que existe a Use Origens", no rodapé editorial da raiz. Retrato 4:5 no mobile (1440×1800) e 16:9 no desktop (2880×1620). Cena de bastidor/produto (mão, camiseta dobrada, costura) sem sinal de região. Só depois de a raiz existir.

### Portas regionais da raiz — sem banner novo

Sul, Norte e Centro-Oeste na raiz usam os heróis regionais S1, N1 e C1 (mesmo arquivo). Precisam, portanto, que cada hero regional aguente as duas leituras: com headline da região (na região) e com "Explorar o {região}" (na raiz).

---

## 7. SUL

Estados: PR, SC, RS. Baseline do sistema.

| # | Banner | Prioridade | Mobile | Desktop | Arquivos |
|---|---|---|---|---|---:|
| S1 | Hero regional (fundo) | ESSENCIAL | 4:5 1440×1800 | 8:3 2880×1080 | 2 |
| S2 | Campanha ("Nome, número e jeito de falar") | ESSENCIAL | 4:5 1440×1800 | 16:9 2880×1620 | 2 |
| S3 | Banner de cidade (template) | IMPORTANTE | 4:3 1440×1080 | 21:9 2880×1234 | 2 |
| S4 | Coleção "Fala daqui" | IMPORTANTE | 1:1 1440×1440 | 21:9 2880×1234 | 2 |
| S5 | Estado — Paraná | IMPORTANTE | 4:5 1200×1500 (master único) | idem | 1 |
| S6 | Estado — Santa Catarina | IMPORTANTE | idem | idem | 1 |
| S7 | Estado — Rio Grande do Sul | IMPORTANTE | idem | idem | 1 |
| S8 | Coleção DDD | FUTURO | 1:1 1440×1440 | 21:9 2880×1234 | 2 |

**Total Sul: 8 conceitos, 13 arquivos. Mínimo de lançamento: S1 + S2 (4 arquivos).**

Briefings resumidos (o prompt pronto de cada um está em `banner-generation-prompts.md`):

- **S1 Hero.** Adulto(a) de camiseta de cidade numa esquina urbana do Sul em dia nublado e claro. Sujeito no terço inferior/direito; espaço negativo superior/esquerdo para o headline "De qual Sul você é?" e faixa inferior limpa para a busca. Focal 60% 55%. Luz difusa fria. Cenário: cidade média com fachada de comércio comum, calçada molhada opcional. Evitar chimarrão, bandeira gaúcha, roupa típica, serra nevada de postal. **[validar]** que a cena não favoreça um estado só: o Sul é PR, SC e RS.
- **S2 Campanha.** Duas ou três pessoas de idades diferentes em um mesmo lugar (feira, balcão, calçada), conversando, todas de camiseta de cidade diferente. Espaço à esquerda para o bloco de texto. Mobile: enquadramento vertical fechado numa pessoa, com as outras cortadas no limite. Evitar grupo posado olhando para a câmera.
- **S3 Cidade (template).** Paisagem urbana genérica do Sul, sem identificar a cidade (a cidade está no H1). Rua de bairro, fio, muro, vegetação. Faixa inferior limpa. Precisa funcionar sob qualquer nome, então nada de placa legível nem monumento.
- **S4 Fala daqui.** Objeto ou cena que evoque conversa: balcão de padaria, ponto de ônibus, mesa de bar vazia com dois copos. Sem pessoa em foco. Sem texto na imagem.
- **S5–S7 Estados.** Um retrato por estado, mesmo tratamento de luz para os três. Cena de rua do interior ou de cidade média, não da capital óbvia. **[validar]** cada cena com quem é do estado.
- **S8 DDD.** Detalhe: orelhão, cabo, teclado numérico, fachada de loja com telefone. Sem números legíveis (evita invenção de DDD).

---

## 8. NORTE

Estados: AC, AM, AP, PA, RO, RR, TO. Ainda não implementado no código; os slots já são os mesmos.

| # | Banner | Prioridade | Mobile | Desktop | Arquivos |
|---|---|---|---|---|---:|
| N1 | Hero regional (fundo) | ESSENCIAL | 4:5 1440×1800 | 8:3 2880×1080 | 2 |
| N2 | Campanha | ESSENCIAL | 4:5 1440×1800 | 16:9 2880×1620 | 2 |
| N3 | Banner de cidade (template) | IMPORTANTE | 4:3 1440×1080 | 21:9 2880×1234 | 2 |
| N4 | Coleção "Fala daqui" | IMPORTANTE | 1:1 1440×1440 | 21:9 2880×1234 | 2 |
| N5–N11 | Estados: AC, AM, AP, PA, RO, RR, TO (7) | FUTURO | 4:5 1200×1500 | idem | 7 |
| N12 | Coleção DDD | FUTURO | 1:1 1440×1440 | 21:9 2880×1234 | 2 |

**Total Norte: 12 conceitos, 17 arquivos. Mínimo de lançamento: N1 + N2 (4 arquivos).**

Direção: cidade amazônica contemporânea e real. Luz de céu carregado e úmido, verde presente sem virar selva de cartão-postal, água como rua (rio, igarapé, porto) sem barco pitoresco. Evitar cocar, indígena como adereço, floresta como pano de fundo genérico, boto, Boi-Bumbá como muleta, foto aérea de rio. **[validar]** todas as cenas com pessoas do Norte; a região tem cidades muito diferentes (Belém, Manaus, Palmas, Porto Velho).

---

## 9. CENTRO-OESTE

Estados: DF, GO, MS, MT. Ainda não implementado no código.

| # | Banner | Prioridade | Mobile | Desktop | Arquivos |
|---|---|---|---|---|---:|
| C1 | Hero regional (fundo) | ESSENCIAL | 4:5 1440×1800 | 8:3 2880×1080 | 2 |
| C2 | Campanha | ESSENCIAL | 4:5 1440×1800 | 16:9 2880×1620 | 2 |
| C3 | Banner de cidade (template) | IMPORTANTE | 4:3 1440×1080 | 21:9 2880×1234 | 2 |
| C4 | Coleção "Fala daqui" | IMPORTANTE | 1:1 1440×1440 | 21:9 2880×1234 | 2 |
| C5–C8 | Estados: DF, GO, MS, MT (4) | FUTURO | 4:5 1200×1500 | idem | 4 |
| C9 | Coleção DDD | FUTURO | 1:1 1440×1440 | 21:9 2880×1234 | 2 |

**Total Centro-Oeste: 9 conceitos, 14 arquivos. Mínimo de lançamento: C1 + C2 (4 arquivos).**

Direção: céu aberto e luz forte, mas contemporânea, sem cara de safra de propaganda agro. Horizonte amplo, terra, concreto e asfalto (Brasília inclui). Evitar chapéu de peão, boi, bota, trator, Congresso Nacional como ícone, sertanejo como fantasia. **[validar]** com quem é de GO, MS, MT e DF; os quatro estados não compartilham um "jeito" único.

---

## 10. Por banner: campos que a pessoa que produz precisa preencher

Todo item das tabelas acima é entregue com:

1. Arquivo mobile e arquivo desktop (ou master único, nos estados), com as dimensões mínimas do slot.
2. `alt`: descreve a cena em uma frase (quem, onde, o quê). Não repete o headline.
3. Ponto focal (`focal`, em %, por exemplo "60% 55%") separado para mobile e desktop, se o corte mudar o assunto.
4. Alinhamento do texto (`align`) e `overlay` (`none`, `dark` ou `light`) conforme o contraste medido sob o texto.
5. Heading, body e CTA (opcionais) e o destino (`href`).
6. Região de origem (chave de `REGION_BANNERS`).

Critério de aceite (todos os banners):

- O texto sobreposto passa contraste AA nos dois recortes.
- No mobile 360×780, hero com busca cabe inteiro na primeira tela sem cortar o assunto.
- Nenhuma imagem passa de ~250 KB no mobile após otimização (meta: LCP < 2,5 s p75).
- Nenhuma imagem tem texto, mapa, bandeira, ouro ou folclore.

---

## 11. Ordem recomendada de produção

1. Hero master da raiz (R1) e heróis S1, N1, C1. Os quatro formam a "cara" e cobrem raiz + portas.
2. Campanhas S2, N2, C2.
3. Cidade (S3, N3, C3) e Fala daqui (S4, N4, C4).
4. Estados do Sul (S5–S7).
5. Todo o resto (FUTURO) conforme cada região for implementada.

Produzir o Sul primeiro valida o processo e os briefs antes de replicar para Norte e Centro-Oeste.

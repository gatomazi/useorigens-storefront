# Prompts-base para gerar os banners (ChatGPT)

Cobre os **7 banners ESSENCIAIS** de `regional-banner-production-plan.md` (14 arquivos): hero master da raiz e, para cada região, hero e campanha. Nenhuma imagem foi gerada; aqui só há prompts.

Os IMPORTANTES e FUTUROS reaproveitam este formato: o briefing de cada um está no plano, seção da região.

---

## Como usar

1. Cole o **BLOCO BASE** e, logo abaixo, o prompt do banner. O bloco base garante o mesmo tratamento em todos.
2. Gere o **mobile primeiro** (retrato). Só depois gere o desktop, no mesmo chat, pedindo "a mesma cena e as mesmas pessoas, agora em paisagem".
3. Peça 4 variações e escolha uma. Se a pessoa ou o cenário parecerem de banco de imagens, descarte.
4. Confira o tamanho: o ChatGPT nem sempre entrega a dimensão pedida. Se vier menor que o mínimo do slot, peça ampliação ou use um upscaler; não publique abaixo do mínimo.
5. Conferir antes de aceitar: sem texto na imagem, sem mapa, sem bandeira, sem ouro, sem folclore, sem logotipo, mãos e rostos sem defeito.
6. Camisetas: o gerador não reproduz o design real (mapa da cidade, DDD). Por isso todos os prompts pedem **camiseta preta lisa, sem texto legível**. Se precisar da camiseta real de uma cidade, compor depois com a foto de produto da INK. Nunca deixar o gerador inventar um nome de cidade.
7. Quem é do lugar valida a cena (marcado **[validar]**) antes de publicar.

---

## BLOCO BASE (colar antes de qualquer prompt)

```text
Fotografia editorial contemporânea, realista, de rua, para o site de uma marca brasileira de camisetas
que homenageiam cidades. Pessoas adultas brasileiras reais, naturais, sem pose de banco de imagens,
sem olhar para a câmera a menos que eu peça. Camiseta preta lisa, sem nenhum texto, logotipo ou
desenho legível. Luz natural e difusa, sem pôr do sol dourado genérico. Cor sóbria e levemente
dessaturada. Cenário cotidiano e verossímil, nunca cartão-postal.

NÃO incluir: texto de qualquer tipo, letras, placas legíveis, marcas, logotipos, mapas, bandeiras,
brasões, dourado ou ouro, roupa típica, fantasia folclórica, ponto turístico famoso, aparência de
banco de imagens, efeito HDR exagerado, pele artificial, mãos deformadas.

Deixar áreas amplas e limpas de imagem para texto e um campo de busca serem colocados por cima
depois (indicadas abaixo). Não escrever nada nessas áreas.
```

---

## ROOT

### R1 — Hero master · MOBILE (4:5, 1440×1800)

```text
[BLOCO BASE]

Formato retrato 4:5, 1440×1800 pixels.

Cena: um tríptico vertical em três faixas do mesmo tamanho, empilhadas de cima para baixo, ou três
painéis verticais estreitos lado a lado (escolha o que der mais leitura em tela de celular). Em cada
painel, uma pessoa adulta brasileira diferente, em plano médio (da cintura para cima), de camiseta
preta lisa, em um cenário cotidiano de uma região do Brasil:
- painel 1: rua de cidade média do Sul do Brasil, dia claro e nublado, fachada de comércio comum;
- painel 2: calçada ou beira de rio numa cidade do Norte, verde presente, céu úmido e carregado;
- painel 3: avenida larga ou esquina de uma cidade do Centro-Oeste, céu aberto, terra e concreto.

As três pessoas com o mesmo enquadramento, a mesma altura de câmera e a mesma temperatura de luz
neutra, para que nenhuma região pareça mais quente ou mais importante que as outras. Idades e
características diferentes, sem estereótipo.

Composição: o terço superior de cada painel com céu ou parede limpa; o terço inferior do conjunto
livre para um campo de busca sobreposto. Pessoas ligeiramente descentralizadas para o lado.
Ponto focal no rosto da pessoa do painel central (cerca de 50% na horizontal, 45% na vertical).
```

### R1 — Hero master · DESKTOP (3:2, 2880×1920)

```text
[BLOCO BASE]

A mesma cena, as mesmas três pessoas e os mesmos cenários da imagem mobile, agora em formato
paisagem 3:2, 2880×1920 pixels.

Três painéis iguais lado a lado, em linha. Nenhuma região dominante: mesma largura, mesma altura de
câmera, mesma luz neutra. Coluna esquerda ou faixa inferior levemente mais livre para o título e o
campo de busca sobrepostos. Ponto focal centrado (50% 45%).
```

---

## SUL

### S1 — Hero · MOBILE (4:5, 1440×1800)

```text
[BLOCO BASE]

Formato retrato 4:5, 1440×1800 pixels.

Cena: uma pessoa adulta brasileira de camiseta preta lisa, caminhando ou parada numa esquina de rua
de uma cidade média do Sul do Brasil, em um dia nublado e claro. Calçada levemente úmida, fachadas de
comércio comum ao fundo (sem placas legíveis), fios, muro, alguma árvore urbana. Sensação de rua real
de bairro, nem litoral, nem serra de cartão-postal.

Composição: pessoa no terço inferior e à direita, plano médio, olhando para o lado, não para a
câmera. Espaço negativo amplo no terço superior e à esquerda para um título grande. Faixa inferior
limpa para um campo de busca. Ponto focal em cerca de 60% na horizontal e 55% na vertical.

Luz: difusa, levemente fria, céu encoberto.

Evitar: chimarrão, cuia, bandeira, roupa típica, chapéu, neve, serra fotogênica, monumento.
```

### S1 — Hero · DESKTOP (3:2, 2880×1920)

```text
[BLOCO BASE]

A mesma pessoa e a mesma rua da imagem mobile, agora em paisagem 3:2, 2880×1920 pixels.

A pessoa no terço direito. A rua e as fachadas se abrem para a esquerda, com espaço negativo amplo
na metade esquerda para título e busca. Mesma luz difusa e fria. Ponto focal em 65% na horizontal e
55% na vertical.
```

### S2 — Campanha · MOBILE (4:5, 1440×1800)

```text
[BLOCO BASE]

Formato retrato 4:5, 1440×1800 pixels.

Cena: um balcão ou calçada de comércio de bairro no Sul do Brasil. Três pessoas de idades diferentes
conversando naturalmente, cada uma de camiseta preta lisa (mesma cor, sem desenho). Nenhuma olha para
a câmera. Uma pessoa em primeiro plano, próxima, e as outras duas parcialmente cortadas pelo limite
do quadro.

Composição: enquadramento vertical fechado, câmera na altura dos olhos. Metade superior esquerda
com parede ou fundo desfocado, limpa, para um bloco de texto. Ponto focal em 55% na horizontal e
50% na vertical.

Luz: natural difusa, ambiente urbano cotidiano.

Evitar: grupo posado sorrindo para a câmera, brinde, churrasco, chimarrão, roupa típica.
```

### S2 — Campanha · DESKTOP (16:9, 2880×1620)

```text
[BLOCO BASE]

A mesma cena e as mesmas três pessoas da imagem mobile, agora em paisagem 16:9, 2880×1620 pixels.

As três pessoas mais abertas no quadro, em conversa, no terço direito e central. Terço esquerdo
limpo (parede ou fundo desfocado) para o bloco de texto. Câmera na altura dos olhos. Mesma luz.
```

---

## NORTE

### N1 — Hero · MOBILE (4:5, 1440×1800)

```text
[BLOCO BASE]

Formato retrato 4:5, 1440×1800 pixels.

Cena: uma pessoa adulta brasileira de camiseta preta lisa, em plano médio, numa calçada ou à beira
de um rio numa cidade do Norte do Brasil (cidade amazônica contemporânea real, não floresta
intocada). Céu carregado e úmido, verde presente ao fundo, água como rua (rio ou igarapé de uso
comum, sem barco pitoresco), casas e comércio de bairro com telhas e concreto.

Composição: pessoa no terço inferior e à esquerda, olhando para o lado, não para a câmera. Espaço
negativo no terço superior e à direita para título. Faixa inferior limpa para um campo de busca.
Ponto focal em cerca de 40% na horizontal e 55% na vertical.

Luz: difusa, quente-úmida, céu encoberto, sem sol dourado.

Evitar: cocar, indígena como adereço, boto, Boi-Bumbá, foto aérea de rio, floresta como pano de
fundo genérico, barco turístico.
```

### N1 — Hero · DESKTOP (3:2, 2880×1920)

```text
[BLOCO BASE]

A mesma pessoa e o mesmo lugar da imagem mobile, agora em paisagem 3:2, 2880×1920 pixels.

A pessoa no terço esquerdo. A margem, a água e as casas se abrem para a direita, com espaço
negativo amplo na metade direita para título e busca. Mesma luz úmida e difusa. Ponto focal em
35% na horizontal e 55% na vertical.
```

### N2 — Campanha · MOBILE (4:5, 1440×1800)

```text
[BLOCO BASE]

Formato retrato 4:5, 1440×1800 pixels.

Cena: uma feira ou porto de bairro numa cidade do Norte do Brasil, movimento cotidiano. Duas ou três
pessoas de idades diferentes em conversa, cada uma de camiseta preta lisa. Nenhuma olha para a
câmera. Uma em primeiro plano, as outras parcialmente cortadas pelo quadro.

Composição: enquadramento vertical fechado, câmera na altura dos olhos. Metade superior direita
com fundo desfocado e limpo para bloco de texto. Ponto focal em 45% na horizontal e 50% na vertical.

Luz: difusa e úmida, ambiente real de rua.

Evitar: artesanato para turista, adereços indígenas, grupo posado, cocar, pratos típicos como
protagonista.
```

### N2 — Campanha · DESKTOP (16:9, 2880×1620)

```text
[BLOCO BASE]

A mesma cena e as mesmas pessoas da imagem mobile, agora em paisagem 16:9, 2880×1620 pixels.

Pessoas no terço esquerdo e central, em conversa. Terço direito limpo para o bloco de texto.
Câmera na altura dos olhos. Mesma luz.
```

---

## CENTRO-OESTE

### C1 — Hero · MOBILE (4:5, 1440×1800)

```text
[BLOCO BASE]

Formato retrato 4:5, 1440×1800 pixels.

Cena: uma pessoa adulta brasileira de camiseta preta lisa, em plano médio, numa avenida larga ou
esquina de uma cidade do Centro-Oeste do Brasil. Horizonte aberto, céu amplo e luz forte, mas
contemporânea e sem cara de propaganda do agronegócio. Concreto, asfalto, terra vermelha na beira
da calçada, árvore de cerrado urbana.

Composição: pessoa no terço inferior e ao centro-direita, olhando para o lado, não para a câmera.
Espaço negativo amplo no terço superior (céu limpo) para título. Faixa inferior limpa para um campo
de busca. Ponto focal em cerca de 58% na horizontal e 55% na vertical.

Luz: natural de dia claro, contraste médio, sombra curta, sem pôr do sol dourado.

Evitar: chapéu de peão, boi, bota, trator, plantação, Congresso Nacional como ícone, sertanejo como
fantasia.
```

### C1 — Hero · DESKTOP (3:2, 2880×1920)

```text
[BLOCO BASE]

A mesma pessoa e o mesmo lugar da imagem mobile, agora em paisagem 3:2, 2880×1920 pixels.

A pessoa no terço direito. A avenida e o horizonte se abrem para a esquerda, com céu e espaço
negativo amplo na metade esquerda para título e busca. Mesma luz forte e clara. Ponto focal em
65% na horizontal e 55% na vertical.
```

### C2 — Campanha · MOBILE (4:5, 1440×1800)

```text
[BLOCO BASE]

Formato retrato 4:5, 1440×1800 pixels.

Cena: uma calçada em frente a um comércio de bairro numa cidade do Centro-Oeste do Brasil. Duas ou
três pessoas de idades diferentes em conversa, cada uma de camiseta preta lisa. Nenhuma olha para a
câmera. Uma em primeiro plano, as outras parcialmente cortadas pelo quadro. Céu aberto ao fundo.

Composição: enquadramento vertical fechado, câmera na altura dos olhos. Metade superior esquerda
com fundo desfocado e limpo para bloco de texto. Ponto focal em 55% na horizontal e 50% na vertical.

Luz: natural, clara e forte, ambiente urbano real.

Evitar: peão, boi, bota, chapéu, churrasco, grupo posado, arena de rodeio.
```

### C2 — Campanha · DESKTOP (16:9, 2880×1620)

```text
[BLOCO BASE]

A mesma cena e as mesmas pessoas da imagem mobile, agora em paisagem 16:9, 2880×1620 pixels.

Pessoas no terço direito e central, em conversa. Terço esquerdo limpo para o bloco de texto.
Câmera na altura dos olhos. Mesma luz.
```

---

## Depois de gerar

1. Salvar em `public/banners/<região>/<slot>-<mobile|desktop>.jpg` (ou `.webp`).
2. Preencher o slot em `src/lib/editorial/banners.ts` (`REGION_BANNERS`), com `alt`, `focal` e `overlay` definidos olhando o resultado.
3. Rodar `npx playwright test` e conferir a primeira dobra a 360×780 e 1440×900.
4. Validar **[validar]** com alguém do lugar.

# Avaliações na home da Sul (runbook)

Bloco "Quem usa, recomenda!" (fotos de clientes) e "O que nossos clientes dizem" (avaliações com texto) nas homes das três lojas
(Sul, Norte e Centro-Oeste), **seção do painel** ("Avaliações de clientes") que se move, se oculta e se edita. Mesma ideia do bloco
que a Graxa injeta na loja INK, aqui feito direto na vitrine.

## Como ele entra na home

A produção roda a **home configurável** (`SITE_CONFIG_HOME=on`) com o documento publicado pelo painel
(`/app/data/generated/site-config/published.json`; sem ele a home sai da seed, `src/lib/site-config/seed.ts`). Ao procurar esse arquivo, a base
é `data/generated`, **não** `data/generated/loja-unica` (esta só guarda o snapshot do catálogo). Há ainda uma home fixa (flag desligada), que
também mostra o bloco.

- **Seção do painel** (`template: "reviews"`, modelo "Avaliações de clientes" em *Componentes da home*): uma por região, entra antes da
  campanha de fechamento e, daí, move-se, oculta-se e publica-se como qualquer seção. O **título e o subtítulo** da seção são os da faixa de
  fotos ("Quem usa, recomenda!" e a frase embaixo); o título dos cards ("O que nossos clientes dizem"), a nota e o total são do código e da
  loja. A **âncora** da seção é o `id` no HTML (`avaliacoes`), para o menu do cabeçalho rolar até ela ("Avaliações" é o apelido sugerido).
  Só existe na home: uma página (hotpage, landing) recusa a seção.
- **Documento sem a seção** (qualquer publicação anterior a ela): o bloco **continua aparecendo** antes da campanha de fechamento quando
  esta é a última seção, ou no fim da home (`closingSlot`). Assim o deploy não faz o bloco sumir. Com a seção no documento, **ativa ou
  desativada**, quem manda é o painel (desativada = não aparece, sem o fallback).
- **Três lojas**: Norte e Centro-Oeste leem as avaliações **da mesma loja única** que a Sul (a INK tem uma loja só); "Seguir a Sul" já
  copia a seção da Sul para elas, e "Aparece em" (editor da Sul) tira a seção de uma região. Cada região também pode ter a sua própria
  seção. `REVIEWS_REGIONS` lista as regiões que podem mostrá-las.
- **Fundo escuro**: numa home com "Fundo da home" escuro (tema de Natal), a seção mantém a própria superfície clara e o texto escuro
  (`on-light own-surface`), como as outras seções claras.
- `REVIEWS_HOME=off` esconde o bloco em todas as regiões, esteja ele em seção ou no fallback.

## De onde vêm os dados

A API da INK **não tem endpoint de avaliações**. A fonte é a página pública da loja, `<loja INK>/reviews?sort=recents`
(`SUL_INK_ORIGIN + SUL_INK.base`, acompanha a flag de domínio da loja única), lida **no servidor** e interpretada por
`src/lib/reviews/parse.ts` (mesmo estilo do `ink-faq.ts`: regex sobre o HTML, testada contra uma cópia salva em
`tests/fixtures/ink-reviews/`).

- **Nota e total** vêm do resumo da INK (`#rating`) e contam **todas** as avaliações da loja.
- **Fotos**: a galeria da página. São as **mesmas 33 em todas as páginas**, até a da avaliação mais antiga (jan/2026), e toda foto de
  card que conferi está dentro dela: é o conjunto completo (leitura de 17/11/2026). A faixa recebe todas (teto de 36).
  Ela começa com 12 tiles e abre mais 12 quando o fim se aproxima, e **cada foto só carrega quando o tile chega perto da parte
  visível** (`NEAR` em `ReviewPhotoStrip.tsx`): num celular são ~2 tiles na tela, num desktop ~6. O `loading="lazy"` do navegador não
  serve aqui (mede a partir do viewport da página e carregava as 12 na chegada).
- **Cards**: até 3 páginas de 5 são lidas até haver 6 com 4 estrelas ou mais **e com texto** (`isFeatured`). Cerca de 40% das
  avaliações recentes são só estrelas: não viram card na home, mas aparecem na lista completa.

## Decisões que valem ser lembradas

- **Só 4 e 5 estrelas viram card** (`FEATURED_MIN_RATING` em `parse.ts`). O resumo mostra a nota real da loja inteira e o
  botão "Ver todas as avaliações" abre a lista completa, sem filtro, num modal. Motivo: há avaliações de 2 estrelas com texto de
  elogio (clique errado), que na home pareceriam um erro. Para mostrar tudo, baixar a constante para 1.
- **Nunca se assume nota**: um card cujas 5 estrelas não dá para contar é descartado (a Graxa assume 5).
- **As três regiões** (`REVIEWS_REGIONS`). As avaliações são da loja única, que vende Sul, Norte e Centro-Oeste, e hoje falam quase só
  de camisetas do Sul; mesmo assim o bloco serve às três (decisão do dono: a Sul é a base hoje). Não há filtro por região.
- **Sem autoplay**, como os outros carrosséis da home (um carrossel que anda sozinho exigiria botão de pausa).
- **"Ver todas as avaliações" abre um modal da vitrine, sem redirect.** Um iframe da página da INK não serve: ela responde
  `X-Frame-Options: SAMEORIGIN` (a Graxa consegue porque lá é a mesma origem). A vitrine mesma desenha a lista (ver "Lista
  completa" abaixo). O link continua sendo um link de verdade para a página da INK (clique com Cmd/Ctrl, botão do meio, sem
  JavaScript) e é o "Ver na loja" que o modal oferece se não conseguir carregar.
- **Fotos pelo otimizador do Next a partir da original** (`/images/review_image/**` em `next.config.ts`). A miniatura de 320 px da
  INK não aplica a rotação da câmera (foto em pé aparece deitada) e fica mole em tela retina. Só a miniatura entra como
  reserva quando o endereço da original não pode ser lido. Só hosts da INK são aceitos (`parse.ts`).

## Lista completa (o modal)

- `GET /api/avaliacoes?page=N` (`src/app/api/avaliacoes/route.ts`) devolve uma página da INK (5 avaliações, mais recentes
  primeiro), **sem filtro**: todas as notas, inclusive as só com estrelas, cada uma com as fotos enviadas nela. Só aceita
  `page` de 1 a 60; `nextPage` é sempre a página seguinte da própria INK. Falha da INK vira 502 sem cache; `REVIEWS_HOME=off`
  vira 404.
- O modal (`AllReviewsModal`, sobre o `SheetDialog`: bottom sheet no celular, painel a partir de `sm`) pede a página 1 ao abrir e
  as seguintes sozinho, quando o fim da lista se aproxima; "Ver mais avaliações" faz o mesmo à mão e, depois de uma falha,
  "Tentar de novo" repete a página. Uma avaliação que mudou de página (alguém avaliou enquanto se rola) não aparece duas vezes
  (`reviewKey`, `src/lib/reviews/key.ts`).
- Cada página da INK passa pelo cache de dados do Next (30 min), então a INK é consultada por página no máximo nesse intervalo,
  qualquer que seja o número de visitantes rolando a lista.

## Cache e falha

- A leitura usa `fetch` com `next: { revalidate: 1800 }` (cache de dados do Next): a INK é consultada no máximo a cada
  30 min e a home continua ISR (`revalidate = 60`). **Nunca usar `cache: "no-store"` aqui**: a rota viraria dinâmica.
- Resposta que não seja 200, ou 200 sem avaliações nem fotos, lança erro (nunca vira "zero avaliações"). Com a INK fora,
  vale a última leitura boa do processo por até 6 h; depois disso, o bloco some. Nada quebra a home.
- **Primeira vez após um deploy**: cada foto (e cada largura de tela) é baixada da INK e redimensionada uma vez. Medido em
  17/11/2026 com `Accept: avif`: de menos de 1 s a ~5 s, quase tudo é o download da original (até 7 MB). A faixa mostra o
  quadro cinza até chegar, e depois fica em cache.

## Cloudflare (por que o bloco pode sumir em produção)

Em 19/11/2026, logo após o deploy do bloco, o Railway recebia **403 com `cf-mitigated: challenge`** da loja
(`loja.useorigens.com.br/useorigens/reviews`; o domínio antigo `www.usesul.com.br/usesul` só redireciona para ele). O desafio é
por **IP** (o do Railway é de datacenter) e vale para qualquer user-agent, inclusive o de navegador; da máquina do dono a mesma
URL dá 200. Sem tratamento, o log mostra `reviews.list-error ... INK responded 403 (Cloudflare challenge)`, a rota
`/api/avaliacoes` dá 502 e a home esconde o bloco (como desenhado).

A saída é **deixar passar a leitura do servidor**, não disfarçá-la:

1. No Railway (serviço `useorigens-storefront`), `REVIEWS_READ_KEY` = um segredo longo e aleatório (ex.: `openssl rand -hex 32`).
   O servidor passa a enviá-lo no cabeçalho `x-reviews-read-key` (`READ_KEY_HEADER` em `source.ts`). Sem a variável, não envia nada.
2. No Cloudflare da zona (WAF → Regras personalizadas), uma regra com ação **Skip**, só para o que desafiar este caminho:

   ```
   (http.host eq "loja.useorigens.com.br"
    and starts_with(http.request.uri.path, "/useorigens/reviews")
    and any(http.request.headers["x-reviews-read-key"][*] eq "<o mesmo valor de REVIEWS_READ_KEY>"))
   ```

   Em "Skip", marcar os componentes que estiverem desafiando (Security Level, Browser Integrity Check, Super Bot Fight Mode, regras
   gerenciadas, limite de taxa). O *Bot Fight Mode* do plano gratuito **não aceita exceção por regra**: nesse caso é preciso mudar o
   modo da zona.
3. Conferir: com a regra no ar, o log deixa de ter `reviews.list-error` e `/api/avaliacoes?page=1` dá 200 em ~1 min.

Girar o segredo: troque o valor nos dois lugares (Railway e regra); entre uma troca e outra o bloco só esconde, não quebra a home.

## Operação

- `REVIEWS_HOME=off` esconde o bloco sem mexer no código (variável de runtime). Qualquer outro valor deixa ligado.
- `REVIEWS_READ_KEY`: ver "Cloudflare" acima. Só o valor, nunca no repositório.
- **Não coberto**: avaliações por região (todas leem a mesma loja) e o título dos cards, fixo no código.
- Se a INK mudar o HTML da página de avaliações, o parser devolve vazio e o bloco some; atualizar `parse.ts` e o fixture.

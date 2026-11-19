# Avaliações na home da Sul (runbook)

Bloco "Quem usa, recomenda!" (fotos de clientes) e "O que nossos clientes dizem" (avaliações com texto) na home `/sul`,
logo antes da campanha de fechamento. Mesma ideia do bloco que a Graxa injeta na loja INK, aqui feito direto na vitrine.

## Em qual home ele aparece

Há duas homes no mesmo `src/app/[region]/page.tsx`, e **a produção roda a configurável** (`SITE_CONFIG_HOME=on`; sem
`published.json` no Volume ela sai da seed, `src/lib/site-config/seed.ts`). O bloco aparece nas duas:

- **Home fixa** (`SITE_CONFIG_HOME` desligado): JSX direto, entre o DDD e a campanha.
- **Home configurável**: o bloco **não é uma seção do documento** (não aparece no painel, não se reordena nem se esconde por lá).
  A página o entrega à `HomeSections` na prop `reviews`, e ele é desenhado **logo antes da campanha de fechamento** quando esta é
  a última seção (`closingSlot`); se a última seção for outra coisa (home editada no painel), vai no fim. Só a `RegionHome` passa
  a prop: hotpages, páginas e a prévia do painel não o mostram. Para escondê-lo: `REVIEWS_HOME=off`.
- Virar seção do painel (`template` novo no esquema, padrões, ações do painel e publicação) é o caminho se o dono quiser mexer
  nele por lá; não foi feito.

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
- **Só a Sul** (`REVIEWS_REGIONS`). As avaliações são da loja única, que vende Sul, Norte e Centro-Oeste, mas hoje falam quase só
  de camisetas do Sul; Norte e Centro-Oeste não mostram o bloco até haver critério por região.
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

## Operação

- `REVIEWS_HOME=off` esconde o bloco sem mexer no código (variável de runtime). Qualquer outro valor deixa ligado.
- **Não coberto**: o bloco não é editável pelo painel (ver "Em qual home ele aparece").
- Se a INK mudar o HTML da página de avaliações, o parser devolve vazio e o bloco some; atualizar `parse.ts` e o fixture.

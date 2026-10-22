# Feed do Google Merchant (fonte de dados própria)

## Por que existe

O Merchant Center lia o export da INK (`export_csv.google_tsv_store_feed_<id>`). Esse export tem três problemas:

- **Imagem errada.** A INK manda a imagem da primeira variante criada no cadastro, quase sempre a camiseta vermelha ou bordeaux. A capa que a página de produto mostra (e que o nosso site usa) não vai.
- **Cor e tamanho dessa mesma variante.** Saem "Vermelho 3G" e "Bordeaux P" para mais de 17 mil itens.
- **Placeholder.** Cerca de 3,4 mil itens vão com a imagem `assets/dashboard/arts/removed-…png`, que o Google reprova.

## O que o feed faz

O nosso feed parte do mesmo export da INK, lido na hora da geração. Ficam iguais ao export: os ids, os links, os preços, as promoções e a disponibilidade. Assim, o histórico do Google Ads continua e o preço nunca fica atrás da INK.

O clique no anúncio vai direto para a página do produto na loja: `link` = `https://loja.useorigens.com.br/useorigens/product/<slug>`, como no export. Só o arquivo do feed é servido pelo site (`www.useorigens.com.br`), porque é de lá que o Merchant Center o busca.

Em cada linha, troca-se o seguinte:

| Campo | Antes (INK) | Agora |
|---|---|---|
| `image_link` | Mockup da 1ª variante (ou placeholder) | `main_image_url`, a capa |
| `color` | Cor da 1ª variante | Cor que a capa mostra: classificada pela imagem, entre as cores do próprio produto |
| `size` | Tamanho da 1ª variante (3G, P…) | Tamanho disponível naquela cor, preferindo M e G |
| `gender` | `male` | `unisex` quando há modelagem masculina e feminina (ou "Unissex"/"Infantil") |
| `title` | "Camiseta - Ipira \| Território SC" | "Camiseta Ipira (SC) – Estampa Território – Preta \| Use Origens" |
| `description` | Texto genérico da INK | Frase da estampa (cidade, UF, família) + texto da INK |
| `material` | Frase longa | "Algodão" (ou "Algodão/Poliéster" para cinza e moletom) |
| `google_product_category` | 212 para tudo | 212; Body Infantil vai para 5411 (Macacões para bebês) |
| `product_type` | — | `Camiseta > Sul > Santa Catarina > Ipira > Território` |
| `custom_label_0` | Tipo de peça | Tipo de peça (igual) |
| `custom_label_1` | — | Região da estampa (Sul, Norte, Centro-Oeste) |
| `custom_label_2` | Categorias da INK (1.876 valores, acima do limite de 1.000) | Família da estampa (Território, Ponto de Origem…) |
| `custom_label_3` | — | Vendas: "mais vendidos" (≥ 20), "com vendas", "sem vendas" |
| `custom_label_4` | — | UF da estampa |

Quando a cor da capa não é clara, a linha mantém a imagem, a cor e o tamanho da INK. Assim, uma linha nunca sai com imagem de uma cor e `color` de outra. A exceção é o placeholder "removed": nele, a capa entra com o melhor palpite, que é melhor do que uma imagem reprovada.

Um produto que o export tem e o nosso sync ainda não viu passa com o visual da INK e os nossos rótulos. São os kits e os produtos criados depois do último sync.

## Como funciona

1. **Fonte.** O sync diário da loja única (`syncLojaUnica`) já lê todas as páginas de produtos visíveis. Das mesmas respostas, sem nenhuma requisição a mais, ele guarda capa, tipo e variantes (cor, hex, modelo, tamanhos disponíveis) em `loja-unica/merchant-source.json`.
2. **Capas.** `updateCoverColors` baixa só as capas novas ou alteradas, do CDN de imagens da INK, que não usa a cota da API. O veredito fica em `loja-unica/merchant-cover-colors.json`.
   - A classificação remove o fundo cinza da foto e compara as maiores áreas de cor com o `hex_color` das cores do próprio produto, em CIELAB, com a luminosidade pesando metade.
   - Só vale um vencedor claro: pelo menos 45% e 1,5× o segundo colocado.
   - Na amostra de validação, acertou camisetas pretas (que o export chamava de vermelhas), a "Santa Catarina | Clean" verde (o export dizia Marinho), o body branco e a oversized off white.
3. **Feed.** `generateMerchantFeed` lê o export da INK e grava `loja-unica/google-merchant.tsv`, com um relatório em `google-merchant.json`.
   - A gravação é atômica.
   - O feed é recusado, e o anterior é mantido, se o export vier sem colunas ou com menos de 80% das linhas da última geração.
4. **Agenda.**
   - O job diário roda capas e feed depois da loja única. É só um relatório e nunca deixa o job "sujo".
   - A rota pública regenera o feed (só o export, sem capas) quando o arquivo passa de 4 horas. Assim, preços e promoções acompanham a INK ao longo do dia.

## Endereços

- **Feed:** `GET https://www.useorigens.com.br/api/feeds/google-merchant`.
  - Com `MERCHANT_FEED_TOKEN`, acrescentar `?token=…`.
  - Responde 503 antes da primeira geração. Nunca serve um feed vazio, que o Merchant Center leria como "todos os produtos removidos".
- **Manual:**
  - `POST /api/admin/merchant-feed` (Bearer `ADMIN_SYNC_TOKEN`) julga as capas que faltam e regenera o feed, em segundo plano.
  - Logo depois do primeiro deploy, o sync diário ainda não gravou a fonte. Nesse caso, o POST lê os produtos da INK ele mesmo: só GET, ~180 páginas, sob a trava do job diário, para não dividir a cota com ele.
  - `GET` na mesma rota devolve o último relatório.
- **Local:** `npm run merchant:feed -- --ler --dir=<pasta com catalog-snapshot.json da loja única>`.

## Virada no Merchant Center

1. Configurar `INK_GOOGLE_FEED_URL` (e, se quiser, `MERCHANT_FEED_TOKEN`) no Railway.
2. Depois do deploy, rodar `POST /api/admin/merchant-feed`.
   - A primeira vez julga todas as ~17 mil capas e leva alguns minutos.
   - Conferir o `GET` (relatório) e abrir o feed.
3. No Merchant Center, criar uma fonte de dados de arquivo com busca programada (diária) apontando para a URL do feed, em Brasil/português.
4. **Pausar ou remover a fonte da INK.** Duas fontes principais com os mesmos ids disputam o item.
5. Acompanhar o diagnóstico do Merchant Center nos dias seguintes: aprovações, "imagem não corresponde" e preço.

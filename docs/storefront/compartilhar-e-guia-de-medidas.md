# Compartilhar e Guia de medidas (storefront)

Rodada de 2026-10-05. A parte da INK (botão "Compartilhar" na PDP e o link nativo de medidas reestilizado) está no Worker:
`worker-lojas` → `docs/pdp-share-size-guide.md`.

## Compartilhar

| Onde | O que compartilha |
|---|---|
| Card que abre a INK direto (cidade, "Outros estilos", home, busca) | a PDP pública real da INK (`store_product_url`) |
| Card de família com versões (abre a página da estampa) | a página da estampa, como **"Compartilhar estampa"** |
| Página da estampa (`VariantPicker`), depois do CTA | a PDP real da INK da versão selecionada |
| Página de cidade e de estado, sob o título | a URL canônica da página |

- O storefront não tem rota que fixe um produto e sua peça/modelagem, então um produto é sempre a PDP da INK. A página da estampa abre na versão
  principal e por isso nunca representa outra versão.
- URL montada **no servidor** (`src/lib/share/server.ts`) por allowlist: https, host em `ALLOWED_COMMERCE_HOSTS`, caminho `/<loja>/product/<slug>`,
  **sem query nem hash** (`src/lib/share/url.ts`, testado em `tests/unit/share-url.test.ts`). Destino não verificável = nenhum botão, nunca um link
  substituto. Páginas do storefront: `SITE_URL` + caminho canônico (o mesmo do `alternates.canonical`), sem `?peca=` nem nada da navegação.
- Clique: `navigator.share` direto (os dados já vêm prontos). `AbortError` = nada. Sem suporte ou outra falha: folha com "Copiar link" (confirma só após
  sucesso; senão mostra o link selecionável) e "WhatsApp" (`wa.me/?text=`, sem destinatário). Escape, fundo e "Fechar" fecham e devolvem o foco.
- Prévia do link: cidade, estado e estampa já servem `og:title`, `og:description`, `og:image` e `og:url` no HTML (sem JS).
- GA4: `share` (`method`, `content_type`, `item_id` = id INK ou caminho, nunca URL).

## Guia de medidas

Fonte: as imagens oficiais da INK que o próprio modal "Confira suas medidas" mostra em cada PDP (`images/size_table/*`). O artigo público
`integracoes.reserva.ink/…/10926971` respondeu Cloudflare 1014 em 2026-10-05. Cada número de `src/lib/catalog/size-guides.ts` foi transcrito e
conferido valor a valor contra a imagem em 2026-10-05; a imagem oficial também aparece no guia (ampliável).

| `product_type.id` | Peça | Modelagens (variante `model` da INK) | Colunas | Tolerância |
|---|---|---|---|---|
| 1 | Camiseta | Clássica \| Unissex (Masculino), Baby Look \| Feminina (Feminino) | Comprimento, Abdômen, Ombro, Manga / Comprimento, Busto, Cintura, Ombro, Manga | ±2 / ±1 cm |
| 72 | Algodão Peruano | Masculino, Feminino (mesmos valores de Clássica / Baby Look; nota oficial verde musgo e oliva) | idem | ±2 / ±1 cm |
| 178 | Oversized | Unissex | Comprimento, Manga, Tórax, Boca da manga | ±2 cm |
| 8 | Regata | — | Comprimento, Abdômen, Ombro | ±1 cm |
| 2 | Infantil | 02–14 anos | Comprimento, Ombro, Manga | ±1 cm |
| 165 | Body infantil | 03–24 meses | Comprimento, Tórax, Ombro, Manga | ±2 cm |
| 23 | Cropped | — | Busto, Comprimento, Ombro, Manga | ±1 cm |
| 28 | Cropped moletom | — | Busto, Comprimento, Ombro, Manga | ±1 cm |
| 119 | Moletom capuz (Hoodie Slim) | — | Comprimento, Tórax, Manga | ±1 cm |
| 120 | Moletom suéter (Suéter Slim) | — | Comprimento, Tórax, Manga | ±1 cm |

- Medidas **da peça** estendida; larguras são de um lado ao outro (não circunferência), conforme as ilustrações oficiais.
- Onde aparece: na página da estampa, na linha do preço (antes do CTA, sem empurrá-lo para fora da primeira tela); na cidade, ao lado das abas de peça
  (abre na peça selecionada) ou do título "Estilos" quando não há abas. Nunca um botão por card.
- Folha inferior no celular, modal no desktop (`SheetDialog`, `<dialog>` nativo). Dados estáticos: trocar de modelagem nunca mostra a tabela anterior.
- `product_type` sem tabela → só "Consultar medidas na página de compra" (para o produto real), nunca números genéricos.
- O guia não diz que um tamanho está em estoque: "A disponibilidade de cada tamanho aparece na página de compra".
- GA4: `size_guide_open` (`garment_type_id`, `source`).

## Verificação

`tests/unit/share-url.test.ts` (URL, texto, mapeamento das modelagens) e `tests/e2e/share-size-guide.spec.ts` (nativo, cancelamento, menu, cópia que
falha, Escape/foco, card sem navegação, guia sem valores antigos, folha inferior a 360 px sem rolagem lateral). Capturas em
`docs/screenshots/compartilhar-medidas/`.

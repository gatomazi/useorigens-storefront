# Eventos GA4 da ponte INK ⇄ storefront (custom events v1)

Contexto e rollout: `use-origens-workers/docs/expansao-cinco-produtos-analytics.md`. **Não são eventos de compra.** `origens_go_to_cart_click` só significa que a pessoa abriu o carrinho (nunca `begin_checkout`/`purchase`; nada vai ao Meta).

## Matriz

| Evento | Disparo exato | Host | `entry_point` | Parâmetros |
|---|---|---|---|---|
| `origens_go_to_cart_click` | clique real em **Ir para meu carrinho** (a navegação nunca espera o analytics; `transport_type: beacon`) | storefront | `storefront_cart_mirror` | `entry_point`, `region=sul`, `cart_items_bucket` |
| `origens_cart_mirror_view` | **uma vez por abertura** do painel "Meu carrinho" com snapshot válido na tela (não no estado neutro/erro, não em re-render nem refresh em segundo plano) | storefront | `storefront_cart_mirror` | `entry_point`, `region`, `cart_items_bucket`, `mirror_age_bucket` |
| `origens_native_cart_opened` | drawer **nativo** visivelmente aberto depois de `?origens_open_cart=1` (nunca pela simples presença do parâmetro) | INK | `storefront_return` | `entry_point`, `region`, `product_slug`, (`send_to`, `transport_type`) |
| `origens_explore_storefront_click` | clique (ou botão do meio) em **qualquer link nosso** para o storefront: `Explorar vitrine`/`Explorar outras camisetas`, resultados da busca do bloco e `← Voltar a procurar` | INK | `ink_cart_drawer`, `ink_post_add` ou `ink_product_return` | `entry_point`, `region`, `product_slug`, (`send_to`, `transport_type`) |
| `origens_storefront_arrived` | landing real no storefront vinda de um link nosso (marcador `origens_src`); **uma vez**, depois do fato | storefront | os três `ink_*` acima | `entry_point`, `region`, `product_slug` (só um dos cinco slugs verificados) |

Buckets: `cart_items_bucket` = total de **peças** do snapshot (`0`, `1`, `2`, `3_5`, `6_plus`; as faixas de promoção da INK são por peça); `mirror_age_bucket` = `under_1m`, `1_5m`, `5_30m`. **Proibido** em qualquer evento: `cart_ref`, corpo do snapshot, ids de sessão/cliente, e-mail/nome, texto de busca, URL com query, `page_location`/`link_url` com token.

## Implementação por host (caminho único de despacho)

- **Storefront** (`useorigens.com.br`): `src/lib/analytics/track.ts` → `window.gtag` do `GoogleAnalytics.tsx` (a mesma propriedade `G-8GYTEJ1F77`, `send_page_view:false`), atrás do **consentimento existente** (`hasAnalyticsConsent`); sem consentimento não sai nada (o `gtag.js` nem é carregado). `CartRefCapture` remove `cart_ref` **e** `origens_src`/`origens_p` numa só `history.replaceState` antes do GA carregar (o `page_view` é enviado manualmente com `page_location` já sem eles; `withoutCartRef` cobre GA e Meta). `sessionStorage` guarda só o token; o snapshot fica em memória.
- **INK** (`www.usesul.com.br`): o `gtag` que a **própria INK** já carrega (mesma propriedade `G-8GYTEJ1F77`; a INK também tem `G-T6BS328VRE`, GTM e Meta/TikTok, aos quais **não** enviamos). `send_to: G-8GYTEJ1F77` evita envio duplicado; só se o `gtag.js` dessa propriedade estiver na página. Não instalamos tag nenhuma. As tags da INK disparam sem depender do aviso de cookies dela; **as nossas só saem depois de o visitante aceitar esse aviso** (senão: sem medição do clique na INK; o marcador nos links segue e o storefront conta a chegada sob o consentimento dele). Mudar essa política: `REQUIRE_INK_COOKIE_NOTICE_ACCEPTED` em `use-origens-workers/src/loader/tracking.js`.

## O que fica sem medir (limites)

Consentimento negado/ignorado, bloqueadores de anúncio, transições e o gate do aviso da INK reduzem a contagem: **os números são um piso**. Por isso separe **clique observado** de **chegada confirmada**. Não há causalidade de vendas nem conversão real só com estes eventos.

## Configuração no painel do GA4 (fazer no painel; não foi feito aqui)

1. Admin → Definições personalizadas → **Dimensões personalizadas** → criar, escopo **Evento**: `entry_point`, `product_slug`, `cart_items_bucket`, `mirror_age_bucket`.
2. Admin → Fluxos de dados → o fluxo web → **Configurar definições de tag → Mostrar tudo → Redação de dados**: adicionar **`cart_ref`** (e, por segurança, `origens_src`, `origens_p`) como chaves de parâmetro de URL a redigir. É defesa adicional; a proteção principal está no código.
3. (Opcional) marcar `origens_storefront_arrived` e `origens_native_cart_opened` como eventos-chave só se quiser vê-los como metas; **não** os marque como compra.

## Como testar

- **Realtime/DebugView:** aceite cookies no storefront e no aviso da INK; abra a extensão *Google Analytics Debugger* (ou `?debug_mode=1` no `config`) e siga: INK (produto da lista) → `Explorar vitrine` → storefront (`origens_explore_storefront_click` na INK, `origens_storefront_arrived` no storefront) → `Meu carrinho` (`origens_cart_mirror_view`) → `Ir para meu carrinho` (`origens_go_to_cart_click`) → INK com drawer aberto (`origens_native_cart_opened`).
- **Network:** filtre por `collect` e confira `dl=`/`dr=`: nenhum contém `cart_ref`, `origens_src` ou `origens_p`.
- **Local (sem GA real):** `npx vitest run tests/unit/origens-events.test.ts`; `npx playwright test tests/e2e/cart-mirror.spec.ts`; no Worker `node --test test/tracking.dom.test.js` e `PW_PATH=… node scripts/qa-expansao.mjs`.

## Como comparar

1. Funil do espelho: `origens_cart_mirror_view` → `origens_go_to_cart_click` → `origens_native_cart_opened` (mesma sessão, por `cart_items_bucket`).
2. Ida: `origens_explore_storefront_click` → `origens_storefront_arrived`, quebrado por `entry_point`. A razão arrived/click <1 é esperada (consentimento, adblock, o gate do aviso da INK, abas fechadas); é um piso, não uma taxa de conversão.
3. Volume por `product_slug` nas cinco páginas (só eventos originados na INK).

# Eventos GA4 da ponte INK ⇄ storefront (custom events v1)

Contexto e rollout: `use-origens-workers/docs/expansao-cinco-produtos-analytics.md`. **Não são eventos de compra.** `origens_go_to_cart_click` só significa que a pessoa abriu o carrinho (nunca `begin_checkout`/`purchase`; nada vai ao Meta).

## Matriz

| Evento | Disparo exato | Host | `entry_point` | Parâmetros |
|---|---|---|---|---|
| `origens_go_to_cart_click` | clique real em **Ir para meu carrinho** (a navegação nunca espera o analytics; `transport_type: beacon`) | storefront | `storefront_cart_mirror` | `entry_point`, `region=sul`, `cart_items_bucket` |
| `origens_cart_mirror_view` | **uma vez por abertura** do painel "Meu carrinho" com snapshot válido na tela (não no estado neutro/erro, não em re-render nem refresh em segundo plano) | storefront | `storefront_cart_mirror` | `entry_point`, `region`, `cart_items_bucket`, `mirror_age_bucket` |
| `origens_native_cart_opened` | drawer **nativo** visivelmente aberto depois de `?origens_open_cart=1` (nunca pela simples presença do parâmetro) | INK | `storefront_return` | `entry_point`, `region`, `product_slug`, (`send_to`, `transport_type`) |
| `origens_explore_storefront_click` | clique (ou botão do meio) em **qualquer link nosso** para o storefront: `Explorar todas as estampas` (página do produto, drawer pós-adição e drawer do carrinho), resultados da busca do bloco e, só como plano B, o link simples da página do produto | INK | `ink_product_detail` (bloco "Continue explorando" na página do produto), `ink_post_add`, `ink_cart_drawer` ou `ink_product_return` (plano B / link antigo) | `entry_point`, `region`, `product_slug`, (`send_to`, `transport_type`) |
| `origens_discovery_search_open` | toque em **Buscar cidade ou estado** que expande a busca do bloco (intenção; nunca o texto digitado, uma vez por toque) | INK | `ink_product_detail` ou `ink_cart_drawer` | `entry_point`, `region`, `product_slug`, (`send_to`, `transport_type`) |
| `origens_storefront_arrived` | landing real no storefront vinda de um link nosso (marcador `origens_src`); **uma vez**, depois do fato | storefront | os quatro `ink_*` acima | `entry_point`, `region`, `product_slug` (qualquer slug com o formato de catálogo `^[a-z0-9][a-z0-9_-]{0,127}$`; até 13/10/2026 só os cinco slugs do piloto eram aceitos e o loader já rodava em todas as PDPs, então a dimensão ficava vazia para o resto) |

### Guia da página de produto (`pdp-guide`, Worker; rodada de 13/10/2026)

Eventos próprios do guia "Procurando sua cidade ou outra estampa?", todos na INK, pelo mesmo caminho e com as mesmas regras acima (gtag da própria INK, só após o aceite do aviso dela, `transport_type: beacon`). Parâmetros comuns: `entry_point=ink_product_detail`, `region`, `surface=ink`, `feature_version=guide_v1`, `product_slug`. Nunca o texto digitado. Contrato completo e comparação de variantes: `use-origens-workers/docs/pdp-guide.md`.

| Evento | Quando | Parâmetros próprios |
|---|---|---|
| `origens_guide_view` | convite ≥ 50 % visível, uma vez por página | — |
| `origens_guide_open` | painel aberto por toque | `guide_path` (`city`, `prints`, `city_context`, `reopen`) |
| `origens_guide_dismiss` | ✕ no convite (lembrado 30 dias no navegador) | — |
| `origens_guide_city_select` | cidade escolhida na busca | `city_slug`, `uf` |
| `origens_guide_results` | resultados desenhados | `guide_path`, `result_count`, `has_results` |
| `origens_guide_product_click` | produto do guia clicado (abre a PDP da INK) | `guide_path`, `position`, `target_product_id` |
| `origens_guide_error` | busca ou API do guia falhou | `guide_step` |

Os links do guia para o storefront ("Ver todas as estampas de…", "Ver a coleção completa", rodapé) continuam `origens_explore_storefront_click` → `origens_storefront_arrived` com `entry_point=ink_product_detail`.

**O mesmo guia na página da estampa do storefront** (`/<região>/<uf>/<cidade>/<família>`, `src/components/catalog/PdpGuide.tsx`, `trackGuide` em `src/lib/analytics/track.ts`): mesmos sete eventos e parâmetros, pelo caminho único do storefront (`window.gtag` atrás do consentimento), com `surface=storefront` e `entry_point=storefront_design_page`; `product_slug` é o slug INK do produto principal da página. Diferença de semântica: `origens_guide_open` com `guide_path=city_context` ("Mais estampas de <cidade>") rola até "Outros estilos de <cidade>" da própria página em vez de abrir painel. O clique num produto do guia dispara, além de `origens_guide_product_click`, o `GoToInk`/`select_item`+`go_to_ink` de sempre com `source_section` `pdp_guia_cidade` ou `pdp_guia_colecao` — nunca `PageView`, `ViewContent`, `AddToCart` ou `Purchase`. Dimensões novas a criar no painel do GA4 (escopo evento): `feature_version`, `guide_path`, `guide_step`, `city_slug`, `uf`, `result_count`, `has_results`, `position`, `target_product_id`.

### "Sua cidade" no menu do storefront (jornada numa tela só; rodada de 27/10/2026)

"Sua cidade" (no topo do desktop, no menu do celular e no "Encontre aqui a sua cidade" da seção "Sua cidade, de 8 jeitos" da home) abre uma tela cheia com três passos, sem trocar de página: **cidade → modelo → peça**, e a barra de compra leva ao produto daquela peça na INK (`src/components/city-journey/CityJourney.tsx`, `trackCityJourney` em `src/lib/analytics/track.ts`). Só GA4, pelo caminho único do storefront (`window.gtag` atrás do consentimento). Parâmetros comuns: `region`, `surface=storefront`, `feature_version=sua_cidade_v1`, `entry_point` (`header` = topo do desktop, `menu` = menu do celular, `home` = link da home, `landing` = o link dos anúncios, qualquer página com `?abrir=cidade`, ex.: `/sul?abrir=cidade&utm_source=…`) e, depois de escolhida a cidade, `city_slug` e `uf`. Nunca o texto digitado.

| Evento | Quando | Parâmetros próprios |
|---|---|---|
| `origens_sua_cidade_open` | a jornada abre (toque em "Sua cidade") | — |
| `origens_sua_cidade_state` | um estado escolhido no campo abre a lista das cidades dele, ali mesmo | `uf` (do estado) |
| `origens_sua_cidade_model` | um modelo da cidade é escolhido | `family`, `position` (1 = primeiro da grade), `model_count`, `piece_count` |
| `origens_sua_cidade_piece` | outra peça é escolhida para o modelo | `family`, `garment_type` (slug da peça: `oversized`, `moletom-capuz`…) |
| `origens_sua_cidade_error` | os modelos da cidade não carregaram | — |

Os passos com evento próprio da loja não ganham um novo: a cidade escolhida no campo dispara `Search` + `SelectCity` / `view_search_results` + `select_city`, e o botão para a loja dispara `GoToInk` / `select_item` + `go_to_ink`, todos com origem `sua_cidade` (`source` ou `source_section`). Peça diferente da camiseta clássica leva `garment_type` com o nome da peça, como nas abas da página da cidade. Uma cidade escolhida na lista de um estado ou num atalho "Em destaque" dispara só `SelectCity` / `select_city`. Até 27/10/2026 o link da home abria a busca e media `select_city` com `source=home_styles_search`; desde então é a jornada (`sua_cidade` + `entry_point=home`). Funil sugerido: `origens_sua_cidade_open` → `select_city` (source `sua_cidade`) → `origens_sua_cidade_model` → `go_to_ink` (source_section `sua_cidade`). Dimensões a criar no painel do GA4 (escopo evento), se ainda não existirem: `family`, `garment_type`, `model_count`, `piece_count`; `city_slug`, `uf` e `position` são as mesmas do guia.

Buckets: `cart_items_bucket` = total de **peças** do snapshot (`0`, `1`, `2`, `3_5`, `6_plus`; as faixas de promoção da INK são por peça); `mirror_age_bucket` = `under_1m`, `1_5m`, `5_30m`. **Proibido** em qualquer evento: `cart_ref`, corpo do snapshot, ids de sessão/cliente, e-mail/nome, texto de busca, URL com query, `page_location`/`link_url` com token.

### Ajustes de conversão e de rastreamento (rodada de 09/11/2026)

Origem: relatório do GA4 de 26/10 a 08/11 (79% das sessões da Meta veem um produto, só 3,8% colocam no carrinho).

**Parâmetro `source` trocado por `source_section` (corrige origens falsas).** O GA4 usa o parâmetro de evento `source` como origem da *sessão*: `header_search_bar`, `hero_search`, `search_dialog`, `state_selector` e `sua_cidade` apareciam em "Origem da sessão" (56, 33, 32, 32 e 17 sessões em 14 dias). Não eram UTMs em link interno (o código não tem nenhuma): era o parâmetro dos eventos `select_city`, `select_state`, `podio_click` e `size_guide_open`. Desde esta rodada os quatro mandam `source_section`, o mesmo nome que `go_to_ink` já usava. Sessões antigas continuam com a origem errada; relatórios que filtravam pelo parâmetro `source` desses eventos passam a usar `source_section`.

**`entry_point` da visita** (`src/lib/analytics/entry-point.ts`). O primeiro clique na busca (campo do topo, hero, diálogo de busca ou a jornada "Sua cidade") grava o valor no `sessionStorage` e o primeiro vence. Ele passa a ir também em `select_city`, `select_item` e `go_to_ink`. Valores: `header_search_bar`, `hero_search`, `search_dialog`, … (busca) e os da jornada (`header`, `menu`, `home`, `hero`, `ink`, `landing`, `auto_ads`, `pdp_wrong_city`). Sem storage (janela privada) o evento sai sem o parâmetro. `view_item` não existe no storefront (vem da INK), então não leva.

**Novos `entry_point` da jornada.** `auto_ads` = home regional (`/sul`, `/norte`, `/centro-oeste`) aberta por anúncio, com `fbclid` ou `utm_medium=paid_social`: a jornada abre sozinha, uma vez por visita (marca no `sessionStorage` e no estado do histórico, então recarregar ou voltar não reabre) e nunca em página de produto ou de estado; os parâmetros da campanha ficam na barra de endereço. `?abrir=cidade` continua sendo `landing` e vence quando os dois aparecem juntos. `pdp_wrong_city` = botão "Encontre a sua" do bloco "Não é a sua cidade?" da página da estampa: a jornada abre já sabendo o modelo da página e, se a cidade escolhida tiver o mesmo modelo, vai direto para as peças dele (dispara `origens_sua_cidade_model` com o `entry_point` da abertura).

**Faixa de oferta na página da estampa** (`src/lib/offer-strip.ts`, `data-testid="offer-strip"`): "Frete grátis a partir de N peças · Leve X e ganhe R$ Y OFF (até R$ Z OFF em W)". Os números vêm da regra viva: o incentivo de frete grátis do Tema da INK (só se o dono confirmou e se o estado da página está na lista) e as faixas da promoção do "Monte seu kit" (INK, em cache de minutos). Sem regra viva ou INK fora do ar, a faixa não aparece.

**Dimensões personalizadas a cadastrar no GA4** (Administrador → Definições personalizadas → Dimensões personalizadas, escopo *evento*; só coletam a partir do dia do cadastro): `family`, `garment_type`, `city_slug`, `model_count`, `piece_count`. `entry_point` já existe.

**Fora do storefront (Worker `worker-lojas` / INK):**
- `add_to_cart`, `begin_checkout` e `purchase` nascem na INK (GA4 nativo de `reserva.ink`); o storefront não os dispara. Levar `entry_point` até eles exige o Worker (por exemplo, repassar o valor guardado na ida para a INK) ou a medição entre domínios.
- `cart_items_bucket` só aparece em `origens_go_to_cart_click` (vem do espelho do carrinho), sempre `0` hoje. No código os baldes são `0`, `1`, `2`, `3_5` e `6_plus`; o documento de ajustes pede `1`, `2`, `3`, `4+`: decidir o contrato antes de implementar no Worker.
- `purchase` uma vez só, com `transaction_id` igual ao pedido da INK: conferência no DebugView, não mudança de código.

**Só no painel do GA4:** domínio cruzado com `reserva.ink` e demais (Fluxos de dados → Configurar tag → Configurar seus domínios) e lista de referências indesejadas (`reserva.ink`, `usesul.com.br`, `usecentro.com.br`, `usenorte.com.br`, gateway de pagamento).

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
3. Volume por `product_slug` por página de produto (só eventos originados na INK).

# Espelho do carrinho INK — consumidor no storefront (Fase 5)

Contrato: `docs/storefront-cart-mirror-contract.md` do repositório `use-origens-workers`. Este lado **só lê**: o carrinho verdadeiro é sempre o da INK.

## O que existe

| Peça | Arquivo |
|------|---------|
| Rota server-side `GET /api/cart-mirror?ref=` | `src/app/api/cart-mirror/route.ts`, `src/lib/cart-mirror/resolve.ts` |
| Validação estrita do snapshot v1 (whitelist) | `src/lib/cart-mirror/schema.ts` |
| Captura de `?cart_ref=` e remoção da URL | `src/components/cart-mirror/CartRefCapture.tsx` (montado em `src/app/[region]/layout.tsx`) |
| Token só em `sessionStorage` | `src/lib/cart-mirror/token-store.ts` |
| UI "Meu carrinho" (gatilho no header + painel `<dialog>`) | `src/components/cart-mirror/CartMirrorMenu.tsx` (header em `SiteChrome.tsx`) |
| Rótulo de idade | `src/lib/cart-mirror/age.ts` |
| Imagens | `next.config.ts`: **somente** `/images/product_art/**` acrescentado ao host da CDN da INK (já havia `/images/product_v2/**`) |
| Analytics nunca veem o token | `GoogleAnalytics.tsx` e `MetaPixel.tsx` passam a montar a URL sem `cart_ref` (`withoutCartRef`) |

## Comportamento

- **Sem `cart_ref` na sessão: nada é renderizado, nada é buscado.** Com o Worker em `cart-mirror` OFF a rota responde 404 (upstream 404) e a UI cai no estado neutro e descarta o token: o storefront não depende de o espelho estar ativo.
- `/sul...?cart_ref=<22 chars>`: valida o formato, guarda **só o token** em `sessionStorage` (`origens:cart_ref`), remove o parâmetro da URL (demais params e hash preservados). Token malformado: removido da URL, não persistido, sem requisição. Nunca `localStorage`; o snapshot fica só na memória do componente.
- Rota: valida `^[A-Za-z0-9_-]{22}$`; `fetch` ao Worker (`https://www.usesul.com.br/__origens/cart-ref/<ref>`) com `cache: 'no-store'`, `credentials: 'omit'`, `redirect: 'manual'`, **sem headers**, timeout 2 s, corpo ≤ 16 KB; só aceita 200 `application/json`; valida o schema v1 e devolve apenas campos da whitelist. `404` para ref inválido/desconhecido/expirado/upstream 404 (e `ageSeconds > 1800`); `502 {"error":"unavailable"}` (sem detalhe) para timeout, 5xx, corpo inválido. Sempre `Cache-Control: no-store`. **O `ref` nunca é logado** (a rota não loga nada).
- UI: "N produtos na INK", miniatura, nome, `cor · tamanho · N un.`, preço efetivo da linha, preço cheio riscado (só quando existe), "Total na INK" (texto exibido pela INK, quando presente), idade ("Atualizado há poucos segundos" ≤ 30 s; "Última atualização há X min") e o aviso "Este resumo pode estar desatualizado. O carrinho oficial é o da INK." Nada é calculado; sem edição, sem checkout.
- Vazio: "Seu carrinho na INK estava vazio na última visita."; 404: estado neutro e token descartado; erro/timeout: "Não foi possível carregar o resumo agora." + "Ir para meu carrinho" (o token é mantido: falha ≠ expiração).
- Ações: **Continuar escolhendo** (fecha o painel) e **Ir para meu carrinho** → `https://www.usesul.com.br/usesul/product/serra-catarinense?origens_open_cart=1` (mesma aba). Não há "Finalizar compra".

## Desvio consciente do briefing

A remoção do parâmetro usa `window.history.replaceState` (integrado ao roteador do Next) em vez de `router.replace`: não dispara navegação nem requisição RSC extra e o token some antes de os scripts de analytics (carregados só após consentimento) lerem `location`. Mesmo assim GA4/Pixel filtram `cart_ref` por conta própria.

## Testes

- Unitários (`tests/unit/cart-mirror.test.ts`, 69 casos): schema (0/1/8 itens, promo, campos desconhecidos descartados, rejeições), URL, idade, token/sessionStorage (incluindo storage bloqueado), resolvedor (requisição nua, 404, 5xx, timeout, JSON inválido, corpo grande, snapshot antigo) e rota (no-store, sem cookies/Authorization, sem log do ref, POST 405). Total do projeto: 194.
- E2E (`tests/e2e/cart-mirror.spec.ts`, 44 casos, API do storefront simulada; o Worker nunca é chamado): captura/URL/sessionStorage/refresh, expirado, erro/timeout/retentativa, analytics sem o token (1 PageView/page_view com a URL limpa), UI 0/1/2/8 itens e promo, idades, ações, e layout em 1440/1280/768/440/390/320×640 (sem sobreposição no header, sem overflow, ações visíveis).
- Navegação real com a INK de produção (`scripts/qa-cart-mirror-roundtrip.mjs`, Chrome visível): storefront → "Ir para meu carrinho" → o loader abre o drawer nativo → volta ao storefront: 10/10 em 1280 e 390.
- Evidências: `docs/evidence/cart-mirror/`.

## Observações

- Em 320 px de largura o wordmark "Use Origens" quebra em duas linhas quando o gatilho está presente (o header não muda de altura e nada transborda); acima de ~360 px continua em uma linha.
- Falhas preexistentes/instáveis do e2e em modo dev sob carga (banner de consentimento em `tracking-and-nav.spec.ts`) também ocorrem sem estas mudanças.
- Sem limitador de taxa próprio na rota (o token tem 128 bits e a rota só repassa 1 GET com timeout de 2 s).
- O `ref` aparece na URL do `GET /api/cart-mirror?ref=` (requisito do briefing); logs de acesso do Railway/Cloudflare podem registrá-lo. Ele vale 30 min e o snapshot não tem dado pessoal.

# Sessão de compra ("Meus Lugares" → INK) — lado storefront

Contrato completo (formato do id, endpoints, garantias de segurança, fail-open): `docs/buy-session-contract.md`
do repositório `use-origens-workers`. Este lado **mina e verifica** o id; o Worker só o relê e o relata de volta,
nunca o interpreta.

## O que existe

| Peça | Arquivo |
|------|---------|
| Favoritos ("Meus Lugares"), só neste navegador | `src/lib/favorites/store.ts` (localStorage, versionado, `origens:favorites:v1`) |
| Coração nos cards | `src/components/favorites/FavoriteButton.tsx`, usado por `FamilyCard.tsx` e `/busca` |
| Ícone + contador no header | `src/components/favorites/FavoritesMenu.tsx`, montado em `SiteChrome.tsx` |
| Página `/[region]/meus-lugares` | `src/app/[region]/meus-lugares/page.tsx` + `MeusLugaresView.tsx` |
| Resolução ao vivo (título/imagem/preço/URL/disponibilidade) | `src/lib/catalog/lookup.ts#resolveProductDisplay` — única fonte, usada pelas 3 rotas abaixo e por `FamilyCard`/`search-docs.ts` |
| `GET /api/favorites/resolve?store=&ids=` | Atualiza a lista visível na página; nunca confia em título/preço/URL do cliente |
| `POST /api/buy-session` | "Comprar minha lista": revalida cada id contra o catálogo, ignora os inelegíveis, mina o id assinado |
| `GET /api/buy-session/<id>` | Lido pelo Worker; verifica assinatura + validade, resolve o próximo item ainda não confirmado |
| Mint/verify (HMAC, sem banco/KV) | `src/lib/favorites/session.ts` |

## Decisões

- **Identidade**: `(inkProductId, commerceStoreKey)`, nunca slug/título isolados — mesma regra de
  `docs/decisions/0001-ink-catalog-indexing-and-store-consolidation.md`.
- **Sem banco novo**: o id da sessão é auto-descritivo e assinado (HMAC-SHA256, chave só nesta app,
  `LIST_SESSION_SECRET`) — carrega só `{loja, [inkProductId...], criadoEm}`. Nada é gravado; `GET
  /api/buy-session/<id>` reconstrói tudo a partir do catálogo ao vivo. TTL de 1h, checado na leitura.
- **Progresso é do Worker, não desta app**: quem decide "já foi adicionado nesta aba" é o próprio Worker (via o
  sinal já confiável de `drawer-watch.js`), passado de volta como `?done=` na leitura — puramente informativo
  (não pode tornar comprável algo que a sessão não continha), o que torna a leitura idempotente por construção
  (repetir a mesma chamada dá a mesma resposta).
- **Página é 100% client-side**: não há nada para renderizar no servidor (a lista vive só no navegador), então
  `page.tsx` é uma casca fina em torno de `MeusLugaresView` (client component).
- **Grupos por loja**: a lista pode ter itens de lojas diferentes; "Comprar minha lista" aparece uma vez por
  loja, só quando há ao menos um item elegível (resolvido e com URL válida) daquela loja.

## Fallback

Sem `LIST_SESSION_SECRET` configurada, sem itens elegíveis, ou erro de rede no `POST /api/buy-session`:
`MeusLugaresView` navega direto para o primeiro produto elegível (link de compra normal, sem sessão) — nunca
anuncia uma sugestão que não vai funcionar.

## Testes

Unitários: `tests/unit/favorites-store.test.ts`, `tests/unit/favorites-session.test.ts`.
Integração de rota: `tests/integration/buy-session.test.ts`, `tests/integration/favorites-resolve.test.ts`.

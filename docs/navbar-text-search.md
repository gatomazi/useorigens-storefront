# Busca textual do catálogo e navbar da INK (storefront)

Contexto: o Worker `use-sul-widget` desenha, nas páginas de produto da INK, um cabeçalho parecido com o do storefront (repo `use-origens-workers`, `docs/navbar-ink-busca.md`). Este repo fornece **a página de resultados** e **a configuração pública** que ele consome. Nada aqui foi publicado.

## `GET /<região>/busca?q=…&page=…`

- Página do App Router `src/app/[region]/busca/` (`page.tsx`, `loading.tsx`, `error.tsx`). Formulário `GET` nativo (funciona sem JS; a URL é o estado: compartilhável, voltar/avançar funcionam), `noindex,follow`, canonical sem query. Região precisa estar lançada (`isRegionLaunched`), como as demais rotas.
- Índice: `src/lib/catalog/search-docs.ts` monta, por região e a partir do **snapshot do catálogo já sincronizado** (nada de INK em tempo de requisição, sem segundo catálogo), um documento por produto com URL de compra verificada (`purchaseUrl`). Cache por processo, refeito quando o snapshot ou o snapshot de coleções mudam.
- Ranking/paginação: `src/lib/search/catalog-search.ts` (puro, `tests/unit/catalog-search.test.ts`). Normaliza caixa/acentos/pontuação; todos os termos precisam casar; campos **fortes** (título, cidade, apelidos, família, variante/localidade, coleção) valem muito mais que **fracos** (nome do estado, UF); frase inteira num campo forte ganha bônus (“porto alegre” prefere Porto Alegre a Alegrete). Empate: variante depois do primário → família na ordem comercial do storefront → mais vendidos → título → id. 24 por página; `total`, `pageCount` e a página (clampada) são consistentes.
- **Variações duplicadas:** todo produto real segue pesquisável; o primário da cidade/família vem antes e as variações (Regional, Personalizado, Localidade…) aparecem rotuladas no título. Nada é escondido.
- Card: foto, título, “Cidade · UF”, preço, link para o produto na INK (`TrackedInkLink`, `source_section = search_results`, mesmo GoToInk de sempre). Estados: sem consulta, sem resultado (mensagem + link para a home), carregando, erro.
- Filtros do storefront: **não há filtros de produto hoje**; nada foi inventado.
- `cart_ref`: o layout da região já captura o token e o remove da URL; a busca (`q`) é independente dele.

Dados reais (snapshot local de 2026-09-21): `florianopolis` → 12 produtos; `chimarrao` → 4 (nomes reais “All You Need Is Chimarrão”, “Churrasco e Chimarrão…”); `Bah` → 8; `porto alegre` → 8; `gramado` → 24; `santa catarina` → 2.379 em 100 páginas (o produto literalmente chamado assim primeiro); sem resultado → mensagem própria.

**Lacunas dos metadados:** o snapshot **não guarda tags nem descrição** dos produtos da INK (o `tags` do `InkProductNormalized` é descartado no sync), então não são pesquisadas. A pertinência por **coleção** só usa coleções públicas cuja lista de membros está **completa** no snapshot (guarda só os 48 primeiros ids; “Fala Daqui” tem 55 e “Da Nossa Terra” 73, então ficam de fora da busca por nome de coleção: melhor omitir do que devolver uma fatia arbitrária). Guardar todos os ids de merch (e/ou tags) no sync resolveria; é mudança de sync + ressincronização, fora desta rodada.

## `GET /api/navbar/<região>`

`{ v: 1, region, collections: [{ name, slug }] }`, cacheável (`s-maxage=60`). Só o que o CMS decide. Cada coleção é reverificada na leitura: pública na INK, com produtos no catálogo e slug válido (`collectionUrl`); ordem = posição da coleção na INK; máx. 8. Lido **só pelo Worker, no servidor** (que o re-serve no mesmo domínio da INK): nenhum CORS foi configurado.

## CMS

Documento da região: `collections.navbar?: CollectionRef[]` (novo, opcional; documentos existentes seguem válidos), **independente** de `collections.enabled` (que é sobre seções da home). Biblioteca de coleções (`/admin/colecoes`): coluna **Navbar da INK** com Mostrar/Tirar (só coleções públicas com produtos; máx. 8; interna → “Indisponível”). É um op de rascunho (`set-collection-navbar`) como os demais: vale ao **publicar**. A tela **Publicar** lista a mudança (“"Seu Lugar" passa a aparecer na navbar da INK”); antes desta rodada uma mudança só de navbar apareceria como “Nada a publicar” (`diffDocs` só olhava seções). Testes: `tests/unit/navbar.test.ts` e o e2e `tests/e2e-admin/navbar.spec.ts` (mostrar → publicar → `/api/navbar/sul` lista → tirar → publicar → vazio; roda no sandbox, com o snapshot de coleções local: `CATALOG_SNAPSHOT_DIR=<dir> npx playwright test -c playwright.admin.config.ts tests/e2e-admin/navbar.spec.ts`).

**Produção vs dev:** a página de busca é `dynamic = 'force-dynamic'` (o layout da região é ISR; ler `searchParams` sozinho dava `DYNAMIC_SERVER_USAGE`/500 em `next start`, invisível em `next dev`). Conferido com `next build && next start`: 200, `Cache-Control: private, no-store`, resultados por consulta.

## Arquivos

`src/app/[region]/busca/*`, `src/app/api/navbar/[region]/route.ts`, `src/lib/search/catalog-search.ts`, `src/lib/catalog/search-docs.ts`, `src/lib/site-config/navbar.ts`, `src/lib/site-config/{schema,collections-enabled}.ts`, `src/lib/admin/draft-ops.ts`, `src/app/admin/actions.ts`, `src/app/admin/(panel)/colecoes/page.tsx`, `src/lib/analytics/sources.ts`, testes e este doc.

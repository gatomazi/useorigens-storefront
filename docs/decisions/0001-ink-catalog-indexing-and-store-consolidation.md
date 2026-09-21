# ADR 0001 — INK catalog indexing and store consolidation

- Status: accepted, amended 2026-09-21 (binding model, store priority, open items closed)
- Context source: read-only crawl of the three INK stores (`visible_in_store=true`, `per_page=100`, throttled to ~40 req/min/store)

## Context

The spec assumes the INK API can tell us `region + state + city + designFamily → product`.
The real API cannot: `GET /v1/stores/products` exposes `id`, `name`, `slug`, `store_product_url`,
`main_image_url`, `price`, `tags`, `product_cluster_id`, `store{slug}` and variants — **no city, UF or
design-family fields**. Those must be derived in our indexing layer.

Facts about the API (from developers.reserva.ink):

- Base `https://api.reserva.ink/v1/stores/...`, Bearer JWT, no expiry, **one credential per store**.
- Rate limit **100 req/min per store**, shared by the whole API, 429 without `Retry-After`.
- Paginated `page` / `per_page` (max 100). Reads are cheap at `per_page=100`.
- Catalog has no webhooks (webhooks cover orders/payments/exchanges only) → polling sync.
- `store_product_url` is already the final purchase URL (e.g. `https://www.usesul.com.br/usesul/product/<slug>`).
- The storefront must only ever use **GET** endpoints. No writes.

## Catalog snapshot (visible + published)

| Store | Products | Price (city designs) |
|---|---|---|
| use-sul (PR, RS, SC) | 9,835 | 109.90 |
| use-norte (AC, AM, AP, PA, RO, RR, TO) | 3,654 | 99.90 (Tipografia 94.90) |
| use-centro (DF, GO, MS, MT) | 3,923 | 99.90 (Tipografia 94.90) |

No slug collisions inside a store. The three stores hold **disjoint UFs today** — consolidation into
the Sul store has not started in the catalog.

## Naming conventions found (parser input)

City-design products, by design family:

| Family (spec) | Name pattern | Slug pattern | City comes from |
|---|---|---|---|
| Legado, Traço, Território, Tipografia, Coordenadas | `<City> \| <Label> <UF>` | `<city>-<label>-<uf>` | title |
| Gentílico | `<Gentilic> \| Gentilico <UF>` | `<gentilic>-gentilico-<uf>` | `tags[0]` (city, lowercase) |
| Ponto de Origem | `<Title> \| Origem <UF>` | `<title>-origem-<uf>` | title, or `tags[0]` for localities |
| Feito Em (Norte/Centro) | `Feito Em <City> - <UF>` | `feito-em-<city>-<uf>` | title |
| Feito Em (Sul) | `Feito em <City>` (**no UF in name**) | to be confirmed | title; UF from slug/IBGE |

Variants that must map into a family, not be dropped: `Origem Localidade|Regional|Personalizado|Personalizada|Distrito|Legenda|Explicativa`,
`Coordenadas Personalizado|Centro`, `Território Desde`, `Essencia`. The Origem variants usually name a
**locality inside a city** (`Praia Paraíso | Origem Localidade RS`, tag `Torres`).

Non-city merchandise (feeds collections/editorial, never the city resolver):
`<Title> — Pocket`, `<Title> — <X> Club`, `Made in <State> [Clean]`, `<State>`, `<State> | Minimal`,
DDD/region products (`Marajó | 091`), and Sul art prints (e.g. `Gaúcho de Pedra`).

## Coverage gaps (must fail gracefully, spec §33)

- Sul `Coordenadas`: ~918 of ~1,190 cities. DF has only Origem/Feito Em/Coordenadas (few cities).
- A city may legitimately have fewer than 8 families → UI must never hard-code "8".
- ~1,400 Sul, ~500 Norte, ~110 Centro products have no `product_cluster_id`.

## Decisions

1. **Indexer owns parsing.** `parseProductName()`/`resolveCity()` in `src/lib/catalog/parse.ts` map name/slug/tags to
   `{designFamily, uf, cityKey, kind}` and reconciles the city against the **IBGE municipality list**
   (`servicodados.ibge.gov.br`, public) using accent-insensitive slug match. Anything unresolved is logged
   (spec §34) and excluded from the city resolver — never guessed.
2. ~~Binding key is `(cityId, designFamily)`~~ **Superseded, see "Amendment" below.** A family can hold
   several real products for the same city, so the key is `(cityId, designFamily, designVariant, inkProductId)`.
3. **Store consolidation is a config/indexing change, not a UI change.** All stores are indexed and every
   binding carries its `commerceStoreKey`. Reconciling by `(cityId, designFamily)`, never by slug or id, is what
   will make the future swap safe. **Consolidation is NOT happening now** (see "Amendment").
4. **Price comes from INK, always, untouched.** The storefront never normalizes or decides prices
   (109.90 / 99.90 / 94.90 are shown exactly as each store returns them). Any price change caused by a
   future consolidation is a business decision made outside the storefront.
5. **Sync budget.** Full sync ≈ 176 requests total (99 Sul, 37 Norte, 40 Centro). Per-store sequential
   paging with ≥1.5 s spacing, exponential backoff on 429, never parallelize within a store. Other INK
   integrations share the same 100/min budget, so stay well below it.
6. **Credentials** live in `.env.local` (`INK_TOKEN_SUL|NORTE|CENTRO`), server-only, never `NEXT_PUBLIC_*`.
   Only `store.products.read` (+ optional categories/product_types read) is required. Use the smallest
   scope; rotate the tokens that were shared in chat.

## Open items (all closed in the Amendment below)

- ~~Confirm Sul `Feito em` slug pattern and UF extraction.~~
- ~~Confirm which INK image host to allow in `next.config.ts`.~~
- ~~Decide persistence for the index.~~ (file snapshot for the first slice; PostgreSQL later)

## Amendment 2026-09-21 (implemented)

### Binding model
A `CityDesignBinding` preserves every real INK product. Unique key:
`(cityId, designFamily, designVariant, inkProductId)`. Fields: `designVariant` (normalized key),
`variantLabel`, `parentCityId` + `localityLabel` (locality products), `isPrimary`, `priority`,
`commerceStoreKey`, `inkProductId`, `slug`, `storeProductUrl`, `imageUrl`, `price` (as returned), `syncedAt`.
The UI still shows one card per **family**; variants appear only in the detailed view, only when they exist.

### Deterministic primary selection (`src/lib/catalog/ranking.ts`)
For each `(city, family)` the primary is the lowest by: 1) not a locality product, 2) variant rank,
3) store priority, 4) INK product id (numeric). API order never matters. Variant ranks, validated against the
real catalog (variants seen: 15 regional, 6 personalizado, 11 localidade, 2 legenda, 1 explicativa,
1 centro, 1 desde):

- Ponto de Origem: base > regional > personalizado > localidade > distrito > legenda > explicativa > others
- Coordenadas: base > personalizado > centro
- Território: base > desde
- Other families: base only

Duplicate products with the same `(city, family, variant)` (e.g. two "Coordenadas" for São José dos Pinhais)
are both kept; the lowest INK id is primary.

### Localities are not municipalities
`Praia Paraíso | Origem Localidade RS` (tag `Torres`) binds to Torres with `localityLabel = "Praia Paraíso"`.
No city named Praia Paraíso exists. Locality products are never primary and never a family card; the city
page shows them under "Também de Torres". In the DF, which has a single municipality (Brasília), every
administrative region (Taguatinga, Ceilândia...) is a locality of Brasília. A family whose only products are
localities has no card for that city.

### Real coverage, never "8"
The UI renders only families that exist for the city and never states a number of styles. Sul result
of the real sync: 1,118 of 1,191 cities have all eight families; 1,191 have at least one.

### Store priority (revised)
`COMMERCE_STORE_PRIORITY` defaults to `regional`: Sul products resolve to Use Sul, Norte to Use Norte,
Centro-Oeste to Use Centro. No consolidation and no price change now. A comma list
(e.g. `use-origens,use-sul`) overrides it globally once consolidation is really executed.

### Open items closed
- **Sul "Feito em"**: name is `Feito em <City>` with **no UF**, slug `feito-em-<city>[-<uuid>]`. UF is inferred
  only when the city name is unique among the region's IBGE municipalities. Otherwise it is excluded and
  logged as `ambiguous-city` (31 Sul products, e.g. `Feito em Turvo` exists in PR and SC). Nothing is guessed.
  The same rule applies to UF-less `Coordenadas` names (`Turvo | Coordenadas`).
- **Image host**: a single host in all 17,394 product images: `gcp-images.majestic.ink.rsvcloud.com`
  (`/images/product_v2/**`, 800x820 JPEG on flat `#e5e5e5`). Configured in `next.config.ts`
  `images.remotePatterns` with an explicit `qualities` list (required by Next 16).
- Purchase links use INK's own `store_product_url`, validated (https + allowed host) in
  `src/lib/catalog/commerce.ts`; hosts: usesul/usenorte/usecentro.com.br and loja.useorigens.com.br.

### Exclusions found in the real data (all logged, none guessed)
Sul 59 (31 ambiguous, 27 city-not-found such as `Goiás Velho`, `São Chico`, 1 unclassified `Essencia`),
Norte 2 (`São Luiz` is a short form of São Luiz do Anauá), Centro-Oeste 4.
`Essencia` is preserved in the audit trail and not assigned to a family until the business defines it.

### Persistence (first slice)
Index snapshot at `data/generated/catalog-snapshot.json` (gitignored), written atomically by
`npm run catalog:sync`. A store that fails to sync keeps its previous data (last-known-good).
Move to PostgreSQL (spec §9) when the sync needs to run in production.

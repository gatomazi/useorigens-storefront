# Use Origens storefront

Public discovery layer for Use Origens (brand, regions, cities, design families). Reserva INK keeps cart,
checkout, payment and orders. Spec: `docs/USE_ORIGENS_STOREFRONT_SPEC.md`. Decisions: `docs/decisions/`.

## Run

```bash
cp .env.example .env.local        # add the three INK tokens (read-only scopes are enough)
npm install
npm run catalog:sync              # reads INK (GET only, throttled) into data/generated/
npm run dev                       # http://localhost:3000/sul
```

## Commands

| Command | What it does |
|---|---|
| `npm run catalog:sync [use-sul ...]` | Sync INK catalog to the local index. ~176 requests total, well under 100/min/store. |
| `npm run geo:build` | Rebuild `data/geo/municipios.json` from IBGE. |
| `npm test` | Unit tests (parser, indexer, ranking, search). |
| `npx playwright test` | End-to-end flows (search, city, family, CTA, 404). |
| `npx tsx scripts/screenshots.mts <dir> <path> [name] [widths]` | Full-page screenshots for visual QA. |

## Architecture

```
src/lib/ink/       server-only INK adapter: config, throttled client, validating normalizer
src/lib/catalog/   parse -> indexer -> ranking -> repository -> resolver (+ commerce URL guard)
src/lib/geo/       regions, IBGE municipalities, aliases, text normalization
src/lib/search/    accent-insensitive city ranking (no fuzzy matching)
src/app/[region]/  /sul, /sul/{uf}, /sul/{uf}/{city}, /sul/{uf}/{city}/{family}
```

Never call INK from the browser. Never write to INK. Credentials live only in `.env.local`.

# Nightly visual pass, /sul (2026-09-21)

Scope: layout, visual direction, hierarchy, type, spacing, hero, search, carousels, editorial, motion, mobile.
Not touched: parser, indexer, resolver, ranking, commerce mapping, INK sync, routes, prices. INK stayed read-only.
No commit, no push, no token or remote changes.

## Benchmark
Studied live in Chrome: Ark Club (storefront root, not the INK page), Kith, Fear of God, Carhartt WIP, Osklen,
PACE (pacecompany.com.br), Patagonia, Aimé Leon Dore. Several were seen behind cookie/region modals that were left
untouched. Details and the ten principles: `docs/design/storefront-benchmark.md`.
Direction chosen: `docs/design/use-origens-visual-direction.md`.

Main lessons used: place as subject (PACE), transparent-then-solid header (Kith/Carhartt), macro crops as imagery
(Osklen), variable tile sizes (Patagonia), alternate campaign and commerce (Carhartt), silence and scale
(Fear of God). Not used: countdowns, benefit icon strips, glass chrome, video.

## Changes
- **Hero**: headline scaled up (15vw, capped 12.5rem), fills the first viewport on md+, two columns from 768px,
  three real tees larger and overlapping only at the edges (multiply-free `darken` blend on the shared ground),
  hero entrance once (CSS). Accent leading bug fixed (Ê/É no longer touch the line above).
- **Header**: quiet at the top (no rule, 76px), solid + border + 60px after scroll (IntersectionObserver, no scroll
  listener), `translate="no"` on the brand name.
- **Search (signature)**: oversized Big Shoulders input that reads like type on a shirt, results as an in-flow
  "departure board" (city large, `Estado · Região` small, inverted active row), keyboard first, gold underline on
  focus, real focus ring. Header opens a full-screen sheet on phones and a wide sheet on desktop. No floating
  dropdown anywhere. Well-known cities (with curated aliases) rank first among equal prefixes.
- **Families**: editorial grid instead of eight equal cards. Ponto de Origem (or the first available) is the large
  card, four in a 2×2 block, the rest on a row of larger cards. 5+ families use it; fewer use a plain grid; nothing
  is invented to fill a slot. Same component on the home and on city pages.
- **Product presentation**: cards are names and prices on the ground, no boxes; family page is now a product
  page (title, place, description, price, CTA beside the photo on desktop; title first on phones).
- **"Made in" carousel**: dedicated `paper` section with 4:5 poster frames and a consistent crop; INK images are
  not altered. Heading and arrows share a row (fixed a mobile overlap).
- **Editorial**: black campaign block with one sentence, one CTA, and macro crops of real shirts (Território and
  Feito em of the showcase city); city wall below. Gold states band kept.
- **Copy**: "Frete calculado na loja, antes de pagar" removed (unconfirmed). Announcement now says only what is true:
  you choose here and finish the purchase in the Use Sul store. Family descriptions rewritten to describe only what
  the printed art shows.
- **Motion**: CSS only. Hero entrance, header state, hover on photos/links, variant crossfade. `motion` removed.
- **Performance**: display font is now one variable file, Latin only (see Lighthouse).
- **Footer**: unchanged (works).

## Screenshots
- `docs/design/screenshots/sul-before/` baseline
- `docs/design/screenshots/sul-pass-1/` first refinement, plus interaction states (search board, scrolled header, mobile sheet)
- `docs/design/screenshots/sul-pass-2/` second refinement
- `docs/design/screenshots/sul-final/` final: `sul-{375,430,768,1280,1440}`, `cidade-torres`, `familia-torres-origem`,
  `variante-pato-branco`, `estado-sc` (1440 and 375)
- `docs/design/screenshots/before-after-home-{1440,375}-top.png`
- `sul-pass-1/` and `sul-pass-2/` are heavy intermediates: on disk locally, ignored by Git. `sul-before/`, `sul-final/` and the before/after images are versioned.
- Benchmark screenshots are not stored (third-party); observations are in the benchmark doc.

## Real data used
- Home showcase: Florianópolis/SC, all eight families present (INK ids 4407962, 3789929, 3791940, 4340913, 4379369,
  4394134, 4714617, 4818467).
- Torres/RS: eight families plus the locality "Praia Paraíso" (title "Também de Torres").
- Pato Branco/PR: Ponto de Origem with the real "Regional" variant (selector swaps image, price and CTA).
- CTA destination tested: `https://www.usesul.com.br/usesul/product/tijucas-origem-sc` (e2e).

## Quality
- Unit 33/33, e2e 12/12 (against the production server), eslint clean, `tsc` clean, `next build` ok.
- No secret in `.next/static` or server-rendered output (positive control passes).
- Browser console clean on /sul, city, family, state and variant pages.
- Lighthouse (production build, localhost, headless Chrome). Mobile is Lighthouse's default slow-4G / 4×CPU:

| Page | Preset | Perf | A11y | Best practices | SEO | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|---|
| /sul | mobile | 90–100 (6 runs) | 100 | 100 | 100 | median 2.6 s (1.5–3.5 s) | 10–20 ms | 0 |
| /sul | desktop | 100 | 100 | 100 | 100 | 0.7 s | 0 | 0 |
| /sul/rs/torres | mobile | 97 | 100 | 100 | 100 | 2.7 s | 20 ms | 0 |
| /sul/rs/torres | desktop | 100 | 100 | 100 | 100 | 0.6 s | 0 | 0 |

Before the font change: /sul mobile perf 85, LCP 4.3 s; Torres mobile 89, LCP 3.8 s. The LCP element is the hero
`h1`; TTFB is ~20 ms, so what remains is the headline font swap under throttling. INP not measured (lab only, TBT
≈ 0). Mobile LCP is borderline against the 2.5 s target and varies run to run.
Raw reports: `docs/design/lighthouse/`.

### Design review (Vercel web-interface rules + React practices)
Fixed: `touch-action: manipulation` and tap highlight, `overscroll-behavior: contain` on sheets, `text-wrap: balance`
and long-word wrapping on headings, `color-scheme`, `…` in loading text and placeholder, `translate="no"` on the
brand, focus ring kept on the search input (outline removal had no replacement), listbox contains only options.
Checked and passing: icon buttons named, decorative icons hidden, one `h1` per page with ordered headings, skip link,
`scroll-padding-top` for anchors, reduced motion, no `transition: all`, Intl formatting, images with reserved space,
carousel with real buttons, no gesture-only actions. React: module-cached catalog, derived state instead of effects,
no waterfalls, no unused dependency (`motion` removed), client components limited to search, header, carousel, picker.

## Not changed on purpose
- Ground `#e5e5e5`, gold band, Big Shoulders / Hanken Grotesk / Bodoni Moda (judged strong in Chrome next to the
  benchmarks; display weight is 800 for legibility of N and V).
- Footer, gold state panels with IBGE outlines, family page CTA wording, catalog rules and prices.
- No second product image on hover: INK exposes only `main_image_url` in the list endpoint.

## Pending
**Blockers**: none.
**Future improvements**
- Mobile LCP under 2.5 s consistently (try a metric-matched fallback for the display font).
- `/norte`, `/centro-oeste` and the root page; sitemap, analytics, redirects (out of scope tonight).
- A hover second image once a lifestyle image exists per product.
- State pages are simple (A–Z index); they can take the same editorial treatment.
**Assets to produce** (nothing in the layout depends on them; each slot already exists)
1. **Hero Sul, desktop**: 2880×1800 (or larger), real person wearing a city shirt, shirt clearly visible, negative space
   on the left ~45%, natural editorial light, everyday Sul city context, no text applied. Plus a portrait crop
   1170×1560 with the subject centered for mobile.
2. **Campaign block, portrait**: 1600×2000, two variants of a real person in a Sul town (architecture, weather),
   shirt visible; replaces the macro crops on the black block.
3. **State images**: one 1600×2000 photo each for RS, SC and PR (landscape or city, no clichés) for the gold panels.
4. **Logo**: vector (SVG) of the Use Origens wordmark and the three regional tags; current PNGs are 192×192.
5. **Hover / second images**: 4:5 lifestyle shots for the top cities and the best sellers.
6. **Social**: 1200×630 Open Graph image and a favicon set.
7. **Later**: equivalent sets for Norte and Centro-Oeste.

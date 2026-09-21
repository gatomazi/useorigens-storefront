# Use Origens visual direction (Sul)

## Feeling
Brazilian, contemporary, premium, editorial, human. Belonging and identity, not souvenir.
Not: tourist shop, marketplace, print-on-demand catalog, SaaS, dashboard, template, Ark clone, dropshipping.

## System (kept from the baseline, documented on purpose)
- **Ground `#e5e5e5`** is the exact grey behind every INK photo. Tees appear cut out. It stays.
  Rhythm comes from black bands, one gold band and lighter `paper` areas, never from boxing photos.
- **Type**: Big Shoulders 800 (display, uppercase, condensed signage), Hanken Grotesk (UI/body),
  Bodoni Moda (place names, one editorial voice, echoing the Didone city names printed on the Legado shirts).
  The three are clearly distinct: condensed heavy / neutral grotesque / high-contrast serif.
  Display weight is 800, not 900: at 900 the counters of N and V close.
- **Color**: black `#000`, ground `#e5e5e5`, paper `#f2f2f0`, Sul gold `#d8c078` (fill) / `#7a5c12` (text).
  Norte blue and Centro-Oeste orange are already tokens for later.
- **Shape**: rectangles. No rounded cards, no shadows on cards, thin rules only where they carry meaning.
- **Language**: pt-BR, sentence case in body, uppercase only in display headings and buttons.

## How the Sul is communicated (without clichés)
Through the *names and maps of real cities*: 1,191 municipalities, state outlines from IBGE, coordinates and
Didone place names on real shirts. No chimarrão/pinhão/flags in the layout. Real Sul photography (light,
architecture, weather, everyday people) is the missing layer and is specified in the report.

## Page rhythm for /sul
`hero (ground)` → `search board (black)` → `families (ground, featured + rest)` → `states (gold)` →
`best sellers (paper, poster frames)` → `campaign + city wall (black)` → `footer (ground)`.

## Hero
Headline "Vista de onde você é." at extreme scale, one auxiliary line, one primary CTA, three real tees
of one city. Header transparent over the hero, solid and shorter after scroll.

## Search (signature)
Oversized input that reads like typing on the shirt; results are a departure-board list (city large, state and
region small), keyboard first. On mobile the header opens a full-screen sheet.

## Families
Editorial grid: one featured family (Ponto de Origem when it exists, else the first) large, the rest smaller.
Adapts to 1–8 families; never invents a missing one.

## Motion
CSS only: hero entrance (once), header state, hover on photos and links, search result crossfade, variant
swap crossfade. 180–500 ms, transform/opacity, no parallax, no loops, `prefers-reduced-motion` honored.
The `motion` package is removed unless it earns its place.

## Do not change without a reason
Catalog, parser, resolver, prices, store mapping, routes and tests.

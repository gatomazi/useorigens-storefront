# Current visual review, /sul (production build)

Date: 2026-09-21. Build inspected: `next build` output served on `localhost:3100`. Code was not changed in this round.
Screenshots: `docs/design/screenshots/current-review/` (index: `docs/design/current-visual-review-index.md`).

**How it was captured.** Observed in Claude in Chrome (real Chrome, laptop viewport 1568×745 and a narrow window;
5 of those screenshots are saved as `chrome-*.jpg`). The exact-breakpoint set (375, 430, 768, 1280, 1440, full page,
sections and interaction states) was captured in headless Chromium against the same server, because the Chrome
extension only captures the viewport. Capture aids only: the sticky header is hidden in element crops so it does not
overlap them; nothing on the site was altered. `header-*-top.png` crops are 160 px tall on purpose and cut the
headline; that is a crop choice, not a page issue.

# Impressão geral

The storefront has a recognizable voice: an oversized condensed headline face, black, one gold field, and real shirt
photos that sit on the page with no box. It reads as an apparel brand, not a catalog UI, and the search is the one
thing nothing else in the review looks like.

It is also heavy. Almost every block is large type at high contrast, black bands alternate with a flat gold field and
a pale grey ground, and there is no human photography anywhere, so the identity rests entirely on typography and
folded-shirt mockups. The three type families do different jobs but the condensed display face does nearly all the work,
and the serif appears only in small place names, where it is easy to miss. The result is confident but loud;
refinement is uneven between blocks. Two visible defects (invisible controls) were found and are listed first.

## Defects seen (verified with computed styles, not fixed)
1. **State page and region 404 page: the city search is invisible.** `/sul/sc` and `/sul/sc/cidade-que-nao-existe`
   render the search input with `rgb(255,255,255)` text on the `#e5e5e5` ground (placeholder at 45% opacity). The
   underline is visible, the text is not. Files: `state/santa-catarina-1440-full.png`, `mobile/santa-catarina-430-full.png`.
2. **Mobile menu has no visible close control.** The close button exists (44×44 at top right) but renders black on the
   black sheet (`rgb(0,0,0)`). Escape and the links still close it. File: `mobile/menu-375-open.png`.

## Home `/sul`

### Header
- **Funciona**: quiet at the top, solid with a rule after scroll (`header-1440-top` vs `header-1440-after-scroll`);
  the condensed wordmark matches the rest.
- **Pesado/grosseiro**: four permanently underlined nav links plus the `Sul ▾` menu make a busy bar for so few links.
- **Refinado**: the state change on scroll is clean and short.
- **Desbalanceado**: the 36 px regional tag logo reads as a smudge at this size; the wordmark is tiny next to the
  ~200 px headline right below it.
- **Merece revisão**: on this pale page the "transparent at the top" idea is almost imperceptible (the header and
  ground are the same grey; only the rule changes). The `Sul ▾` menu lists Norte and Centro-Oeste, which leave the site.

### Hero
- **Funciona**: the headline communicates in one glance; the shirts are real and relevant (`home-1440-01-header-hero`).
- **Pesado/grosseiro**: three lines at ~200 px take most of the width and the whole first screen. In the 1568×745
  Chrome viewport the primary button sits on the bottom edge of the fold (`chrome-1568x745-header-top-hero.jpg`).
- **Refinado**: the entrance and the overlap of the three shirts feel intentional.
- **Desbalanceado**: line spacing is uneven: "VISTA / DE ONDE" are tight, then a visibly larger gap before
  "VOCÊ É." (added to clear the accents). The shirts are small next to the headline and float with a wide empty band
  between them and the text at 1440. At 768 the shirts are ~100 px wide (`home-768-full`), too small to read the art.
  On phones the shirts sit below two full-width stacked buttons and the search is pushed well below the fold.
- **Merece revisão**: headline-to-product scale, the accent gap, the tablet composition, the first-fold height.

### Busca
- **Funciona**: distinctive and memorable; results as a board with an inverted active row are quick to scan
  (`search-1440-open-results-flo`, `search-375-fullscreen-results-flo`).
- **Pesado/grosseiro**: the placeholder is giant and grey at 45% opacity, so it reads as disabled; heading and input
  compete for attention; the focused input shows a rectangular focus ring *and* a gold underline (double indicator).
- **Refinado**: keyboard behavior, the empty state copy, the in-page results with no floating panel.
- **Desbalanceado**: a jump in scale between the giant input and the small "Comece por aqui" chips; a large empty black
  area below the chips at 1440; the 13 px grey caption on black is hard to read. In a 745 px-high window the results
  run off the bottom of the screen while typing (`chrome-1568x745-header-scrolled-search-flo-results.jpg`).
  The mobile sheet leaves its lower half empty.
- **Merece revisão**: placeholder treatment, focus indicator, vertical space, and the state-page/404 defect above.

### Estados
- **Funciona**: the gold band is the single strong color moment and makes the section unmistakable.
- **Pesado/grosseiro**: a large flat gold field with three heavy outlined boxes; boxes are used nowhere else on the site.
- **Refinado**: the real IBGE outlines are a good idea and read well.
- **Desbalanceado**: outlines differ in visual weight (RS large, PR small); a tall empty gap sits between each outline
  and its name; two of three names wrap to two lines; the "497 cidades" caption is tiny. On phones the three panels
  stack to ~1,400 px.
- **Merece revisão**: gold intensity, panel proportions, outline sizing.

### Design Families
- **Funciona**: a large featured card plus a block gives hierarchy and the real shirts look good on the shared ground
  (`home-1440-04-design-families`).
- **Pesado/grosseiro**: the featured caption is display-sized while the others are small; eight near-identical black
  shirts on grey; every card repeats the same price; description text is 12–13 px grey.
- **Refinado**: the mobile order (featured full width, then two columns) is clean.
- **Desbalanceado**: the last row of three cards is larger than the 2×2 block above it (hierarchy inverts); dead space
  under the featured card beside the 2×2; the price sits far right in narrow cards, detached from the name.
- **Merece revisão**: scale logic between the block and the last row, caption/price hierarchy, small grey text.

### Produtos (cards de produto)
Mapped to the family product cards (`home-*-05a`, `05b`, and the hover pair).
- **Funciona**: names and prices on the ground with no box; hover slightly scales the photo
  (`family-card-1440-normal` / `-hover`); hover is subtle, arguably too subtle to notice.
- **Pesado/grosseiro**: permanent underline on every card title.
- **Refinado**: no badges, no borders.
- **Desbalanceado**: card text is much smaller than the image and the price is tiny next to the heading.
- **Merece revisão**: title underline, hover visibility, text sizes.

### Editorial
- **Funciona**: one sentence, one CTA; the wall of city names works as an index and is linked.
- **Pesado/grosseiro**: this is the second big black block after the search, so black appears twice within a screen
  or two; the city wall (48 px) is nearly as loud as the headline.
- **Refinado**: the copy is short and specific.
- **Desbalanceado**: the two macro crops are small (~316 px) for the space, read as dark rectangles with map
  fragments, and the second is offset lower; the composition is left-heavy.
- **Merece revisão**: crop size and choice, the headline/wall competition, black-band frequency.

### Made In
- **Funciona**: poster frames give a consistent 4:5 rhythm; heading and arrows share one row
  (`carousel-1440-initial`, `carousel-1440-intermediate`).
- **Pesado/grosseiro**: names are small underlined links; large empty padding below the row.
- **Refinado**: arrows, the paper background separating it from the grey ground.
- **Desbalanceado**: the saturated flag-color backgrounds are the only saturated color on the site and disconnect
  from the black/gold/grey system; a plain grey-ground shirt (Santa Catarina | Clean) in the same row breaks the
  poster consistency; paper `#f2f2f0` vs ground `#e5e5e5` is barely distinguishable at the boundary.
- **Merece revisão**: how these products are framed against the rest, and the section's own palette.

### Footer
- **Funciona**: simple and legible (`home-1440-08-footer`).
- **Pesado/grosseiro**: —
- **Refinado**: the plain link columns.
- **Desbalanceado**: 13 px grey legal line; wide empty right side.
- **Merece revisão**: only one social link; the note about finishing the purchase in the store is a long small line.

## Página de cidade (`/sul/rs/torres`)
- **Impacto do título**: the very large city name is the best moment of the page.
- **Contorno do estado**: large and clean, but it sits far to the right and feels detached from the name.
- **Densidade**: the H1 is followed by an H2 that repeats the city name in the same display face, pushing products
  down (first product starts ~650 px at 1440). The featured shirt is ~600 px tall, so its name and price fall below
  the first screen.
- **Grid de famílias**: same logic as the home; same scale inversion in the last row.
- **Produto**: fine; same small caption text.
- **Localidade**: "Também de Torres" shows one small card in a wide empty section and looks unfinished; it also
  links straight to the store while the family cards open internal pages, and nothing explains what "Praia Paraíso" is
  (`torres-1440-localidade-praia-paraiso`).
- **Mobile**: works well (`torres-375-full`); long (4,687 px) but rhythmic.

## Página de família/produto (`/sul/rs/torres/ponto-de-origem`)
- **Parece PDP premium?** It reads as a gallery-label page: strong and clean, but thin as a product page.
- **Hierarquia**: the family name is the loudest element, louder than price and CTA. The CTA is a modest black button.
- **Preview**: large single photo; no second view or detail.
- **Preço**: large display price, clear.
- **CTA**: clear label, but there is no size, material or fit information anywhere, and the short note that the
  purchase finishes in the store is small.
- **Variante** (`/sul/pr/pato-branco/ponto-de-origem`): two toggle buttons "Principal" / "Regional"; the swap changes
  only the image (the printed text differs: "LÁ DE PATO BRANCO, DAÍ") and nothing explains the difference; price and
  copy are identical (`…default-principal` vs `…selected-regional`).
- **Whitespace**: generous; a large empty area under the CTA at 1440.
- **Conexão com a home**: strong (same type, same ground). The row of "Outros estilos" repeats seven identical cards.
- **Mobile**: title, photo, then price; the CTA is below the first fold at 375×812
  (`family/ponto-origem-torres-375-first-fold`).

## Página de estado (`/sul/sc`)
The city search is invisible (defect 1). The outline is oversized on phones (full width) before any content, and the
list of 295 cities is a single column with no letter jump: the page is 12,410 px tall at 375
(`state/santa-catarina-375-full`).

## Mobile
- **Densidade**: home is dense but paced; the state page is the outlier. The sections stack tall (gold panels, black
  wall of names).
- **Escala da tipografia**: the headline scales well; display headings sometimes wrap to three lines.
- **Busca**: in-page board and the full-screen sheet both work; the sheet leaves half the screen empty.
- **Hero**: shirts are small and sit below stacked buttons.
- **Product cards**: two-column cards are compact; three-line grey descriptions add noise.
- **Carrosséis**: ~1.3 cards visible, natural swipe; arrows share the heading row (`carousel-375-intermediate`).
- **Footer**: single column, legible.
- **Fluidez**: consistent 16 px gutters and no horizontal overflow in any capture.
- **Bug**: the menu close control is invisible (defect 2).

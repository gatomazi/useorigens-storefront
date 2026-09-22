# 0003. A banner is always a section background, never a standalone slice

- Status: accepted (`CLAUDE_BANNER_PLACEMENT_FIX.md`)
- Supersedes: the "banner as its own section" pattern shipped with the first real banner uploads
  (`RegionalBanner.tsx`, deleted by this change)

## Context

The first working version of the banner system rendered each filled slot as its own full-width `<section>`,
inserted between two unrelated content blocks: a banner slice, then the DDD carousel; another slice, then "Fala
daqui"; another, between a city's header and its "Estilos" grid; another, between a state's header and its city
browser. Once real photography replaced the empty slots, the home and the city/state pages read as a sequence of
"content → unrelated photo → content → unrelated photo", not as one continuous storefront.

## Decision

A banner is only ever the **background of the section it belongs to**. It never opens or closes with its own
`<section>`, and it never separates two blocks that would otherwise sit next to each other.

- **Hero** (`RegionHero`): unchanged, this was already right — the photo sits behind the headline, search and the
  three product cards.
- **Campaign** (`Campaign`): the photo is the background of the closing editorial block itself; the headline, body
  and CTA are drawn in code on top of it, always — not swapped out when a photo exists. Without a photo, the
  original macro-crop grid still carries the same message.
- **State** — two places, two different treatments:
  - Home (`StateCards`): the photo becomes each card's own cover image, with the gold accent rule sitting at the
    seam between photo and text.
  - State page (`/[region]/[uf]`): the photo ambients the identity header (breadcrumb, name, city/region count,
    map). The search field is deliberately **not** on the photo: its results list needs a plain, calm ground to
    stay legible, so it lives in its own quiet strip immediately below, not a new visual section.
- **City** (`/[region]/[uf]/[city]`): the photo ambients the header (breadcrumb, city name, state/region, map),
  exactly like the state page. It never names the city itself — the H1 already does that in text.
- **Fala daqui**: the photo becomes the background of the `#fala` section itself, tinted with the region's own
  primary colour (`.regional-wash-primary`) instead of a flat fill. White text, unchanged carousel.
- **DDD**: left unused on purpose. The section is a plain carousel of small product photos, which need a calm flat
  ground to read — the same reason product cards stay neutral everywhere else on the site. A photo behind them
  would compete with the product, not ambient it. The asset stays defined in `banners.ts`, ready, but no page
  renders it until a genuinely good in-section placement is found.

## Implementation

- `BannerConfig` now carries only `asset` — the `heading`/`body`/`cta`/`align`/`overlay` fields it had are gone.
  They existed only to support the old standalone-section renderer; keeping them would invite that pattern back.
  A section's own copy (headline, body, CTA) is written directly in its own component.
- `RegionalBanner.tsx` (the component that rendered a slot as its own `<section>`, with those fields as an overlay)
  is deleted.
- `RegionalPhotoSection` (new) is the one shared "photo background" layer: a decorative `<picture>`
  (`BannerBackground`) plus one of three code-drawn washes in `globals.css`:
  - `.regional-wash` — light, warm, fades into the page ground; black text. Hero, state/city headers.
  - `.regional-wash-primary` — the region's own primary colour as a tint; white text. Fala daqui.
  - `.regional-wash-dark` — near-black; white text. Campaign.
- `--region-primary-rgb` was added to `region-theme.ts` (alongside the existing hex `--region-primary`) so CSS can
  compose the primary colour with an alpha channel without relative-colour syntax.
- `SLOT_FRAMES` (aspect ratios and minimum sizes per slot) stays as production-brief documentation only; no
  component reads it at runtime any more, since every slot is now sized by the section that owns it.

## Consequences

- A region can still launch with zero banners: every integration above degrades to its original, fully designed,
  no-photo layout (state cards with no cover, plain headers, the flat olive Fala daqui, the macro-crop campaign).
- The DDD banner asset (`ddd-mobile.png`, `ddd-desktop.png`) is uploaded and configured but not visible on the
  site. This is deliberate, not a bug — see the "DDD" bullet above.
- Norte and Centro-Oeste get the same treatment automatically once their own `banners.ts` entries are filled in;
  no page-level code changes needed.

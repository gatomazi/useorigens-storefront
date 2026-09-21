# Storefront benchmark

Observed live in Chrome on 2026-09-21 (desktop hero plus one or two scrolls; Ark also on mobile).
Cookie/region modals were left untouched, so a few heroes were seen behind a modal.
No third-party screenshots are stored in this repo (copyright); everything below is our own notes.
Nothing here is to be copied: assets, type, colors, copy and exact grids stay out.

> Ark note: `arkclub.com.br` is the custom storefront; `arkclub.com.br/arkclub` is the INK page.
> The first pass looked at the INK page by mistake and was redone on the storefront root.

## Ark Club (arkclub.com.br)
- **Works**: black announcement + black sticky header with centered wordmark; split hero with models and a
  heavy-sans headline and one pill CTA; benefits strip with icons; "Mais vendidos" tabs + carousel;
  "Encontre seu estilo" as tall image cards with a gradient, name and a discreet "Explorar"; product photos on
  flat light grey (same trick we already use).
- **Do not bring**: countdown timer and coupon bar (fake-urgency feel), a strip of six generic benefit icons,
  centered eyebrow + title on every section, five badges per card.
- **Reinterpret**: image-dominant category cards with the label sitting on the image; tabs only where the
  content really has groups.
- **Where**: family cards (image first, name on it), best-seller row.

## Kith
- **Works**: full-bleed hero where the *product is the scene*; header transparent over the image with tiny
  tracked nav; a serif caption at the bottom-left instead of a big headline; almost no chrome.
- **Do not bring**: dense mega-menu, modal-first entry.
- **Reinterpret**: transparent header over the hero that turns solid on scroll; a quiet caption under the hero.
- **Where**: header behavior, hero caption ("Na foto: Florianópolis").

## Fear of God
- **Works**: photography carries everything; light serif headline in the lower third; two rectangular CTAs;
  header is a thin translucent bar; huge silence around the subject.
- **Do not bring**: austerity (we must stay warm and regional), light-weight serif headline.
- **Reinterpret**: scale and silence, not minimalism for its own sake. Fewer words per screen.
- **Where**: hero spacing, campaign block with one sentence and one CTA.

## Carhartt WIP
- **Works**: editorial photo hero with an understated "Shop now" text link, transparent header, product
  right after campaign, campaign and commerce alternate.
- **Do not bring**: heavy legal/consent UI before content, mono-color feel.
- **Reinterpret**: alternate campaign block and product row instead of grid after grid.
- **Where**: page rhythm: hero → search → families → states → campaign → best sellers.

## Osklen
- **Works**: framed hero (rounded image floating over a blurred version of itself), macro product texture as
  the hero image, glass pill nav, product + material story.
- **Do not bring**: glass/blur chrome, floating promo pills.
- **Reinterpret**: **macro crops of the real art** (map lines, compass, type) as editorial imagery.
- **Where**: the campaign block uses large crops of INK product photos.

## PACE (pacecompany.com.br)
- **Works**: the *city is the subject* (São Paulo at night as full-bleed video); wordmark and season name
  set at extreme scale left/right; header reduced to almost nothing; pause control on moving media.
- **Do not bring**: video (weight), dark-only palette, a season/drop framing.
- **Reinterpret**: place-as-subject, type at extreme scale, header nearly invisible on the hero.
- **Where**: hero headline scale, city page title, state panels.

## Patagonia
- **Works**: large square image tiles with a small title and links under them; full-bleed campaign band
  between commerce rows; category carousel with a visible next arrow; clear multi-level discovery.
- **Do not bring**: cookie panel weight, uniform tile size everywhere.
- **Reinterpret**: variable-size tiles (one large, several small) so families have rhythm.
- **Where**: family grid (featured + rest), state pages.

## Aimé Leon Dore
- **Works**: full-bleed landscape photography as the entrance, tracked small-caps wordmark, very few words,
  slow feeling. Seen behind a region modal only.
- **Do not bring**: tracked small caps as our type, generic luxury tone.
- **Reinterpret**: landscape as identity (needs real Sul photography, listed in the report as an asset).
- **Where**: future hero photography slot.

## Ten principles for Use Origens
1. **The place is the subject.** Type at extreme scale carries the hero until we have photography.
2. **Real product, cut-out feel.** Keep the `#e5e5e5` ground; tees float, no card boxes.
3. **One bold move per screen.** Hero = headline; search = signature; states = gold band; campaign = macro crop.
4. **Alternate, never stack.** Campaign → product → discovery → product; no hero + grid ×4.
5. **Header disappears at the top, returns on scroll.** Transparent over the hero, solid and shorter after.
6. **Search is a feature of the brand**, not a filter: giant input, a board of results, keyboard first.
7. **Variable tile sizes.** One family featured, the rest smaller; the layout adapts to how many exist.
8. **Copy is short and factual.** No countdowns, no urgency, no benefits strip we cannot prove.
9. **Macro crops are our photography** until real campaign shots exist (Osklen lesson, using our own art).
10. **Motion answers action.** One entrance in the hero, header state, hover, search results, variant swap.

# Use Origens Storefront
## Product, UX, Visual Design & Technical Specification
### Version 1.0 — September 2026

> **Purpose of this document**
>
> This is the implementation brief for the new public storefront of **Use Origens**.
> The storefront is not a replacement for Reserva INK's transactional layer. It is the permanent public layer for brand, discovery, merchandising, regional navigation, city search, SEO and product preview.
>
> Reserva INK remains responsible for final product page/variant selection, cart, checkout, payment, order and production.
>
> Visual quality is a first-class requirement. A technically correct but generic, template-looking or visually weak implementation is **not acceptable**.

---

# 1. Product vision

Build a premium, highly visual storefront for **Use Origens** with the following public architecture:

```text
https://www.useorigens.com.br/
https://www.useorigens.com.br/sul
https://www.useorigens.com.br/norte
https://www.useorigens.com.br/centro-oeste

https://loja.useorigens.com.br
```

The public storefront controls:

- brand experience;
- homepage;
- regional experiences;
- city discovery;
- state discovery;
- collections;
- search;
- banners;
- editorial blocks;
- product discovery;
- product previews;
- SEO landing pages;
- merchandising;
- analytics before purchase;
- campaigns and regional storytelling.

Reserva INK controls:

- final transactional product page;
- garment/color/size variants supported by the INK product;
- cart;
- coupon;
- freight;
- checkout;
- payment;
- order;
- production;
- fulfillment.

The architectural principle is:

```text
USE ORIGENS STOREFRONT
discovery + brand + merchandising
              ↓
       resolved product
              ↓
RESERVA INK
transaction + cart + checkout
```

The customer should perceive the whole system as one brand, even though the transaction happens on the INK subdomain.

---

# 2. Why this storefront exists

This project must solve problems that cannot be solved well with a standard INK storefront.

The main problems are:

1. Preserve a strong **regional experience** while consolidating Use Sul, Use Norte and Use Centro-Oeste under Use Origens.
2. Avoid presenting thousands of city-based products as an enormous flat catalog.
3. Allow the customer to search by **region, state, city, expression or collection**.
4. Reduce the city catalog to a comprehensible set of **8 design families**.
5. Show the customer a real preview of the chosen city/design before sending them to INK.
6. Give the brand full visual control over homepages, banners, campaigns and editorial merchandising.
7. Build the long-term SEO and brand presence on a domain controlled by Use Origens rather than by the commerce provider.
8. Allow the underlying commerce destination to change later without changing the public storefront architecture.

The storefront is therefore not merely a prettier homepage.

It is the **discovery engine and flagship digital experience of Use Origens**.

---

# 3. Core catalog concept: virtualize the city catalog

Do **not** model every city/design combination as a first-class storefront product.

From the customer's perspective, the city catalog consists of only 8 base design families:

1. Legado
2. Ponto de Origem
3. Coordenadas
4. Tipografia
5. Traço
6. Território
7. Feito Em
8. Gentílico

Internally use the term `DesignFamily` or `CityDesignFamily` to avoid confusion with the garment model sold by INK.

The customer experience should behave conceptually like:

```text
DESIGN FAMILY
      +
REGION
      +
STATE
      +
CITY
      ↓
resolve matching INK product
      ↓
show real INK product image/preview
      ↓
open the corresponding INK product page
```

Example:

```text
Ponto de Origem
+
Sul
+
SC
+
Tijucas
=
Ponto de Origem — Tijucas/SC
```

The storefront displays the resolved real product image returned/synchronized from the INK API.

Only when the customer decides to buy do we redirect to the corresponding product on INK.

---

# 4. Two valid discovery journeys

The storefront must support both customer mental models.

## 4.1 City-first journey

For customers thinking:

> "I want a shirt from Tijucas."

Flow:

```text
Search city
   ↓
Tijucas — SC
   ↓
show the 8 available design families using real previews
   ↓
choose one
   ↓
preview/details
   ↓
View in store / Choose size and buy
   ↓
INK product
```

Example city page:

```text
TIJUCAS — SANTA CATARINA

Choose your style

[ Legado preview ]
[ Ponto de Origem preview ]
[ Coordenadas preview ]
[ Tipografia preview ]
[ Traço preview ]
[ Território preview ]
[ Feito Em preview ]
[ Gentílico preview ]
```

This is likely the highest-value journey for paid traffic and direct city intent.

---

## 4.2 Design-first journey

For customers thinking:

> "I like the Coordinates design. I want it with my city."

Flow:

```text
City designs
   ↓
Coordinates
   ↓
Choose state
   ↓
Choose city
   ↓
load actual resolved preview
   ↓
View in store / Choose size and buy
   ↓
INK product
```

The page should update elegantly when the city changes, without a full-page visual reset.

---

# 5. Public URL architecture

Use clean, durable and SEO-friendly URLs.

## 5.1 Root

```text
/
```

Purpose:

- explain Use Origens;
- allow immediate city search;
- route to regions;
- feature nationwide/editorial content;
- show best sellers and highlights;
- establish brand identity.

---

## 5.2 Regional roots

```text
/sul
/norte
/centro-oeste
```

A regional root is **not just a filtered category**.

Each region is a complete branded experience inside Use Origens, with its own:

- hero;
- photography;
- copy;
- accent colors;
- featured products;
- featured states;
- campaigns;
- collections;
- regional editorial content.

The base brand remains recognizably Use Origens.

---

## 5.3 State routes

Examples:

```text
/sul/sc
/sul/pr
/sul/rs

/norte/pa
/norte/am

/centro-oeste/go
/centro-oeste/mt
```

State pages may contain:

- state-specific hero;
- city search pre-filtered by state;
- popular cities;
- featured products;
- regional collections;
- editorial banners.

---

## 5.4 City routes

Use canonical city pages:

```text
/sul/sc/tijucas
/sul/sc/florianopolis
/sul/pr/curitiba
/sul/rs/porto-alegre
```

These pages must be shareable and indexable.

They should not be query-param-only experiences.

---

## 5.5 Design family routes

Entry route:

```text
/sul/cidades/ponto-de-origem
/sul/cidades/coordenadas
/sul/cidades/gentilico
```

When state/city are selected, prefer navigating to a canonical resolved URL:

```text
/sul/sc/tijucas/ponto-de-origem
/sul/sc/tijucas/coordenadas
/sul/sc/tijucas/gentilico
```

The selector may use client state during interaction, but every final combination should have a clean URL when possible.

---

## 5.6 Search

Suggested route:

```text
/buscar?q=tijucas
```

Search result pages should usually be `noindex, follow` unless a deliberate SEO strategy says otherwise.

Canonical city/state pages are the SEO destination.

---

# 6. Commerce destination architecture

The public storefront must **not** hard-code a single commerce provider URL throughout the UI.

Create a centralized commerce destination layer.

Today the regions may still resolve to separate current INK stores.

Conceptually:

```text
Sul          → current Use Sul INK store
Norte        → current Use Norte INK store
Centro-Oeste → current Use Centro-Oeste INK store
```

Later:

```text
Sul
Norte
Centro-Oeste
      ↓
https://loja.useorigens.com.br
```

The storefront must not require a UI rewrite when this happens.

Suggested concept:

```ts
type CommerceStoreKey =
  | "use-sul"
  | "use-norte"
  | "use-centro"
  | "use-origens";
```

A product binding resolves both:

- the INK product;
- the current commerce store destination.

When the operation is consolidated into one INK store, the mapping changes, not the public experience.

---

# 7. Reserva INK API integration

Reserva INK now provides API access sufficient for this use case, including the ability to obtain/track product information such as slug and product images.

Treat the INK API as the **commerce source of truth**.

Do not manually duplicate product slugs, images or prices across React components or static JSON files.

## 7.1 Important rule

**Never call the INK API directly from the browser when the endpoint requires credentials or exposes privileged information.**

Create a server-side adapter.

Suggested structure:

```text
src/
  lib/
    ink/
      client.ts
      types.ts
      normalizers.ts
      resolver.ts
      repository.ts
```

or equivalent according to the final project conventions.

---

## 7.2 First implementation task

Before implementing the catalog, inspect:

- the actual INK API documentation available in the workspace;
- existing credentials/environment variables;
- existing API wrappers, if any;
- real product response examples;
- pagination;
- rate limits, if documented;
- product fields;
- image fields;
- slug fields;
- collection/category fields;
- store/shop identifiers.

**Do not invent undocumented production endpoints.**

Normalize INK responses behind our own interface so the rest of the application does not depend directly on raw INK payload shapes.

Example internal type:

```ts
type InkProductNormalized = {
  id: string;
  storeKey: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  additionalImages?: string[];
  price?: number;
  compareAtPrice?: number | null;
  active: boolean;
  raw?: unknown;
};
```

Adapt this to the real API contract.

---

# 8. Product resolver

Create one centralized resolver responsible for translating storefront intent into an INK product.

Concept:

```ts
resolveCityProduct({
  region,
  state,
  city,
  designFamily
})
```

Return:

```ts
type ResolvedCityProduct = {
  designFamily: DesignFamily;
  region: Region;
  state: State;
  city: City;

  inkProductId: string;
  inkSlug: string;
  inkProductUrl: string;

  imageUrl: string;
  additionalImages?: string[];

  price?: number;
  active: boolean;

  commerceStoreKey: CommerceStoreKey;
  syncedAt: string;
};
```

All parsing/naming/slug conventions belong in the resolver/indexing layer.

Do not distribute logic such as:

```ts
product.name.includes("SC")
```

through UI components.

---

# 9. Catalog indexing and cache

The storefront must not become unavailable or slow because every page is making many sequential requests to INK.

Preferred model:

```text
INK API
   ↓
normalizer
   ↓
local product index/cache
   ↓
storefront
```

The local index is not a second commerce source of truth.

It is a read-optimized cache/search index of INK commerce data.

Recommended stored fields:

```text
ink_product_id
commerce_store_key
slug
name
image_url
additional_images
price
active

design_family
region
state
city_id

last_synced_at
```

Use the simplest persistence compatible with the chosen infrastructure.

For a greenfield Next.js implementation, PostgreSQL is a good default. Use the project's existing database conventions if the workspace already standardizes on another stack.

Synchronization can initially be:

- scheduled;
- manually triggered;
- revalidated on demand;
- or a combination.

If the INK API exposes appropriate catalog webhooks, they may be added later.

## 9.1 Resilience

If INK is temporarily unavailable:

- serve last-known-good catalog data;
- keep cached product imagery where allowed;
- do not show an empty storefront because of a transient upstream error;
- mark stale data internally for observability;
- fail gracefully if no valid cached binding exists.

---

# 10. Local data owned by Use Origens

The storefront should own data that is editorial or discovery-specific rather than transactional.

Examples:

### Region

```ts
type Region = {
  id: string;
  slug: "sul" | "norte" | "centro-oeste";
  name: string;
  shortDescription?: string;
  themeKey: string;
};
```

### State

```ts
type State = {
  uf: string;
  name: string;
  regionSlug: string;
};
```

### City

```ts
type City = {
  id: string;
  slug: string;
  name: string;
  uf: string;
  regionSlug: string;

  gentilic?: string;
  aliases?: string[];
  coordinates?: {
    lat: number;
    lng: number;
  };
};
```

Aliases are important for search:

```text
Florianópolis → Floripa
Rio de Janeiro → Rio
etc.
```

Only add aliases that are deliberate and correct.

### DesignFamily

```ts
type DesignFamily = {
  id: string;
  slug: string;
  name: string;
  description: string;

  sortOrder: number;
  active: boolean;

  coverImage?: string;
  editorialImage?: string;
};
```

### EditorialBlock

Used for:

- hero;
- banners;
- region campaigns;
- seasonal messages;
- collection highlights.

These should not be mixed into INK commerce data.

---

# 11. Homepage `/`

The root homepage should feel like the flagship homepage of a serious apparel brand.

It must not look like:

- a POD catalog;
- a marketplace;
- a generic Shopify template;
- an AI-generated landing page;
- a SaaS dashboard.

Structural inspiration may be taken from the hierarchy and editorial rhythm of Ark Club, but **do not copy the design**.

## Suggested homepage structure

### 11.1 Announcement bar

Examples of appropriate content:

- freight conditions;
- payment conditions;
- current real promotion.

Keep it visually light.

Do not create fake urgency.

---

### 11.2 Global header

Desktop:

```text
USE ORIGENS

Search...

Regions
Cities
Collections
New
About

Account/cart link only if a useful INK destination exists
```

The storefront does not own the cart.

Do not show a fake cart counter.

If linking to the INK cart is reliable, use an explicit link such as:

```text
Continue purchase
```

Otherwise do not simulate cart state.

Mobile header should prioritize:

1. menu;
2. logo;
3. search.

---

### 11.3 Flagship hero

The hero must have:

- premium campaign photography;
- strong typography;
- concise copy;
- one primary CTA;
- optional secondary CTA;
- deliberate composition on desktop and mobile.

Suggested positioning direction:

```text
Vista o lugar que fez você.
```

or equivalent final brand copy.

Primary CTA:

```text
ENCONTRAR MINHA CIDADE
```

Secondary CTA may lead to regions or new products.

The visual direction should be editorial and emotionally regional, not tourist/souvenir.

---

### 11.4 Regional discovery

Large visual cards:

```text
SUL
NORTE
CENTRO-OESTE
```

Each card should use region-specific imagery and art direction.

Do not reduce this to three generic rounded cards with icons.

Treat the region cards as campaign/editorial blocks.

---

### 11.5 City search

This is a central feature, not a secondary filter.

Headline example:

```text
Onde começa a sua história?
```

Input:

```text
Busque sua cidade...
```

The autocomplete may display:

```text
Tijucas
Santa Catarina · Sul

Florianópolis
Santa Catarina · Sul
```

Keyboard navigation and accessible focus behavior are mandatory.

---

### 11.6 Best sellers

Use a premium product carousel/grid with data from INK.

Product cards should be restrained.

Avoid badges everywhere.

Suggested card content:

- product image;
- title;
- price if current data is available;
- subtle region/city context if relevant.

---

### 11.7 City design families

Show the 8 city design families in a visually strong section.

This section must make the concept immediately understandable.

Example:

```text
Sua cidade. Oito formas de vestir.
```

Each family uses a real representative preview.

---

### 11.8 Editorial/category blocks

Possible blocks:

- Masculino/Feminino only if actually relevant to the catalog;
- Algodão;
- Algodão Peruano;
- region/collection editorial;
- Fala Daqui;
- Da Nossa Terra;
- Do Nosso Jeito;
- Clube.

Do not blindly copy Ark's categories.

Use Origens' content architecture must be native to the brand.

---

### 11.9 Brand manifesto

A visually rich section explaining that Use Origens creates apparel about belonging and identity, without appearing like souvenir merchandise.

Use real brand copy/assets when available.

---

### 11.10 Footer

Include:

- regions;
- city discovery;
- institutional links;
- policies;
- contact;
- social links;
- payment/security information only when true/current.

---

# 12. Regional homepage

Each regional homepage must feel distinctive while remaining part of Use Origens.

Example:

```text
/sul
```

Suggested content:

1. region-specific hero;
2. city search scoped to the South;
3. state discovery;
4. 8 city design families;
5. best sellers in the region;
6. region-specific collections;
7. editorial/lifestyle banner;
8. new products;
9. manifesto or regional brand story.

The page must not merely change a heading from "Brasil" to "Sul".

It should change:

- imagery;
- product curation;
- accent treatment;
- copy;
- featured locations;
- editorial rhythm when appropriate.

The same principle applies to `/norte` and `/centro-oeste`.

---

# 13. City page

Example:

```text
/sul/sc/tijucas
```

This page should be one of the strongest conversion/discovery pages in the product.

Suggested structure:

```text
Tijucas
Santa Catarina · Sul

[ local/editorial hero or restrained header ]

8 maneiras de vestir Tijucas

[ actual preview Legado ]
[ actual preview Ponto de Origem ]
[ actual preview Coordenadas ]
[ actual preview Tipografia ]
[ actual preview Traço ]
[ actual preview Território ]
[ actual preview Feito Em ]
[ actual preview Gentílico ]
```

Each card should use the resolved actual image from INK whenever available.

If one design does not exist for a city, either:

- omit it;
- or mark it unavailable only when that is useful.

Do not display broken placeholders.

The bottom of the page may include:

- more from the state;
- regional collections;
- related cities;
- brand story.

---

# 14. Design family configurator

Example:

```text
/sul/cidades/ponto-de-origem
```

Layout goal: premium product configurator, not an admin form.

Desktop concept:

```text
┌──────────────────────────────┬──────────────────────────────┐
│                              │ PONTO DE ORIGEM              │
│                              │                              │
│       PRODUCT PREVIEW        │ Estado                       │
│                              │ [ Santa Catarina ▼ ]         │
│                              │                              │
│                              │ Cidade                       │
│                              │ [ Tijucas ▼ ]                │
│                              │                              │
│                              │ Preview description          │
│                              │                              │
│                              │ [ VER NA LOJA ]              │
└──────────────────────────────┴──────────────────────────────┘
```

On mobile:

1. preview;
2. selectors;
3. CTA;
4. additional details.

When a city changes:

- use an elegant image transition;
- preserve layout stability;
- prefetch likely data where sensible;
- indicate loading subtly;
- do not flash the page.

The customer chooses **region/state/city/design** in our storefront.

Final garment variant choices such as size/color should remain in INK unless a future supported API makes a better integrated flow possible.

Avoid asking the customer to choose the same thing twice.

---

# 15. Search experience

Search is one of the signature features.

It must support:

- city;
- city aliases;
- state;
- region;
- product names;
- collections;
- possibly regional expressions when indexed.

Expected behavior:

```text
"tij"
→ Tijucas — SC

"floripa"
→ Florianópolis — SC

"coordenadas"
→ Coordenadas design family

"SC"
→ Santa Catarina
```

Use accent-insensitive matching.

Rank exact city matches above fuzzy results.

Do not let fuzzy search produce obviously wrong geographic results.

For the first version, a well-indexed PostgreSQL search is sufficient if performant.

Only introduce a dedicated search engine such as Meilisearch/Typesense if scale or relevance justifies it.

---

# 16. Visual direction — non-negotiable

Visual quality is one of the main reasons this project exists.

Claude must use a **design-first workflow**, not a "components-first" workflow.

Before completing the entire application, establish the visual language through real screens.

## 16.1 Desired feeling

The storefront should feel:

- premium;
- editorial;
- contemporary;
- regional without becoming folkloric;
- human;
- tactile;
- fashion-oriented;
- confident;
- clean but not sterile.

The customer should perceive an apparel brand, not a souvenir shop.

---

## 16.2 Reference philosophy

Ark Club can be used as a reference for:

- generous composition;
- premium product presentation;
- whitespace;
- strong hero;
- campaign/editorial sections;
- product carousels;
- category discovery;
- visual hierarchy.

Do **not** clone:

- typography;
- exact grid;
- exact section order;
- assets;
- copy;
- interactions.

Build an original Use Origens identity.

---

## 16.3 Avoid generic AI aesthetics

Avoid:

- purple/blue startup gradients;
- glassmorphism everywhere;
- excessive rounded cards;
- generic Inter-only typography;
- every section inside a card;
- random icons added for decoration;
- neon accents;
- meaningless floating blobs;
- gradient text;
- excessive shadows;
- generic SaaS spacing/layout;
- animation for animation's sake.

---

## 16.4 Typography

Typography must be deliberate.

Use a strong display/editorial face paired with a highly legible UI/body face when appropriate.

Do not choose fonts merely because they are defaults.

Before finalizing typography:

1. inspect Use Origens logo/assets;
2. inspect existing regional brand assets;
3. propose a coherent hierarchy;
4. test hero, product cards and mobile readability.

Create explicit tokens for:

- display;
- h1;
- h2;
- h3;
- body;
- small;
- caption;
- label.

---

## 16.5 Color system

Create:

1. neutral/base Use Origens palette;
2. regional accent tokens;
3. semantic UI colors.

Do not hard-code unrelated colors inside components.

Example architecture:

```css
:root {
  --brand-bg: ...;
  --brand-fg: ...;
  --brand-muted: ...;
  --brand-accent: ...;
}

[data-region="sul"] {
  --region-accent: ...;
  --region-surface: ...;
}

[data-region="norte"] {
  --region-accent: ...;
  --region-surface: ...;
}

[data-region="centro-oeste"] {
  --region-accent: ...;
  --region-surface: ...;
}
```

Final colors must be derived from approved Use Origens/regional brand direction, not invented randomly.

---

# 17. Motion and interaction design

Motion is encouraged when it improves perceived quality and comprehension.

Use restraint.

Recommended motion:

- hero content entrance;
- subtle image reveal;
- product hover image transition;
- carousel inertia;
- region card hover;
- search overlay opening;
- selector transitions;
- product preview crossfade;
- subtle scroll reveals;
- sticky header state transition;
- tasteful page transitions where technically appropriate.

Avoid:

- constant looping animations;
- excessive parallax;
- scroll hijacking;
- large animations blocking interaction;
- effects that reduce product readability.

Rules:

- honor `prefers-reduced-motion`;
- prefer CSS for simple transitions;
- prefer transform/opacity;
- keep interactions interruptible;
- mobile performance has priority over spectacle.

---

# 18. Recommended frontend stack

For a greenfield implementation, prefer:

```text
Next.js 16.x Active LTS
React
TypeScript strict mode
Tailwind CSS 4.x
shadcn/ui primitives where useful
Motion for React for deliberate motion
Embla Carousel for product/editorial carousels
```

Use Server Components by default.

Add client components only where interactivity requires them.

Do not turn the whole storefront into a client-rendered SPA.

Do not use shadcn's default visual appearance as the final design.

Use its accessible primitives and own/customize the code.

---

# 19. Recommended Claude/agent skills

Before major visual implementation, install/use strong agent skills rather than relying on default model taste.

## Required/recommended

### Anthropic Frontend Design

Use the official Anthropic frontend design skill/plugin.

Purpose:

- distinctive visual direction;
- deliberate typography;
- production-quality UI;
- avoidance of generic AI layouts;
- intentional animation and composition.

Suggested install:

```bash
npx -y skills add anthropics/skills --skill frontend-design --agent claude-code
```

### shadcn/ui skill

Use the current shadcn agent skill so component primitives and CLI usage follow current APIs.

Suggested install:

```bash
pnpm dlx skills add shadcn/ui
```

### Vercel Web Design Guidelines

Use this as a review skill for:

- accessibility;
- interaction quality;
- focus;
- mobile tap targets;
- animation correctness;
- UX polish.

Suggested install:

```bash
npx skills add https://github.com/vercel-labs/agent-skills --skill web-design-guidelines
```

### Vercel React Best Practices

Use the Vercel React/Next skill during implementation and review.

Suggested package:

```bash
npx skills add vercel-labs/agent-skills
```

Activate/use `vercel-react-best-practices` for React/Next work.

## Optional

Use `npx skills find` to discover additional design skills if a specific need appears.

Do not stack many conflicting visual skills simultaneously.

The Anthropic Frontend Design skill should be the primary aesthetic guidance.

---

# 20. UI libraries and visual tooling

## shadcn/ui

Use for accessible primitives such as:

- dialog;
- sheet;
- dropdown;
- command/search;
- tabs;
- accordion;
- tooltip.

Customize aggressively.

The storefront must not look like an unmodified shadcn application.

---

## Motion for React

Use for:

- layout transitions;
- preview changes;
- hover states when CSS is insufficient;
- animated presence;
- orchestrated hero motion;
- scroll-triggered reveals.

Keep animation code localized.

---

## Embla Carousel

Preferred for:

- best sellers;
- new products;
- campaign slides;
- editorial/category carousels.

Requirements:

- keyboard-accessible controls;
- touch support;
- no aggressive autoplay;
- pause controls if autoplay is used;
- responsive slide sizing.

---

# 21. Component architecture

Suggested components:

```text
layout/
  AnnouncementBar
  GlobalHeader
  MobileNavigation
  RegionSwitcher
  GlobalFooter

search/
  GlobalSearch
  SearchOverlay
  SearchResults
  CityAutocomplete

hero/
  FlagshipHero
  RegionalHero
  HeroCarousel

catalog/
  ProductCard
  ProductGrid
  ProductCarousel
  DesignFamilyCard
  DesignFamilyGrid

city/
  StateSelector
  CitySelector
  CitySearch
  CityHero
  CityDesignGrid
  CityProductPreview

editorial/
  EditorialBanner
  RegionCard
  RegionGrid
  BenefitsStrip
  ManifestoSection
  CollectionFeature

commerce/
  InkPurchaseCTA
  CommerceDestinationLink
```

Components must be driven by data.

Do not bake "Sul" or "Tijucas" directly into reusable components.

---

# 22. Hero/banner system

Banners and hero sections are essential merchandising tools.

Design them as a reusable content system with controlled variants.

Possible hero modes:

```text
image-left-copy-right
copy-left-image-right
full-bleed
editorial-split
campaign-carousel
```

Support separate desktop/mobile assets where needed.

Each hero/banner can define:

```ts
type EditorialHero = {
  eyebrow?: string;
  title: string;
  description?: string;

  desktopImage: string;
  mobileImage?: string;

  primaryCta?: {
    label: string;
    href: string;
  };

  secondaryCta?: {
    label: string;
    href: string;
  };

  region?: string;
  theme?: string;
};
```

Do not build a free-form page builder in V1.

Use controlled components.

---

# 23. Product cards

Product cards should emphasize the product, not UI chrome.

Card requirements:

- image is visually dominant;
- name is readable;
- price shown only from current INK-derived data;
- optional subtle context;
- hover transition on desktop;
- strong touch behavior on mobile;
- no fake urgency;
- no fake ratings;
- no fabricated scarcity.

Cards that represent city design families should be clearly differentiated from transactional product cards.

---

# 24. Images

Use actual INK product imagery wherever possible for resolved products.

Rules:

- use `next/image`;
- configure remote image hosts correctly;
- preserve aspect ratio;
- avoid layout shifts;
- generate correct responsive sizes;
- optimize hero assets separately;
- lazy-load below-fold images;
- preload only the real LCP image.

Do not download and permanently duplicate INK images unless there is a deliberate caching/storage decision and licensing/operational reason to do so.

---

# 25. Responsive/mobile design

Mobile quality is mandatory.

Do not treat mobile as a stacked desktop page.

Specific mobile expectations:

- city search remains obvious;
- hero uses mobile-specific composition;
- regional cards can use horizontal swipe or a clean stack;
- product/design carousels use natural touch gestures;
- selectors are easy to use one-handed;
- CTA remains clearly visible;
- no tiny desktop-style dropdowns;
- tap targets follow accessibility guidelines;
- text inputs avoid iOS zoom behavior;
- sticky elements never cover content or focus.

The city configurator should feel especially polished on mobile.

---

# 26. Accessibility

Minimum expectations:

- semantic HTML;
- correct heading hierarchy;
- keyboard operability;
- visible focus states;
- ARIA only where needed;
- accessible carousel controls;
- screen-reader labels;
- sufficient contrast;
- no interaction depending solely on hover;
- reduced motion support;
- modals/sheets manage focus correctly;
- autocomplete supports keyboard navigation.

Accessibility is part of visual/product quality, not a later patch.

---

# 27. Performance

Visual richness must not destroy storefront performance.

Target at least:

```text
LCP < 2.5 s p75 mobile
INP < 200 ms p75
CLS < 0.1
```

Guidelines:

- RSC/server rendering by default;
- cached INK API access;
- no sequential request waterfalls;
- image optimization;
- responsive images;
- minimal client JS;
- dynamically load heavy interaction libraries when appropriate;
- CSS transitions for simple motion;
- avoid enormous videos as default hero assets;
- avoid blocking third-party scripts;
- use suspense boundaries deliberately.

A visually premium storefront that feels slow is not premium.

---

# 28. SEO

SEO is a major advantage of owning the public storefront.

Implement:

- metadata per region/state/city;
- canonical URLs;
- sitemap;
- robots;
- Open Graph;
- Twitter/social cards;
- breadcrumb schema where useful;
- Organization schema;
- Product schema only when actual current product data supports it;
- clean city pages;
- clean design-family pages;
- internal linking among region/state/city/design.

Do not index duplicate query-param variants.

Programmatic SEO must not create thin/spammy pages.

City pages need meaningful content and real products.

---

# 29. Analytics and attribution

Instrument the discovery journey.

At minimum track:

```text
region_select
state_select
city_search
city_select
design_family_select
city_product_preview
product_card_click
outbound_to_ink
banner_click
search_result_click
```

Useful event parameters:

```text
region
state
city
design_family
ink_product_id
ink_slug
commerce_store_key
source_section
campaign
```

The key funnel is:

```text
traffic source
   ↓
Use Origens storefront
   ↓
region/city/design discovery
   ↓
outbound_to_ink
   ↓
INK cart/checkout
   ↓
purchase
```

Configure GA4/Meta so the move between:

```text
www.useorigens.com.br
loja.useorigens.com.br
```

does not destroy attribution.

Do not assume this works automatically; verify cookie/domain and analytics configuration.

During the migration period, also verify attribution when the destination is still one of the current regional store domains.

---

# 30. Preserve context when sending the customer to INK

When safe and supported, attach non-sensitive context to the outbound transition so analytics can understand the origin.

For example:

```text
region=sul
state=sc
city=tijucas
design=ponto-de-origem
source=storefront
```

Only do this if INK preserves unknown query parameters safely.

Otherwise store the attribution in analytics/client storage before navigation.

Do not rely on private/unsupported INK behavior.

---

# 31. INK home strategy

The INK store remains reachable and should have a simpler commerce-oriented home.

Its home can continue to contain a strong return path to the Use Origens discovery experience.

Examples:

```text
Encontre sua cidade
→ https://www.useorigens.com.br/

Explorar o Sul
→ https://www.useorigens.com.br/sul
```

Do not try to replicate the entire Use Origens storefront inside INK.

INK is the transactional environment.

Use Origens is the flagship discovery environment.

---

# 32. Migration strategy

## Phase A — storefront launches before commerce consolidation

Public experience:

```text
www.useorigens.com.br/
www.useorigens.com.br/sul
www.useorigens.com.br/norte
www.useorigens.com.br/centro-oeste
```

Commerce resolution may still be:

```text
Sul          → current Use Sul INK
Norte        → current Use Norte INK
Centro-Oeste → current Use Centro-Oeste INK
```

This allows testing the storefront without first changing production/checkout operations.

---

## Phase B — make Use Origens the acquisition destination

Move:

- Meta Ads landing pages;
- Google Ads;
- Instagram links;
- organic content;
- campaign links;

toward `www.useorigens.com.br/...`.

The regional INK stores increasingly become transactional destinations rather than acquisition destinations.

---

## Phase C — consolidate the INK operation

Move commerce into:

```text
https://loja.useorigens.com.br
```

Update the commerce mapping/index.

The public storefront URLs and navigation should not need to change.

---

## Phase D — redirect legacy regional public URLs

Create a redirect map for meaningful old pages.

Examples:

```text
old Use Sul home
→ /sul

old state category
→ /sul/{uf}

old city/product pages
→ matching Use Origens city/design page where a reliable mapping exists
```

Do not blindly redirect every legacy URL to `/`.

Preserve search intent whenever possible.

---

# 33. Error and empty states

Examples:

## City not found

Do not show:

```text
No results.
```

Prefer:

```text
Ainda não encontramos essa cidade.

Tente buscar pelo nome completo ou escolha o estado.
```

Provide actionable alternatives.

---

## Product binding missing

If a city exists but one design has no current INK product:

- hide it when appropriate;
- or display a restrained unavailable state.

Do not send the customer to a broken INK URL.

---

## INK unavailable

If cached binding exists:

- continue showing last-known-good preview/link when safe.

If no valid destination exists:

- disable purchase CTA;
- log the issue;
- show a clear temporary message.

---

# 34. Observability

Log at minimum:

- INK API failures;
- synchronization failures;
- unresolved product mappings;
- duplicate mappings;
- invalid image URLs;
- broken outbound commerce URLs;
- stale cache age.

Create a simple internal diagnostics command/page later if useful.

For V1, structured logs are sufficient.

---

# 35. Security

- INK credentials are server-only.
- Never expose secrets in `NEXT_PUBLIC_*`.
- Validate all API data.
- Sanitize/escape CMS/editorial input.
- Do not trust slug/query params.
- Add reasonable API rate protection for public resolver/search routes.
- Do not proxy privileged INK endpoints directly to the browser.
- Use environment-specific store IDs and base URLs.

---

# 36. Testing strategy

## Unit tests

Focus on:

- slug normalization;
- city alias matching;
- state/region mapping;
- product resolver;
- commerce URL builder;
- INK response normalizer.

## Integration tests

Test:

```text
region + state + city + design
→ correct resolved INK product
```

Use fixtures based on real API response shapes.

## E2E

Critical flows:

1. homepage → region;
2. homepage → city search;
3. city → design;
4. design → city selector;
5. resolved preview;
6. outbound link to correct INK product;
7. mobile navigation;
8. search keyboard flow.

Use Playwright or the project's existing E2E stack.

---

# 37. Visual QA

Visual QA is mandatory.

For every major page, review at least:

```text
375 px mobile
430 px mobile
768 px tablet
1280 px desktop
1440+ px desktop
```

Check:

- typography;
- line wrapping;
- section rhythm;
- image crops;
- hover/focus;
- motion;
- loading skeletons;
- carousel overflow;
- sticky header;
- no accidental horizontal scroll.

Use screenshots during implementation.

Do not mark a page complete based only on code review.

---

# 38. Initial implementation order

Claude should **not** implement the entire site in one unreviewed pass.

Use vertical slices.

## Step 0 — inspect workspace

Before coding:

1. inspect repository structure;
2. identify existing framework;
3. inspect package.json;
4. inspect existing brand assets;
5. inspect Use Origens/Use Sul/Use Norte/Use Centro visual assets;
6. inspect available INK API docs/client code;
7. identify env conventions;
8. identify deployment conventions.

If this is a new repository, initialize the recommended stack.

---

## Step 1 — install/load relevant agent skills

At minimum:

- Anthropic Frontend Design;
- shadcn skill;
- Vercel web design guidelines;
- Vercel React best practices.

Use them actively, not merely install them.

---

## Step 2 — create visual foundation

Create:

- typography system;
- color tokens;
- regional theme tokens;
- spacing;
- container/grid system;
- button styles;
- image treatment;
- motion principles.

Document them in code.

Do not start by generating dozens of components.

---

## Step 3 — create a polished `/sul` visual slice

Build `/sul` first as the proving ground.

It should include:

- announcement/header;
- regional hero;
- city search;
- state discovery;
- 8 design-family section;
- one strong product carousel;
- one editorial banner;
- footer.

Use real assets/data where available.

This page must already feel production-quality.

---

## Step 4 — integrate INK API

Build:

- API client;
- normalized types;
- product index/cache;
- resolver;
- commerce URL builder.

Create test fixtures.

---

## Step 5 — implement one complete city flow

Use a real city such as Tijucas or another city present in the current data.

Implement:

```text
/sul
→ city search
→ /sul/sc/tijucas
→ 8 design previews
→ one resolved design
→ real INK product image
→ real INK slug
→ correct INK destination
```

This is the first true product milestone.

---

## Step 6 — design-first configurator

Implement one family such as:

```text
/sul/cidades/ponto-de-origem
```

State → city → actual preview → INK.

Polish transitions and mobile behavior.

---

## Step 7 — root homepage

Once the visual language and catalog engine are stable, build `/`.

This prevents the root flagship page from becoming a premature generic template.

---

## Step 8 — Norte and Centro-Oeste

Reuse the system but create distinct editorial experiences.

Do not duplicate pages and merely replace text.

Use shared architecture + regional theme/config/data.

---

## Step 9 — SEO, analytics and migration routes

Complete:

- metadata;
- sitemap;
- canonical URLs;
- event tracking;
- cross-domain/subdomain analytics;
- redirect plan.

---

## Step 10 — final performance/accessibility/visual review

Run:

- Lighthouse/Core Web Vitals review;
- accessibility review;
- visual review;
- React best-practices review;
- dead-code/bundle review.

---

# 39. First milestone definition of done

The first milestone is complete when all of the following are true:

### `/sul`

- visually production-quality;
- responsive;
- uses real brand assets where available;
- contains a polished hero;
- city search works;
- state navigation works;
- displays the 8 city design families;
- has at least one real product/editorial carousel;
- does not look like a generic template.

### City engine

- customer can select/search a real city;
- city page is canonical/shareable;
- city page resolves actual INK product data;
- actual product image is shown;
- missing mappings fail gracefully.

### Purchase transition

- CTA resolves the correct current INK store;
- CTA uses real product slug/destination;
- architecture supports multiple regional INK stores now;
- architecture supports `loja.useorigens.com.br` later without rewriting UI.

### Quality

- strong mobile experience;
- keyboard-accessible search;
- reduced-motion support;
- image layout has no obvious CLS;
- API secrets remain server-side;
- critical resolver logic has tests.

---

# 40. Important implementation constraints

## Do

- use real data early;
- make the visual experience distinctive;
- use INK as commerce source of truth;
- abstract INK behind a server-side adapter;
- centralize product resolution;
- build shareable city/design URLs;
- cache upstream commerce data;
- design mobile intentionally;
- keep regional experiences strong;
- preserve the ability to migrate commerce providers.

## Do not

- create thousands of first-class storefront product records manually;
- expose INK credentials;
- hard-code INK slugs in components;
- manually duplicate prices;
- make the storefront own a fake cart;
- simulate checkout;
- force all traffic directly to INK;
- clone Ark Club;
- use default shadcn styling as final design;
- fill the UI with generic rounded cards;
- over-animate;
- compromise visual quality to ship more sections quickly.

---

# 41. Product principle for every decision

When there is uncertainty, use this priority:

```text
1. Brand quality
2. Discovery clarity
3. Regional identity
4. Mobile usability
5. Performance
6. Maintainability
7. Commerce-provider independence
```

Never optimize the storefront around an INK limitation when a clean abstraction can hide that limitation from the customer.

---

# 42. Architectural summary

```text
                       ┌──────────────────────────┐
                       │     USE ORIGENS ROOT     │
                       │ www.useorigens.com.br    │
                       └─────────────┬────────────┘
                                     │
                    ┌────────────────┼─────────────────┐
                    │                │                 │
                    ▼                ▼                 ▼
                  /sul            /norte       /centro-oeste
                    │                │                 │
                    └────────────────┼─────────────────┘
                                     │
                        city / state / collection
                                     │
                                     ▼
                            8 DESIGN FAMILIES
                                     │
                              choose location
                                     │
                                     ▼
                          PRODUCT RESOLVER
                                     │
                              INK API/index
                                     │
                                     ▼
                           ACTUAL PRODUCT PREVIEW
                                     │
                           "VER NA LOJA / COMPRAR"
                                     │
                                     ▼
                    ┌────────────────────────────────┐
                    │ CURRENT COMMERCE DESTINATION   │
                    │                                │
                    │ now: regional INK stores       │
                    │ later: loja.useorigens.com.br  │
                    └────────────────┬───────────────┘
                                     │
                                     ▼
                              INK PDP / CART
                                     │
                                     ▼
                                 CHECKOUT
```

---

# 43. Instruction to Claude Code

Treat this document as the product and architecture baseline.

Start by auditing the repository, assets and actual INK API contract. Then install/load the recommended visual/frontend skills and build the project using the implementation order above.

Do not begin by producing a generic full-site scaffold.

The first implementation goal is a **beautiful, production-quality `/sul` vertical slice connected to a real city/product resolution flow**.

Before considering the first milestone complete, visually inspect the rendered application at mobile and desktop widths and refine it until it looks like a deliberate apparel-brand storefront rather than generated UI.

When a technical assumption conflicts with the real INK API or existing codebase, adapt the implementation while preserving the product principles in this document. Document any material deviation in `docs/decisions/` as an ADR or concise engineering decision record.

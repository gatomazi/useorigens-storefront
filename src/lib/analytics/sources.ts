/**
 * Single source of truth for every "where did this action happen" tag used across analytics providers
 * (Meta's `source_section` on `GoToInk`, GA4's `item_list_name`/`source` on `select_item`/`select_city`/
 * `select_state`) — CLAUDE_GA4_STOREFRONT_TRACKING.md §12: "Quero uma enum/lista central de origens. Não
 * espalhar strings arbitrárias."
 *
 * Values for the product-listing sections below are the EXACT strings already used as Meta's `sourceSection`
 * prop (established in the Meta Pixel round, already covered by tests and live in the codebase) — reused as-is
 * rather than renamed to the command's own suggested spellings (e.g. "home_da_nossa_terra"), per its own
 * instruction: "Reaproveitar o que já existe no Meta quando possível." Renaming them here would have created
 * two parallel naming schemes for the same concept.
 */
export const SOURCES = {
  // Search: which trigger opened the dialog (SearchDialog's own `variant` prop already distinguishes this).
  heroSearch: "hero_search",
  searchDialog: "search_dialog",
  /** The phone header's search field (the middle of the header, "Busque por lugar…"); it opens the search sheet. */
  headerSearchBar: "header_search_bar",
  /** The inline `<GlobalSearch>` embedded directly on a state page (not behind the `SearchDialog` modal) — a
   * third, real, distinct search entry point not in the command's own suggested list. */
  stateSearch: "state_search",
  /** A city page's "Busque outra cidade" field under the styles (it opens the search sheet). */
  citySearch: "city_search",
  /** "Encontre aqui a sua cidade" under the styles that show one example city (the home's "Sua cidade, de 8 jeitos"); it opens the search sheet. */
  homeStylesSearch: "home_styles_search",
  /** "Não achou a sua cidade? Encontre aqui" under a state page's "Escolha o estilo"; it opens the search sheet. */
  stateStylesSearch: "state_styles_search",

  // City selection, outside of search.
  stateMesoregion: "state_mesoregion",
  stateAZ: "state_az",
  /** A city page's own "Mais de {mesorregião}" neighbour links — not in the command's own suggested list, but
   * a real, distinct source this codebase already has (`TrackedCityLink` in `[city]/page.tsx`). */
  cityNeighbours: "city_neighbours",

  // State selection: header "Regiões" dropdown, footer "Estados" column, and the home's own `#estados`
  // chooser (`StateCards`) are all the same conceptual action (picking a state from a state-picker UI), so
  // they share this one source rather than getting three near-duplicate values.
  stateSelector: "state_selector",

  // Product listings (GoToInk / select_item) — identical to the existing Meta `sourceSection` values.
  homeTerra: "home_terra",
  homeRedesenhos: "home_redesenhos",
  homeFeitoParaVoce: "home_feito_para_voce",
  homeFala: "home_fala",
  homeDdd: "home_ddd",
  /** A home carousel created in the CMS from an INK collection (a closed, enumerated origin — never a free string from a document). */
  homeCollection: "home_colecao",
  /** The paged grid of a collection page (`/<region>/colecoes/<slug>`): every product of an INK collection, page by page. */
  collectionPage: "colecao_pagina",
  /** A card found by a collection page's own mini search ("Buscar nesta coleção"). */
  collectionSearch: "colecao_busca",
  /** A card chosen through a collection page's filters or sort (piece, state, city, style, price order) without a text search. */
  collectionFilter: "colecao_filtro",
  /** A home carousel of Uma Penca articles (canecas, ecobags) created in the CMS — fires GoToPenca / go_to_umapenca, never GoToInk. */
  homeUmaPenca: "home_umapenca",
  /** The home's "Sua cidade, de 8 jeitos" example-city cards that open the INK product directly. */
  homeStyles: "home_styles",
  /** The text search results page (`/<region>/busca`): a product card that opens the INK product. */
  search: "search_results",
  stateShowcase: "state_showcase",
  /** A state page's row of one collection cut down to the state ("Fala Daqui · Pará", collection-source.ts `stateCollectionRows`). */
  stateCollection: "state_colecao",
  /** "Escolha o estilo" on a state page: the state's city designs of one style (chips switch the style). */
  stateStyles: "state_styles",
  cityStyles: "city_styles",
  cityFala: "city_fala",
  cityLocalities: "city_localities",
  pdp: "pdp",
  pdpOtherStyles: "pdp_other_styles",
  /** The guided help on a design page ("Procurando sua cidade ou outra estampa?"): a product of a searched city, or of a chosen collection. */
  pdpGuideCity: "pdp_guia_cidade",
  pdpGuideCollection: "pdp_guia_colecao",
  /** The help chat ("Pergunte aqui", src/components/assistant): a design it suggested. */
  assistant: "assistente",
  /** "Comprar minha lista" on `/meus-lugares`: the click that opens the first product of a buy session. */
  meusLugares: "meus_lugares",
  /** `/<region>/outros-artigos`: an Uma Penca article (caneca, ecobag) — GA4 only, see `trackGoToUmaPenca`. */
  outrosArtigos: "outros_artigos",
  /** "Pódio": the home teaser ("Quem está no pódio?") and the full podium on a state page — `podio_click` (GA4 only, see trackPodioClick). */
  podioHome: "podio_home",
  podioState: "podio_state",
} as const;

export type TrackingSource = (typeof SOURCES)[keyof typeof SOURCES];

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
  /** The inline `<CitySearch>` embedded directly on a state page (not behind the `SearchDialog` modal) — a
   * third, real, distinct search entry point not in the command's own suggested list. */
  stateSearch: "state_search",

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
  stateShowcase: "state_showcase",
  cityStyles: "city_styles",
  cityFala: "city_fala",
  cityLocalities: "city_localities",
  pdp: "pdp",
  pdpOtherStyles: "pdp_other_styles",
} as const;

export type TrackingSource = (typeof SOURCES)[keyof typeof SOURCES];

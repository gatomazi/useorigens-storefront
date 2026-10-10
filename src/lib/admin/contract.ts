// Re-exports of the site-config contract for the admin, so admin code imports one module (and a future move of the contract stays a one-line change).
export { EDITORIAL_MODULE_KEYS, OVERLAY_PRESETS, COLOR_TOKENS, GRID_ASPECTS, GRID_COLUMNS, GRID_LABELS, MAX_GRID_TILES, MIN_GRID_TILES, type Appearance, type Color, type Destination, type Fill, type GridLayout, type GridTile, type Overlay, type Section, type Source } from "../site-config/schema";
export type { CommerceStoreKey } from "../geo/regions";

/** Opening "Quero minha cidade" as a window (src/components/city-finder/CityFinderDialog.tsx) from anywhere on the page, on one state. */
export const CITY_FINDER_EVENT = "origens:minha-cidade";
export type CityFinderOpen = { uf: string; opener: HTMLElement | null };

export function openCityFinder(uf: string, opener: HTMLElement | null): void {
  window.dispatchEvent(new CustomEvent<CityFinderOpen>(CITY_FINDER_EVENT, { detail: { uf, opener } }));
}

import type { Metadata } from "next";

type OpenGraph = NonNullable<Metadata["openGraph"]>;

/**
 * A page-level `openGraph` REPLACES the layout's (Next merges metadata shallowly), which used to drop `siteName` and `locale` on every page
 * that set its own. This keeps them, and adds the description and one representative image when there is a real one.
 */
export function pageOpenGraph(input: { title: string; description: string; path: string; imageUrl?: string | null }): OpenGraph {
  return {
    siteName: "Use Origens",
    locale: "pt_BR",
    type: "website",
    title: input.title,
    description: input.description,
    url: input.path,
    ...(input.imageUrl ? { images: [{ url: input.imageUrl }] } : {}),
  };
}

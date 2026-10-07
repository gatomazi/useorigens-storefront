import "server-only";
import { formatPrice } from "../format";
import type { SourceResult, UmaPencaLookup } from "../site-config/sources";
import { umaPencaHoverPhotos } from "./hover";
import { readUmaPencaSnapshot } from "./snapshot";
import type { ArticleKind, UmaPencaSnapshot } from "./types";

/**
 * The Uma Penca articles of the chosen kinds as carousel items (a home section with `source.kind === "umapenca"`), in feed order, at most
 * `limit`, with the article's hover photo when one was fetched. Each item carries `umaPenca` so its click fires GoToPenca / go_to_umapenca, never GoToInk. No snapshot yet is "unavailable"
 * (the section is hidden), never an invented product. `read` is only ever overridden by tests.
 */
export function umaPencaLookup(region: string, read: () => UmaPencaSnapshot | null = readUmaPencaSnapshot, hoverPhotos: () => Record<string, string> = umaPencaHoverPhotos): UmaPencaLookup {
  return (kinds: readonly ArticleKind[], limit: number): SourceResult => {
    const snapshot = read();
    if (!snapshot) return { status: "unavailable", reason: "umapenca-not-synced" };
    const hover = hoverPhotos();
    const items = snapshot.articles
      .filter((a) => kinds.includes(a.kind))
      .slice(0, limit)
      .map((a) => {
        const current = a.salePrice ?? a.price;
        return { id: a.id, name: a.title, price: formatPrice(current), rawPrice: current, imageUrl: a.imageUrl, ...(hover[a.id] ? { hoverImageUrl: hover[a.id] } : {}), href: a.url, umaPenca: { kind: a.kind, region } };
      });
    return { status: "ok", items };
  };
}

/**
 * Contract of "Seguir a Sul" (types + strict validator). Dependency-light on purpose, like `podio-schema.ts`: `schema.ts` imports it, so it must not
 * import anything that imports `schema.ts` back (no import cycle). The rules that apply it live in `follow.ts`.
 *
 * Norte and Centro-Oeste can FOLLOW Sul, part by part: a followed part is read from Sul's published document (adapted to the region) instead of the
 * region's own. The region's own content of that part stays stored, untouched and unused, so going back to "Própria" loses nothing.
 */
import type { Scope, ValidationResult } from "./schema";

/** Written in a text of a section or a page, it becomes the name of the region that shows it ("Sul", "Norte", "Centro-Oeste"). */
export const REGION_TOKEN = "{regiao}";

/** The region whose structure the others may follow. */
export const FOLLOW_SOURCE = "sul" as const;

/**
 *   home       the home (its sections and the home theme in use)
 *   menu       the header navigation and the collection menu (the storefront's and the one the Worker draws on the INK)
 *   statePage  the state page: its switches and its categories, subcategories and grids
 *   pages      Sul's pages are served in the region too; a page of the region with the same address wins over Sul's
 */
export const FOLLOW_PARTS = ["home", "menu", "statePage", "pages"] as const;
export type FollowPart = (typeof FOLLOW_PARTS)[number];

export const FOLLOW_PART_LABELS: Record<FollowPart, string> = { home: "Home", menu: "Menu", statePage: "Página do estado", pages: "Páginas" };

const isFollowPart = (v: unknown): v is FollowPart => typeof v === "string" && (FOLLOW_PARTS as readonly string[]).includes(v);

/** REGION other than Sul only. Each part at most once; absent (or empty) = every part is the region's own. */
export function validateFollow(input: unknown, scope: Scope, path = "follow"): ValidationResult<FollowPart[]> {
  if (scope === "global" || scope === FOLLOW_SOURCE) return { ok: false, errors: [`${path}: only a region other than ${FOLLOW_SOURCE} follows ${FOLLOW_SOURCE}`] };
  if (!Array.isArray(input)) return { ok: false, errors: [`${path}: must be an array`] };
  const errors: string[] = [];
  input.forEach((p, i) => { if (!isFollowPart(p)) errors.push(`${path}[${i}]: must be one of ${FOLLOW_PARTS.join(", ")}`); });
  if (new Set(input).size !== input.length) errors.push(`${path}: a part at most once`);
  return errors.length === 0 ? { ok: true, value: input as FollowPart[] } : { ok: false, errors };
}

/** Whether a document follows Sul in one part (the switch alone: whether it CAN, given the stores, is `follow.ts`). */
export const followsPart = (doc: { scope: Scope; follow?: readonly FollowPart[] } | null | undefined, part: FollowPart): boolean =>
  !!doc && doc.scope !== "global" && doc.scope !== FOLLOW_SOURCE && (doc.follow ?? []).includes(part);

/** The document's list with one part switched; the key goes away when nothing is followed. */
export function withFollowPart<T extends { follow?: FollowPart[] }>(doc: T, part: FollowPart, on: boolean): T {
  const rest = (doc.follow ?? []).filter((p) => p !== part);
  const list = FOLLOW_PARTS.filter((p) => (p === part ? on : rest.includes(p)));
  const next: T = { ...doc, follow: list };
  if (list.length === 0) delete next.follow;
  return next;
}

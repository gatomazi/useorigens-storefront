/**
 * The invite of the guided help ("Procurando sua cidade ou outra estampa?") can be dismissed; the dismissal is remembered in the browser for
 * 30 days, versioned, so a new version of the guide may show the invite again. Pure helpers around the stored value — the component owns the
 * `localStorage` access (which may be blocked: a private window, an in-app browser) and keeps working without it.
 *
 * Limits, by design: the memory lives in ONE browser on ONE device, for THIS domain. The same guide on the INK product page keeps its own
 * memory there (another domain); a visitor without an account is never recognised across devices or domains.
 */
export const GUIDE_VERSION = 1;
export const GUIDE_DISMISS_KEY = `origens:guia:v${GUIDE_VERSION}:dispensado`;
export const GUIDE_DISMISS_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** What is stored when the invite is dismissed. */
export function guideDismissValue(now: number): string {
  return JSON.stringify({ v: GUIDE_VERSION, at: now });
}

/** True while a stored dismissal is still valid: same version, less than 30 days old, well-formed. Anything else means "show the invite". */
export function guideDismissed(raw: string | null | undefined, now: number): boolean {
  if (!raw) return false;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return false;
    const { v, at } = parsed as { v?: unknown; at?: unknown };
    if (v !== GUIDE_VERSION || typeof at !== "number" || !Number.isFinite(at)) return false;
    return at <= now && now - at < GUIDE_DISMISS_DAYS * DAY_MS;
  } catch {
    return false;
  }
}

/** The INK product slug at the end of a verified purchase URL (`.../product/<slug>`): the guide's `product_slug` event parameter. Null otherwise. */
export function inkProductSlug(href: string | null | undefined): string | null {
  if (!href) return null;
  const m = /\/product\/([a-z0-9][a-z0-9_-]{0,127})\/?(?:[?#]|$)/i.exec(href);
  return m ? m[1].toLowerCase() : null;
}

/** `/<region>/<uf>/<slug>` (a locality result of the search) → the `cidade=<uf>/<slug>` query the guide API takes. Null for any other address. */
export function guideCityQuery(href: string, region: string): string | null {
  const m = /^\/([a-z-]+)\/([a-z]{2})\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(href);
  return m && m[1] === region ? `${m[2]}/${m[3]}` : null;
}

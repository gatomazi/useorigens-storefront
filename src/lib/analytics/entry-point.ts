/**
 * The visit's `entry_point`: where the FIRST click into the city search happened (the header's field, the hero, the "Sua cidade" journey opened
 * by the ads' link…). It is kept for the rest of the visit (sessionStorage) and sent on the funnel's own events (`select_city`, `select_item`,
 * `go_to_ink`), so a report by `entry_point` follows the visitor from the first click to the store. The first one wins: a later search never
 * overwrites it. Storage may be absent or throw (private window, blocked site data): then nothing is kept and the events go out without it.
 */
const KEY = "origens:entry_point";
const SAFE = /^[a-z0-9_]{1,40}$/;

export function rememberEntryPoint(value: string): void {
  if (!SAFE.test(value)) return;
  try {
    if (!window.sessionStorage.getItem(KEY)) window.sessionStorage.setItem(KEY, value);
  } catch {
    // No storage: the funnel simply loses the mark.
  }
}

export function visitEntryPoint(): string | null {
  try {
    const value = typeof window === "undefined" ? null : window.sessionStorage.getItem(KEY);
    return value && SAFE.test(value) ? value : null;
  } catch {
    return null;
  }
}

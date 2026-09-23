/**
 * Consent for optional analytics/marketing measurement (Meta + GA4, and any future tool) — one binary choice, not tied
 * to a single vendor. Stored client-side only (localStorage — no server round-trip, no cookie the server
 * reads). Versioned so a future change to what "accepted" covers can invalidate old decisions instead of
 * silently reusing them forever. Absence of a record (never decided, storage blocked, or an old/unknown
 * version) is always treated as "no decision" by every caller — never as consent.
 *
 * Exposed as a `useSyncExternalStore`-compatible external store (not `useState` + `useEffect`) — the
 * project's own lint rules flag calling `setState` synchronously inside a bare effect body, and this is
 * exactly the "subscribe to an external system" case that primitive exists for (the same pattern
 * `ProductCarousel.tsx` already uses for Embla's own state). A side benefit: consent changed in another tab
 * (the `storage` event) is picked up here too, not just changes made in this tab.
 */
// v2: the choice now covers every optional measurement tool (Meta + GA4), not only the Meta Pixel — v1 decisions
// were given under narrower copy, so they are treated as "no decision" and asked again.
export const CONSENT_VERSION = 2;
export type ConsentChoice = "accepted" | "rejected";
export type ConsentRecord = { choice: ConsentChoice; version: number; decidedAt: string };

const KEY = "useorigens:consent:marketing";

function isConsentChoice(value: unknown): value is ConsentChoice {
  return value === "accepted" || value === "rejected";
}

function parse(raw: string | null): ConsentRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ConsentRecord>;
    if (parsed.version !== CONSENT_VERSION || !isConsentChoice(parsed.choice) || typeof parsed.decidedAt !== "string") return null;
    return { choice: parsed.choice, version: parsed.version, decidedAt: parsed.decidedAt };
  } catch {
    return null;
  }
}

function readRaw(): ConsentRecord | null {
  try {
    return parse(window.localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

type Listener = () => void;
const listeners = new Set<Listener>();
/** `undefined` = not read yet this session; read lazily on first subscribe/getSnapshot, never during import. */
let cached: ConsentRecord | null | undefined;

function notify() {
  for (const listener of listeners) listener();
}

/** The `getSnapshot` for `useSyncExternalStore`. Stable by reference until `writeConsent`/`clearConsent`/a
 * `storage` event from another tab actually changes the value — required so React doesn't re-render forever. */
export function getConsentSnapshot(): ConsentRecord | null {
  if (cached === undefined) cached = readRaw();
  return cached;
}

/** The `getServerSnapshot` for `useSyncExternalStore` — the server (and the very first client render, before
 * hydration reconciles) always sees "no decision yet", never a guess. */
export function getServerConsentSnapshot(): ConsentRecord | null {
  return null;
}

function setAndPersist(record: ConsentRecord | null): void {
  cached = record;
  try {
    if (record) window.localStorage.setItem(KEY, JSON.stringify(record));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable (private mode, blocked) — `cached` still reflects the choice for this page's
    // lifetime via the in-memory value, it just won't survive a reload. A documented limitation.
  }
  notify();
}

/** True only for an explicit, current-version "accepted" decision — the single check every tracking call site and
 * provider loader shares, so revoking or rejecting stops new events everywhere at once. */
export function hasAnalyticsConsent(): boolean {
  if (typeof window === "undefined") return false;
  return getConsentSnapshot()?.choice === "accepted";
}

export function writeConsent(choice: ConsentChoice): void {
  setAndPersist({ choice, version: CONSENT_VERSION, decidedAt: new Date().toISOString() });
}

/** Used by "Preferências de privacidade" in the footer: forgets the decision so the banner reappears. */
export function clearConsent(): void {
  setAndPersist(null);
}

export function subscribeConsent(listener: Listener): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== KEY) return;
    cached = readRaw();
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

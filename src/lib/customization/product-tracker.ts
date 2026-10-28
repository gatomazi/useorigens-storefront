import type { ProductStatus, PublicProductJob } from "./product-status";

/**
 * The products a customer is waiting for, kept in this browser so the wait survives browsing the site (and a reload): the floating tracker reads it on
 * every page. Only what the waiting screen already shows (the job id, the art, the typed name, the state, the link once ready); nothing else, and it
 * goes away after a day or once the customer opens the product. Storage can be missing (private mode, blocked): then the tracker simply shows nothing.
 */
/** `page`: the personalization page the order came from (to go back to it when the team has to step in). */
export type TrackedProduct = { id: string; label: string; surname: string; status: ProductStatus; url: string | null; image: string | null; startedAt: number; page: string };

const KEY = "uo:produtos-em-criacao";
const EVENT = "uo:produtos-em-criacao";
const DAY = 24 * 60 * 60 * 1000;
const MAX = 6;

export function readTracked(now: number = Date.now()): TrackedProduct[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]") as TrackedProduct[];
    return Array.isArray(list) ? list.filter((p) => p && typeof p.id === "string" && now - p.startedAt < DAY) : [];
  } catch {
    return [];
  }
}

function write(list: TrackedProduct[]): void {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the tracker just stays hidden.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Adds (or refreshes) the jobs of an order, as the waiting screen received them. */
export function track(jobs: readonly PublicProductJob[], surname: string, now: number = Date.now()): void {
  const list = readTracked(now);
  for (const j of jobs) {
    const known = list.find((p) => p.id === j.id);
    const entry = { id: j.id, label: j.label, surname, status: j.status, url: j.url, image: j.image, startedAt: known?.startedAt ?? now, page: window.location.pathname };
    if (known) Object.assign(known, entry);
    else list.push(entry);
  }
  write(list);
}

/** The latest state of one job (from a poll). */
export function updateTracked(job: PublicProductJob): void {
  const list = readTracked();
  const known = list.find((p) => p.id === job.id);
  if (!known || (known.status === job.status && known.url === job.url && known.image === job.image)) return;
  Object.assign(known, { status: job.status, url: job.url, image: job.image });
  write(list);
}

export function untrack(id: string): void {
  write(readTracked().filter((p) => p.id !== id));
}

/** The stored list as text, for `useSyncExternalStore` (a string is a stable snapshot); "" when there is none or storage is blocked. */
export function trackedSnapshot(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

/** Calls `listener` when the list changes, in this tab (custom event) or another one (storage event). Returns the unsubscribe. */
export function onTrackedChange(listener: () => void): () => void {
  const storage = (e: StorageEvent) => { if (e.key === KEY) listener(); };
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", storage);
  return () => { window.removeEventListener(EVENT, listener); window.removeEventListener("storage", storage); };
}

import type { CommerceStoreKey } from "../geo/regions";
import { addFavorite, isFavorite } from "../favorites/store";
import { inkPhotoOrPlaceholder, type ProductStatus, type PublicProductJob } from "./product-status";

/**
 * The products a customer is waiting for, kept in this browser so the wait survives browsing the site (and a reload): the floating tracker reads it on
 * every page. Only what the waiting screen already shows (the job id, the art, the typed name, the state, the link once ready); nothing else, and it
 * goes away after a day or once the customer opens the product. Storage can be missing (private mode, blocked): then the tracker simply shows nothing.
 *
 * The INK store (loja.useorigens.com.br) is another origin and cannot read this storage, so the job ids also go into a cookie of the shared domain
 * (`uo_produtos`, ids joined by "."): the Worker in front of INK shows the same reminder there (worker-lojas, docs/produto-em-criacao.md). The cookie
 * is the shared truth of WHICH jobs are still followed: a job removed on the INK side ("Ver minha camiseta", "Tirar da lista") disappears here too.
 */
/** `page`: the personalization page the order came from (to go back to it when the team has to step in). */
export type TrackedProduct = { id: string; label: string; surname: string; status: ProductStatus; url: string | null; image: string | null; startedAt: number; page: string; inkProductId?: string | null; store?: CommerceStoreKey | null };

/**
 * A ready shirt also goes into "Minhas Estampas" (the saved estampas, src/lib/favorites/store.ts), so the customer finds it again after the
 * reminder is gone and can buy several with "Comprar minha lista". The page refreshes title, photo and link from the server.
 */
function remember(p: TrackedProduct): void {
  if (p.status !== "ready" || !p.url || !p.inkProductId || !p.store || isFavorite(p.inkProductId, p.store)) return;
  addFavorite({ inkProductId: p.inkProductId, commerceStoreKey: p.store, title: `${p.surname} · ${p.label}`, context: "Personalizada", imageUrl: inkPhotoOrPlaceholder(p.image), price: null });
}

const KEY = "uo:produtos-em-criacao";
const COOKIE = "uo_produtos";
const SHARED_DOMAIN = "useorigens.com.br";
const JOB_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const onSharedDomain = (): boolean => typeof location !== "undefined" && (location.hostname === SHARED_DOMAIN || location.hostname.endsWith(`.${SHARED_DOMAIN}`));

/** The ids in the shared cookie, or null where there is no shared cookie (a local server, another host). */
function cookieIds(): string[] | null {
  if (!onSharedDomain()) return null;
  const raw = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) ?? "";
  return raw.split(".").filter((id) => JOB_ID.test(id));
}

function writeCookie(ids: string[]): void {
  if (!onSharedDomain()) return;
  const value = ids.filter((id) => JOB_ID.test(id)).join(".");
  document.cookie = `${COOKIE}=${value}; Domain=.${SHARED_DOMAIN}; Path=/; Max-Age=${value ? 86_400 : 0}; SameSite=Lax; Secure`;
}
const EVENT = "uo:produtos-em-criacao";
const DAY = 24 * 60 * 60 * 1000;
const MAX = 6;

export function readTracked(now: number = Date.now()): TrackedProduct[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]") as TrackedProduct[];
    const shared = cookieIds();
    return Array.isArray(list) ? list.filter((p) => p && typeof p.id === "string" && now - p.startedAt < DAY && (!shared || shared.includes(p.id))) : [];
  } catch {
    return [];
  }
}

function write(list: TrackedProduct[]): void {
  writeCookie(list.slice(-MAX).map((p) => p.id));
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
    const entry = { id: j.id, label: j.label, surname, status: j.status, url: j.url, image: j.image, startedAt: known?.startedAt ?? now, page: window.location.pathname, inkProductId: j.inkProductId, store: j.store };
    if (known) Object.assign(known, entry);
    else list.push(entry);
    remember(entry);
  }
  write(list);
}

/** The latest state of one job (from a poll). */
export function updateTracked(job: PublicProductJob): void {
  const list = readTracked();
  const known = list.find((p) => p.id === job.id);
  if (!known || (known.status === job.status && known.url === job.url && known.image === job.image)) return;
  Object.assign(known, { status: job.status, url: job.url, image: job.image, inkProductId: job.inkProductId, store: job.store });
  remember(known);
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

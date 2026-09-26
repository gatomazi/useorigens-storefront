import "server-only";
import { composeBundle, inspectReleases, preflight, type PublishDeps } from "./publishing";
import { platform } from "./platform";
import type { ScopeDoc } from "../site-config/schema";

/** Thin bindings of the publishing functions to the platform selected for this process, for the screens. */
export const publishDeps = (actorId: string | null = null): PublishDeps => {
  const p = platform();
  return { releases: p.releases, files: p.files, media: (ids, purpose) => p.media.resolve(ids, purpose), actorId };
};
export const HISTORY_PAGE_SIZE = 10;
/** One page of the release history (newest first) with the totals, and the id of the release that is live right now (the ledger's head, never inferred from the list). */
export async function historyPage(page: number) {
  const { releases } = platform();
  const total = await releases.count();
  const pages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const [rows, head] = await Promise.all([releases.list(HISTORY_PAGE_SIZE, (current - 1) * HISTORY_PAGE_SIZE), releases.head()]);
  return { rows, total, pages, page: current, headId: head?.record.id ?? null };
}
/** The most recent releases, for callers that only need the newest few (e.g. "which one touched this region"). */
export const listHistory = () => platform().releases.list(200);
export const inspectPublishing = () => inspectReleases(publishDeps());
export const preflightDoc = (doc: ScopeDoc) => preflight(publishDeps(), doc);
export const composeForPreview = (doc: ScopeDoc) => composeBundle(publishDeps(), doc, "preview");

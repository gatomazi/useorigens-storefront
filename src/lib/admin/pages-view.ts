import "server-only";
import { PAGE_KIND_LABEL, pageHref } from "../site-config/pages";
import type { Page, ScopeDoc } from "../site-config/schema";
import type { ReleaseView } from "./store/ports";

export type PageState = "draft" | "published" | "changed" | "archived";
export const PAGE_STATE_LABEL: Record<PageState, string> = { draft: "Rascunho", published: "Publicada", changed: "Publicada, com alterações", archived: "Arquivada" };

/** Where a page stands: never published (draft), live and identical, live with unpublished edits, or archived (live state = archived). */
export function pageState(draft: Page, live: Page | undefined): PageState {
  if (!live) return draft.archived ? "archived" : "draft";
  if (live.archived) return "archived";
  const strip = (p: Page) => JSON.stringify({ ...p, version: 0 });
  return strip(draft) === strip(live) ? "published" : "changed";
}

export type PageRow = { page: Page; live: Page | undefined; state: PageState; href: string; kindLabel: string; lastPublishedAt: string | null };

/** The pages of a region joined with what is published and when each was last published (from the release markers). */
export function pageRows(draft: ScopeDoc, published: ScopeDoc, history: ReleaseView[]): PageRow[] {
  return (draft.pages ?? []).map((page) => {
    const live = published.pages?.find((p) => p.id === page.id);
    const marker = `page:${page.kind}/${live?.slug ?? page.slug}`;
    const last = history.find((r) => r.status === "live" && r.scopesChanged.includes(marker));
    return { page, live, state: pageState(page, live), href: pageHref(draft.scope as "sul", page), kindLabel: PAGE_KIND_LABEL[page.kind], lastPublishedAt: last?.promotedAt ?? null };
  });
}

/** Pages a button of this region may lead to, with whether each is live now (a link to a draft cannot be published). */
export function pageOptions(draft: ScopeDoc, published: ScopeDoc): { value: string; label: string; live: boolean }[] {
  return (draft.pages ?? []).filter((p) => !p.archived).map((p) => ({ value: `${p.kind}/${p.slug}`, label: `${PAGE_KIND_LABEL[p.kind]}: ${p.title}`, live: Boolean(published.pages?.some((x) => x.id === p.id && !x.archived)) }));
}

export type ModelState = "draft" | "published" | "changed" | "inactive";
export function modelState(draft: { active: boolean } & Record<string, unknown>, live: ({ active: boolean } & Record<string, unknown>) | undefined): ModelState {
  if (!live) return "draft";
  if (!live.active) return "inactive";
  return JSON.stringify({ ...draft, version: 0 }) === JSON.stringify({ ...live, version: 0 }) ? "published" : "changed";
}
export const MODEL_STATE_LABEL: Record<ModelState, string> = { draft: "Rascunho", published: "Publicado", changed: "Publicado, com alterações", inactive: "Publicado (desativado)" };

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CustomizerPageView } from "@/components/customization/CustomizerPageView";
import { headerActionsOf } from "@/lib/site-config/navigation-schema";
import { PreviewShell } from "@/components/admin/PreviewShell";
import { HomeSections } from "@/components/home/HomeSections";
import { categoryProps } from "@/lib/catalog/collection-source";
import { getCatalog } from "@/lib/catalog/repository";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { composeForPreview } from "@/lib/admin/ops";
import { withPreviewMedia } from "@/lib/admin/preview-media";
import { editingHomeTheme, loadWorkspace } from "@/lib/admin/workspace";
import { currentScope } from "@/lib/admin/scope";
import { getRegionHome } from "@/lib/home";
import { sanitizeBundle } from "@/lib/site-config/sanitize";
import { canFollowSul, seedFromEnv } from "@/lib/site-config/published";
import { withFollowing } from "@/lib/site-config/follow";
import { HOME_THEME_LABEL, withHomeTheme } from "@/lib/site-config/home-themes";
import { homeThemeCssVars, resolveTheme, themeCssVars } from "@/lib/site-config/navigation";
import { hasEditorialChrome, HOME_THEMES, homeThemeOf, type HomeThemeName } from "@/lib/site-config/schema";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pré-visualização · Use Origens", robots: { index: false, follow: false } };

/**
 * The home, rendered with the storefront's real components from the DRAFT (or, with ?source=published, from what is published in the
 * sandbox). It goes through the very same tolerant reader the storefront uses (`sanitizeBundle`), so what shows here is what the storefront
 * would show, including sections dropped for being invalid and the parts a region follows from Sul. Read-only: it writes nothing and fires no tracking.
 */
export default async function AdminPreview({ searchParams }: { searchParams: Promise<{ source?: string; page?: string; customizer?: string; tema?: string }> }) {
  const actor = await requireAdmin();
  const scope = await currentScope(actor);
  const { source, page: pageParam, customizer: customizerParam, tema } = await searchParams;
  const pageId = pageParam && /^[A-Za-z0-9_-]{1,40}$/.test(pageParam) ? pageParam : null;
  const customizerId = customizerParam && /^[A-Za-z0-9_-]{1,40}$/.test(customizerParam) ? customizerParam : null;
  const ws = await loadWorkspace(scope);
  const usingPublished = source === "published";
  // ?tema=original|editorial: the home with THAT theme (the one in use, or the one kept), without switching anything; none = the theme being edited.
  const theme = (HOME_THEMES as readonly string[]).includes(tema ?? "") ? (tema as HomeThemeName) : await editingHomeTheme(ws.doc);
  const source_ = usingPublished ? ws.baseDoc : ws.doc;
  // A theme asked for by name must exist; the one being edited may not be published yet (then the published home is shown).
  const doc = withHomeTheme(source_, theme) ?? (tema ? null : source_);
  if (!doc) notFound();
  const global = await loadWorkspace("global");
  const target = pageId ? ({ kind: "page", id: pageId } as const) : customizerId ? ({ kind: "customizer", id: customizerId } as const) : undefined;
  let raw;
  try {
    raw = await composeForPreview(doc, target);
  } catch {
    notFound();
  }
  const { bundle: sanitized } = sanitizeBundle(raw, seedFromEnv());
  // As the public reads it: a region that follows Sul shows Sul's published structure in the parts it follows (`follow.ts`).
  const bundle = sanitized ? withPreviewMedia(withFollowing(sanitized, canFollowSul)) : null;
  const catalog = getCatalog();
  const home = getRegionHome(scope);
  const effective = bundle ?? raw;
  const page = pageId ? effective.docs[scope].pages?.find((p) => p.id === pageId) : undefined;
  const model = customizerId ? effective.docs[scope].customizers?.find((m) => m.id === customizerId) : undefined;
  // The colours, the theme and the header of the document as the store shows it: following Sul's home in Natal brings Sul's Natal palette along.
  const shown = effective.docs[scope] ?? doc;
  const palette = resolveTheme(scope, shown, usingPublished ? global.baseDoc : global.doc);
  const cssVars = { ...themeCssVars(palette.configured, palette.effective), ...homeThemeCssVars(shown, palette.effective) };
  const label = `${usingPublished ? "Pré-visualização · publicado" : `Pré-visualização · rascunho${ws.record ? ` rev ${ws.record.rev}` : " (sem alterações)"}`} · tema ${HOME_THEME_LABEL[homeThemeOf(shown)]}`;
  return (
    <PreviewShell region={scope} cityCount={home.cityCount} syncedAt={catalog.syncedAt} label={label} cssVars={cssVars} onBrand={hasEditorialChrome(homeThemeOf(shown))} headerActions={headerActionsOf(shown.navigation)}>
      {customizerId ? (
        model ? <CustomizerPageView region={scope} model={model} bundle={effective} preview /> : <p className="wrap py-14">Este modelo tem um problema de configuração e não pode ser desenhado (corrija os avisos no editor).</p>
      ) : pageId ? (
        page ? <HomeSections region={scope} home={home} bundle={effective} page={page} {...categoryProps((store) => catalog.productsOfStore(store), effective.docs[scope])} /> : <p className="wrap py-14">Esta página tem um problema de configuração e não pode ser desenhada (corrija os avisos no editor).</p>
      ) : (
        <HomeSections region={scope} home={home} bundle={effective} {...categoryProps((store) => catalog.productsOfStore(store), effective.docs[scope])} />
      )}
    </PreviewShell>
  );
}

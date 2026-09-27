import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CustomizerPageView } from "@/components/customization/CustomizerPageView";
import { PreviewShell } from "@/components/admin/PreviewShell";
import { HomeSections } from "@/components/home/HomeSections";
import { categoryProps } from "@/lib/catalog/collection-source";
import { getCatalog } from "@/lib/catalog/repository";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { composeForPreview } from "@/lib/admin/ops";
import { withPreviewMedia } from "@/lib/admin/preview-media";
import { loadWorkspace } from "@/lib/admin/workspace";
import { currentScope } from "@/lib/admin/scope";
import { getRegionHome } from "@/lib/home";
import { sanitizeBundle } from "@/lib/site-config/sanitize";
import { seedFromEnv } from "@/lib/site-config/published";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pré-visualização · Use Origens", robots: { index: false, follow: false } };

/**
 * The home, rendered with the storefront's real components from the DRAFT (or, with ?source=published, from what is published in the
 * sandbox). It goes through the very same tolerant reader the storefront uses (`sanitizeBundle`), so what shows here is what the storefront
 * would show, including sections dropped for being invalid. Read-only: it writes nothing and fires no tracking.
 */
export default async function AdminPreview({ searchParams }: { searchParams: Promise<{ source?: string; page?: string; customizer?: string }> }) {
  const actor = await requireAdmin();
  const scope = await currentScope(actor);
  const { source, page: pageParam, customizer: customizerParam } = await searchParams;
  const pageId = pageParam && /^[A-Za-z0-9_-]{1,40}$/.test(pageParam) ? pageParam : null;
  const customizerId = customizerParam && /^[A-Za-z0-9_-]{1,40}$/.test(customizerParam) ? customizerParam : null;
  const ws = await loadWorkspace(scope);
  const usingPublished = source === "published";
  const doc = usingPublished ? ws.baseDoc : ws.doc;
  const target = pageId ? ({ kind: "page", id: pageId } as const) : customizerId ? ({ kind: "customizer", id: customizerId } as const) : undefined;
  let raw;
  try {
    raw = await composeForPreview(doc, target);
  } catch {
    notFound();
  }
  const { bundle: sanitized } = sanitizeBundle(raw, seedFromEnv());
  const bundle = sanitized ? withPreviewMedia(sanitized) : null;
  const catalog = getCatalog();
  const home = getRegionHome(scope);
  const effective = bundle ?? raw;
  const page = pageId ? effective.docs[scope].pages?.find((p) => p.id === pageId) : undefined;
  const model = customizerId ? effective.docs[scope].customizers?.find((m) => m.id === customizerId) : undefined;
  const label = usingPublished ? "Pré-visualização · publicado" : `Pré-visualização · rascunho${ws.record ? ` rev ${ws.record.rev}` : " (sem alterações)"}`;
  return (
    <PreviewShell region={scope} cityCount={home.cityCount} syncedAt={catalog.syncedAt} label={label}>
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

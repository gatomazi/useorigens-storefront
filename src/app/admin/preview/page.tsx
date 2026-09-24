import type { Metadata } from "next";
import { PreviewShell } from "@/components/admin/PreviewShell";
import { HomeSections } from "@/components/home/HomeSections";
import { categoryProps } from "@/lib/catalog/collection-source";
import { getCatalog } from "@/lib/catalog/repository";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { composeForPreview } from "@/lib/admin/ops";
import { loadWorkspace } from "@/lib/admin/workspace";
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
export default async function AdminPreview({ searchParams }: { searchParams: Promise<{ source?: string }> }) {
  await requireAdmin();
  const { source } = await searchParams;
  const ws = await loadWorkspace();
  const usingPublished = source === "published";
  const doc = usingPublished ? ws.baseDoc : ws.doc;
  const raw = await composeForPreview(doc);
  const { bundle } = sanitizeBundle(raw, seedFromEnv());
  const catalog = getCatalog();
  const home = getRegionHome("sul");
  return (
    <PreviewShell region="sul" cityCount={home.cityCount} syncedAt={catalog.syncedAt} label={usingPublished ? "Pré-visualização · publicado" : `Pré-visualização · rascunho${ws.record ? ` rev ${ws.record.rev}` : " (sem alterações)"}`}>
      <HomeSections region="sul" home={home} bundle={bundle ?? raw} {...categoryProps((store) => catalog.productsOfStore(store), (bundle ?? raw).docs.sul)} />
    </PreviewShell>
  );
}

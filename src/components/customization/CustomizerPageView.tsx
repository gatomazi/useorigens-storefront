import { loadArtworkBaseAction, submitCustomizationAction } from "@/app/[region]/personalizar/actions";
import { loadPreviewArtworkBaseAction } from "@/app/admin/preview/actions";
import { CustomizerForm, type PublicMockup } from "@/components/customization/CustomizerForm";
import { requestStoreOrNull } from "@/lib/customization/server";
import type { RegionSlug } from "@/lib/geo/regions";
import { customizerProductLabel, type Customizer, type PublishedBundle } from "@/lib/site-config/schema";
import { loadArtworkBase } from "@/lib/customization/artwork-server";

/** The public personalization page of one model (also used, with `preview`, by the admin). Reads the mockup from the media table. It never links to a checkout or to a product: buying happens after the team makes the print and tells the customer. */
export async function CustomizerPageView({ region, model, bundle, preview = false }: { region: RegionSlug; model: Customizer; bundle: PublishedBundle; preview?: boolean }) {
  // Only the first art ships with the page; the customer's other picks are fetched on demand (each base carries the full-size art).
  const firstId = model.studioArts?.[0]?.versions[0]?.templateId;
  const firstBase = firstId ? await loadArtworkBase(firstId).catch(() => null) : null;
  if (firstId && !firstBase) return <div className="wrap py-14"><p className="t-body">Esta base de personalização está indisponível no momento. Tente novamente mais tarde.</p></div>;
  const ref = model.pageMockup;
  const info = ref ? bundle.media[ref.assetId] : undefined;
  if (!ref || !info) {
    return <div className="wrap py-14"><p className="t-body">Este modelo ainda não tem a imagem da página.</p></div>;
  }
  const mockup: PublicMockup = { src: info.src, width: info.width, height: info.height, ...(info.variants ? { variants: info.variants } : {}), alt: ref.decorative ? "" : ref.alt || `${customizerProductLabel(model.source)} ${model.name}` };
  return (
    <CustomizerForm region={region} model={model} mockup={mockup} {...(firstBase ? { firstBase, loadBase: preview ? loadPreviewArtworkBaseAction : loadArtworkBaseAction, thumbs: preview ? "/admin/estampas/miniatura/{id}" : `/api/personalizar/${region}/${model.slug}/miniatura/{id}` } : {})} submit={submitCustomizationAction} available={requestStoreOrNull() !== null} preview={preview} />
  );
}

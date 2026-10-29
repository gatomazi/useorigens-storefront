import { loadArtworkBaseAction, startProductsAction, submitCustomizationAction } from "@/app/[region]/personalizar/actions";
import { loadPreviewArtworkBaseAction } from "@/app/admin/preview/actions";
import { CustomizerForm, type PublicMockup } from "@/components/customization/CustomizerForm";
import { requestStoreOrNull } from "@/lib/customization/server";
import type { RegionSlug } from "@/lib/geo/regions";
import { customizerProductLabel, type Customizer, type PublishedBundle } from "@/lib/site-config/schema";
import { loadArtworkBase } from "@/lib/customization/artwork-server";
import { inkProductClientFor, productStoreOrNull } from "@/lib/customization/products-server";
import { personalizationCards, personalizationHubHref } from "@/lib/customization/hub";

/**
 * The public personalization page of one model (also used, with `preview`, by the admin). Reads the mockup from the media table. Normally it never links
 * to a checkout or a product: buying happens after the team makes the print and tells the customer. With direct purchase on (and INK reachable from
 * here), the page creates the product at INK and takes the customer to it instead; the preview shows that page but never creates anything.
 */
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
  const direct = Boolean(model.directPurchase?.enabled && productStoreOrNull() && inkProductClientFor(region));
  // Back to every personalized print, once there are others to see.
  const others = personalizationCards(bundle.docs[region], bundle.media, region).length > 1;
  return (
    <>
    {others && <nav aria-label="Estampas personalizáveis" className="wrap pt-5 lg:pt-8"><a href={personalizationHubHref(region)} className="link-line t-small font-semibold">← Todas as estampas personalizáveis</a></nav>}
    <CustomizerForm region={region} model={model} mockup={mockup} {...(firstBase ? { firstBase, loadBase: preview ? loadPreviewArtworkBaseAction : loadArtworkBaseAction, thumbs: preview ? "/admin/estampas/miniatura/{id}" : `/api/personalizar/${region}/${model.slug}/miniatura/{id}` } : {})} submit={submitCustomizationAction} available={requestStoreOrNull() !== null} preview={preview} direct={direct} {...(direct && !preview ? { startProducts: startProductsAction } : {})} />
    </>
  );
}

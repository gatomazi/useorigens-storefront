import { submitCustomizationAction } from "@/app/[region]/personalizar/actions";
import { CustomizerForm, type PublicMockup } from "@/components/customization/CustomizerForm";
import { purchaseUrl } from "@/lib/catalog/commerce";
import { getCatalog } from "@/lib/catalog/repository";
import { handoffMode } from "@/lib/customization/requests";
import { requestStoreOrNull } from "@/lib/customization/server";
import { REGIONS, type RegionSlug } from "@/lib/geo/regions";
import type { Customizer, PublishedBundle } from "@/lib/site-config/schema";

/** The public personalization page of one model (also used, with `preview`, by the admin). Reads the mockup from the media table and the exact INK product from the local snapshot. */
export function CustomizerPageView({ region, model, bundle, preview = false }: { region: RegionSlug; model: Customizer; bundle: PublishedBundle; preview?: boolean }) {
  const ref = model.pageMockup;
  const info = ref ? bundle.media[ref.assetId] : undefined;
  if (!ref || !info) {
    return <div className="wrap py-14"><p className="t-body">Este modelo ainda não tem a imagem da página.</p></div>;
  }
  const mockup: PublicMockup = { src: info.src, width: info.width, height: info.height, ...(info.variants ? { variants: info.variants } : {}), alt: ref.decorative ? "" : ref.alt || `Camiseta ${model.name}` };
  // A separate, clearly-labelled link to the exact INK product: only when one was chosen AND it exists in this store's snapshot AND the handoff mode allows it.
  let inkProductHref: string | null = null;
  if (model.inkProductId && handoffMode() === "manual" && model.source.store === REGIONS[region].storeKey) {
    const products = getCatalog().productsOfStore(model.source.store);
    const product = products.merch.get(model.inkProductId) ?? products.cityDesigns.get(model.inkProductId);
    inkProductHref = product ? purchaseUrl(product) : null;
  }
  return (
    <CustomizerForm region={region} regionName={REGIONS[region].name} model={model} mockup={mockup} submit={submitCustomizationAction} available={requestStoreOrNull() !== null} inkProductHref={inkProductHref} preview={preview} />
  );
}

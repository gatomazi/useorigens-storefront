import { submitCustomizationAction } from "@/app/[region]/personalizar/actions";
import { CustomizerForm, type PublicMockup } from "@/components/customization/CustomizerForm";
import { requestStoreOrNull } from "@/lib/customization/server";
import type { RegionSlug } from "@/lib/geo/regions";
import type { Customizer, PublishedBundle } from "@/lib/site-config/schema";

/** The public personalization page of one model (also used, with `preview`, by the admin). Reads the mockup from the media table. It never links to a checkout or to a product: buying happens after the team makes the print and tells the customer. */
export function CustomizerPageView({ region, model, bundle, preview = false }: { region: RegionSlug; model: Customizer; bundle: PublishedBundle; preview?: boolean }) {
  const ref = model.pageMockup;
  const info = ref ? bundle.media[ref.assetId] : undefined;
  if (!ref || !info) {
    return <div className="wrap py-14"><p className="t-body">Este modelo ainda não tem a imagem da página.</p></div>;
  }
  const mockup: PublicMockup = { src: info.src, width: info.width, height: info.height, ...(info.variants ? { variants: info.variants } : {}), alt: ref.decorative ? "" : ref.alt || `Camiseta ${model.name}` };
  return (
    <CustomizerForm region={region} model={model} mockup={mockup} submit={submitCustomizationAction} available={requestStoreOrNull() !== null} preview={preview} />
  );
}

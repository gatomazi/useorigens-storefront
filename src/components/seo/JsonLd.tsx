import { serializeJsonLd } from "@/lib/seo/jsonld";

/** Server component: structured data is part of the initial HTML, never injected by client JavaScript. Values are escaped by `serializeJsonLd`. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}

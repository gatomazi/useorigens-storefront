import { serveTrocaFoto, trocaFotosConfig } from "@/lib/media/troca-fotos";

export const dynamic = "force-dynamic";

/** Photos for INK exchanges (see src/lib/media/troca-fotos.ts). The bucket is private; only `trocas/<32 hex>.<jpg|png|webp>` is ever returned. */
export async function GET(_request: Request, { params }: { params: Promise<{ arquivo: string }> }) {
  return serveTrocaFoto({ file: (await params).arquivo, config: trocaFotosConfig() });
}

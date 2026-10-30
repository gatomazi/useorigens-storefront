import type { InkProductClient } from "./ink-product-client";
import type { ProductJob, ProductJobStore } from "./ink-products";

/**
 * Um produto reaproveitado (mesmo nome na mesma arte) pode ter sido criado com outro preço ou outra promoção. A chave de deduplicação não leva o
 * preço (de propósito: o mesmo nome continua sendo UM produto na INK, que não apaga produtos), então o preço de agora é aplicado aqui:
 * - já na INK: PATCH do `price` e do `promotional_price` (null tira a promoção). Não sabemos o que a INK tem, então o PATCH vai sempre;
 * - ainda não na INK (fila ou falha): o job passa a ter o preço de agora, e o worker lê a promoção no momento da criação.
 * Uma falha da INK aqui não impede o cliente de seguir: o produto continua o mesmo, e o próximo reaproveitamento tenta de novo.
 */
export async function syncReusedPrice(store: ProductJobStore, client: Pick<InkProductClient, "updateProduct">, job: ProductJob, now: { price: string; promotionalPrice: string | null }): Promise<ProductJob> {
  if (job.inkProductId) {
    try {
      await client.updateProduct(job.inkProductId, { price: now.price, promotional_price: now.promotionalPrice });
    } catch {
      return job;
    }
    return job.price === now.price ? job : ((await store.update(job.id, { price: now.price })) ?? job);
  }
  if (job.price === now.price) return job;
  return (await store.update(job.id, { price: now.price }, { onlyIf: ["queued", "failed"] })) ?? job;
}

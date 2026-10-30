import type { DirectPurchase, StudioGarment } from "../site-config/schema";

/** Brasília não tem horário de verão desde 2019: America/Sao_Paulo é sempre UTC−3. */
const SAO_PAULO = "-03:00";

/** O instante de uma data do painel ("2026-11-01T00:00", hora de Brasília); NaN quando não é uma data. */
export const promoInstant = (local: string): number => Date.parse(`${local}:00${SAO_PAULO}`);

/** Se agora está na janela da promoção: início incluso, fim excluso; sem início já vale, sem fim não acaba. */
export function promoWindowOpen(d: Pick<DirectPurchase, "promoStartsAt" | "promoEndsAt">, now: Date): boolean {
  const t = now.getTime();
  if (d.promoStartsAt && !(t >= promoInstant(d.promoStartsAt))) return false;
  if (d.promoEndsAt && !(t < promoInstant(d.promoEndsAt))) return false;
  return true;
}

/**
 * O preço de uma peça agora, como a INK recebe: o normal e o promocional (null fora da janela ou sem promoção para a peça). null quando a peça não
 * tem preço (Camiseta Infantil sem `kidsPrice`). Um promocional que não fique abaixo do normal é ignorado: a INK nunca recebe um "desconto" maior.
 */
export function directPrices(d: DirectPurchase, garment: StudioGarment, now: Date): { price: string; promotionalPrice: string | null } | null {
  const price = garment === "infantil" ? d.kidsPrice : d.price;
  if (!price) return null;
  const promo = garment === "infantil" ? d.kidsPromoPrice : d.promoPrice;
  const promotionalPrice = promo && Number(promo) < Number(price) && promoWindowOpen(d, now) ? promo : null;
  return { price, promotionalPrice };
}

/** "109.90" → "R$ 109,90". */
export const brl = (price: string): string => `R$ ${price.replace(".", ",")}`;

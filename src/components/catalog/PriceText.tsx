/**
 * A price as INK sells it now. During a promotion INK's regular price comes first, struck through, then the price that is charged ("De R$ 109,90
 * por R$ 89,90" for a screen reader), the order INK's own product page uses. Both are INK's values, formatted; nothing is computed here. Renders
 * inline content only, so each card keeps its own type size and weight around it.
 */
export function PriceText({ price, listPrice, listClassName = "mr-1.5 text-[0.85em] font-normal opacity-70" }: { price: string; listPrice?: string | null; listClassName?: string }) {
  if (!listPrice) return <>{price}</>;
  return (
    <>
      <s aria-hidden="true" className={listClassName}>
        {listPrice}
      </s>
      <span className="sr-only">De {listPrice} por </span>
      {price}
    </>
  );
}

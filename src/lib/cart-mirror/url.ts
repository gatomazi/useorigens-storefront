import { ARRIVAL_PRODUCT_PARAM, ARRIVAL_SRC_PARAM } from "../analytics/origens-events";
import { CART_REF_PARAM, CART_REF_PATTERN } from "./constants";

export type CartRefExtraction = {
  /** A well-formed token, or null (absent or malformed). */
  token: string | null;
  /** The parameter was present at all, so it must be removed from the address bar either way. */
  present: boolean;
  /** Same query without `cart_ref`, every other parameter preserved in order (with leading "?" or ""). */
  search: string;
};

export function extractCartRef(search: string): CartRefExtraction {
  const params = new URLSearchParams(search);
  const values = params.getAll(CART_REF_PARAM);
  const token = values.find((value) => CART_REF_PATTERN.test(value)) ?? null;
  params.delete(CART_REF_PARAM);
  const rest = params.toString();
  return { token, present: values.length > 0, search: rest ? `?${rest}` : "" };
}

/** Query string for analytics: whatever the URL carries, never the cart token nor our one-time arrival markers. */
export function withoutCartRef(query: string): string {
  const params = new URLSearchParams(query);
  params.delete(CART_REF_PARAM);
  params.delete(ARRIVAL_SRC_PARAM);
  params.delete(ARRIVAL_PRODUCT_PARAM);
  return params.toString();
}

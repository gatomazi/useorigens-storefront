import "server-only";
import { cardButtonOf, type CardBuy } from "./cards-schema";
import { homeBundle, siteConfigHomeEnabled } from "./flag";

/** The store-wide buy button for the pages that are not drawn from a document (city, state, search…): the published configuration, only with the CMS on. */
export function storeCardButton(): CardBuy | undefined {
  return siteConfigHomeEnabled() ? cardButtonOf(homeBundle()) : undefined;
}

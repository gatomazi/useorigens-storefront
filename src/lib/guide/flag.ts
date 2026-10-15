/**
 * The switch of the guided help on the storefront's design page (`/<região>/<uf>/<cidade>/<família>`). On unless `PDP_GUIDE=off` is set:
 * the rollback is that one variable plus a deploy (the page is ISR, so a running deployment keeps the HTML it already cached for up to an
 * hour). Read on the server only — the client never decides whether the guide exists. The guide on the INK product page has its own switch,
 * per store, in the Worker (`WIDGET_FEATURES` … `pdp-guide`).
 */
export function pdpGuideEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env.PDP_GUIDE ?? "on").trim().toLowerCase() !== "off";
}

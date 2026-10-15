/**
 * Hosts of the INK stores a link may point to. Plain constants (no `server-only`): the browser needs them too, to know which links get the
 * visit's campaign (src/lib/analytics/campaign.ts). `ALLOWED_COMMERCE_HOSTS` (src/lib/ink/config.ts) is built from this list.
 */
export const INK_COMMERCE_HOSTS: readonly string[] = ["www.usesul.com.br", "www.usenorte.com.br", "www.usecentro.com.br", "loja.useorigens.com.br"];

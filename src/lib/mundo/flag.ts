import "server-only";

/**
 * Visibility of "Meu Pequeno Mundo", read at render time from the runtime env (never inlined at build), the same pattern as
 * SITE_CONFIG_HOME (src/lib/site-config/flag.ts). Production stays exactly as before until someone deliberately turns it on.
 *
 *   MEU_PEQUENO_MUNDO unset / anything else → "off":    no page (404), no data routes, no entry anywhere in the store.
 *   MEU_PEQUENO_MUNDO=pagina                 → "pagina": the page and its data answer (shared worlds open), but the store shows no entry.
 *   MEU_PEQUENO_MUNDO=on                     → "on":     page + the three entries (home block, city invite, footer link).
 *
 * Rollback is one env change and a new container (Railway deploys one when a variable changes): "pagina" hides the entries and keeps
 * shared links working; "off" hides everything. The store pages are ISR (1 h, none prebuilt), so a page already cached in a running
 * container keeps its entries until it revalidates — docs/mundo/ativacao.md.
 */
export type ModoMundo = "off" | "pagina" | "on";

export function modoMundo(): ModoMundo {
  const v = process.env.MEU_PEQUENO_MUNDO;
  return v === "on" ? "on" : v === "pagina" ? "pagina" : "off";
}

/** The page /meu-pequeno-mundo and its /api/mundo data respond. */
export const mundoPaginaAtiva = (): boolean => modoMundo() !== "off";

/** The store links to it (home block, city invite, footer). */
export const mundoEntradasAtivas = (): boolean => modoMundo() === "on";

export const MUNDO_CAMINHO = "/meu-pequeno-mundo";

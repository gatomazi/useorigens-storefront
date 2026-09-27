/**
 * Appends the buy-session id to the first product's URL before navigating there from "Comprar minha lista".
 * This is the ONLY hop where the storefront controls the URL — the Worker's list-watch.js only ever learns
 * about the session from `?ls=` on a page load (or from what it already carried over in sessionStorage from a
 * PREVIOUS page), so skipping this means "Sua próxima camiseta" never appears for anyone, on any session.
 */
export function withListSession(url: string, sessionId: string): string {
  const withToken = new URL(url);
  withToken.searchParams.set("ls", sessionId);
  return withToken.href;
}

/**
 * Real store collection URLs ("Ver todos" destinations), verified by fetching the live page and checking its
 * own heading and product listing — never guessed. See CLAUDE_HOME_LENDA_ORDER_VIEW_ALL.md and the verification
 * notes below. Sul only: Norte and Centro-Oeste have their own stores, not checked (out of scope).
 *
 * Verified 2026-09-21 against usesul.com.br:
 * - "Feito Para Você": page heading "Feito Para Você"; all 21 products listed are the real "<Quem> <Estado> <Traço> | Lenda"
 *   line — exactly what editorial/lenda.ts curates from. 21/21 match.
 * - "Da Nossa Terra": page heading "Da Nossa Terra"; lists the state Clean/Essência/Atlas do Sul/Escritas lines
 *   editorial/terra.ts curates from, plus more (a bigger real set than the home's 6-item preview — expected,
 *   the home shows a selection, the collection is the full catalog).
 * - "Redesenhos do Sul" → real collection "Do Nosso Jeito": 5 of the 6 curated recreations confirmed present
 *   across its first two pages (Vida no Sul — Litoral Edition, Retrato Gaúcho, Pinhões N' Roses, The Manefather,
 *   Jurassic Quero-Quero); "Truco de Galpão" not found in the pages checked, not confirmed either way.
 * - "Fala daqui": page heading "Fala Daqui"; mixes Dizeres/expression products AND the DDD-coded products in one
 *   collection. There is no separate real DDD collection on the live store — DDD lives inside this one. So DDD's
 *   own "Ver todos" is deliberately NOT set (see home page.tsx): pointing it here too would duplicate this
 *   section's own link to the same URL, and there is no distinct destination to give it instead.
 */
export const REAL_COLLECTIONS = {
  terra: "https://www.usesul.com.br/usesul/collections/da-nossa-terra",
  feitoParaVoce: "https://www.usesul.com.br/usesul/collections/feito-para-voce",
  redesenhos: "https://www.usesul.com.br/usesul/collections/do-nosso-jeito",
  fala: "https://www.usesul.com.br/usesul/collections/fala-daqui",
} as const;

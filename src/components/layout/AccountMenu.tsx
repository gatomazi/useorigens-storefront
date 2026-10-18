import type { CommerceStoreKey } from "@/lib/geo/regions";
import { STORE_PRODUCT_URL_BASE } from "@/lib/ink/config";
import { HeaderDropdown } from "./HeaderDropdown";

/**
 * The account of the store where the purchase is finished, from the header: the same entries as the INK store's own account menu. The storefront
 * cannot know whether the visitor is signed in there (the session is a cookie of the store's host), and it does not need to: "Meus pedidos" opens
 * the orders page, which the store sends to its sign-in when nobody is signed in. Plain links to the store; the region and the campaign go along
 * on the click (CampaignCarry), as on every link to the store.
 */
export const accountLinks = (store: CommerceStoreKey): { label: string; href: string; sign?: true }[] => {
  const root = STORE_PRODUCT_URL_BASE[store]?.replace(/\/product$/, "");
  if (!root) return [];
  return [
    { label: "Meus pedidos", href: `${root}/orders` },
    { label: "Rastrear meu pedido", href: `${root}/orders/trackings` },
    { label: "Trocar meu pedido", href: `${root}/orders` },
    { label: "Avaliar meu pedido", href: `${root}/orders/guest_reviews/new` },
    { label: "Entrar | Cadastrar", href: `${root}/store_sessions/new`, sign: true },
  ];
};

function PersonIcon({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </svg>
  );
}

/** From 640px; on phones the same links are the menu's "Sua conta" block (MobileMenu), the header has no room for a fourth icon. */
export function AccountMenu({ store, labelled = true }: { store: CommerceStoreKey; /** The word next to the icon (the menu's "Ícones do topo"). */ labelled?: boolean }) {
  const links = accountLinks(store);
  if (links.length === 0) return null;
  return (
    <HeaderDropdown className="relative hidden sm:block">
      <summary className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center gap-2 px-3 font-semibold [&::-webkit-details-marker]:hidden" data-testid="account-trigger" title={labelled ? undefined : "Conta"}>
        <PersonIcon className="h-5 w-5" />
        <span className={labelled ? undefined : "sr-only"}>Conta</span>
      </summary>
      {/* Its own white surface: reset the text colour, the header above it is on a coloured background. */}
      <ul className="absolute right-0 top-full z-50 mt-1 w-64 border-2 border-ink bg-white py-1 text-ink" data-testid="account-menu">
        {links.map((l) => (
          <li key={l.label} className={l.sign ? "mt-1 border-t border-line pt-1" : undefined}>
            <a href={l.href} className="flex min-h-11 items-center gap-2 px-4 text-[0.9375rem] font-semibold hover:bg-ink hover:text-white">
              {l.sign && (
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 17l5-5-5-5M15 12H3M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
                </svg>
              )}
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </HeaderDropdown>
  );
}

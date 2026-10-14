import { Bodoni_Moda } from "next/font/google";
import { ConsentProvider } from "@/lib/consent/ConsentProvider";

// The memories ("O que esse lugar significa para você?") are set in Bodoni Moda italic, in the page and in the exported PNG. The root layout
// only loads the upright 500, so this route loads both styles under its own variable (mundo.css reads it as --font-mpm-serif).
const serifMundo = Bodoni_Moda({ subsets: ["latin"], weight: ["500"], style: ["normal", "italic"], variable: "--font-mpm-serif", display: "swap" });

/**
 * "Meu Pequeno Mundo" has its own compact chrome (store mark + "Voltar à loja" inside the experience) instead of the region layout's
 * header, announcement bar and footer: on a phone, every pixel above the panel is the model's. Consent works exactly as in the store.
 * Only GA4 is loaded here (path only, see page.tsx); Meta Pixel and Clarity capture full URLs and are left out of this route.
 */
export default function MundoLayout({ children }: { children: React.ReactNode }) {
  return (
    <ConsentProvider>
      <div className={serifMundo.variable}>{children}</div>
    </ConsentProvider>
  );
}

import type { Metadata, Viewport } from "next";
import { Big_Shoulders, Bodoni_Moda, Hanken_Grotesk } from "next/font/google";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

// One variable file per family, Latin only (Portuguese accents are in it): fewer requests before the
// headline can paint. Big Shoulders is variable, so 700/800/900 all come from the same file.
const display = Big_Shoulders({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  adjustFontFallback: false,
});

const body = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const serif = Bodoni_Moda({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Use Origens", template: "%s | Use Origens" },
  description: "Camisetas com o nome, o mapa e as coordenadas da sua cidade.",
  openGraph: { siteName: "Use Origens", locale: "pt_BR", type: "website" },
};

export const viewport: Viewport = { themeColor: "#e5e5e5", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable} ${serif.variable}`}>
      <body>
        <a href="#conteudo" className="skip-link">
          Ir para o conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}

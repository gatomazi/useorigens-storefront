import type { NextConfig } from "next";
import { UMAPENCA_IMAGE_HOSTS } from "./src/lib/umapenca/hosts";

const nextConfig: NextConfig = {
  experimental: {
    // Server Actions are capped at 1 MB by default, which rejected every CMS image upload ("Body exceeded 1 MB limit"). Uploads are validated
    // at 8 MB (src/lib/admin/media/process.ts); the extra room is the multipart overhead. Only the admin has Server Actions.
    serverActions: { bodySizeLimit: "9mb" },
  },
  images: {
    // Only INK's product image host is allowed (seen in every product of the three stores).
    remotePatterns: [
      { protocol: "https", hostname: "gcp-images.majestic.ink.rsvcloud.com", pathname: "/images/product_v2/**" },
      // The cart mirror ("Meu carrinho") shows INK cart thumbnails, which live under product_art. Nothing broader is opened.
      { protocol: "https", hostname: "gcp-images.majestic.ink.rsvcloud.com", pathname: "/images/product_art/**" },
      // "Guia de medidas": INK's own official size-table images, the same ones its "Confira suas medidas" modal shows (src/lib/catalog/size-guides.ts).
      { protocol: "https", hostname: "gcp-images.majestic.ink.rsvcloud.com", pathname: "/images/size_table/**" },
      // "Outros artigos" (canecas, ecobags) come from the Uma Penca feed; their photos are on its imgix hosts (src/lib/umapenca/hosts.ts).
      ...UMAPENCA_IMAGE_HOSTS.map((hostname) => ({ protocol: "https" as const, hostname, pathname: "/**" })),
    ],
    qualities: [70, 80],
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;

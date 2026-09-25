import type { NextConfig } from "next";

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
    ],
    qualities: [70, 80],
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;

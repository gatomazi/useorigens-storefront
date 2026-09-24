import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

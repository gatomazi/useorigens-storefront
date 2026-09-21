import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Only INK's product image host is allowed (seen in every product of the three stores).
    remotePatterns: [
      { protocol: "https", hostname: "gcp-images.majestic.ink.rsvcloud.com", pathname: "/images/product_v2/**" },
    ],
    qualities: [70, 80],
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;

import { describe, expect, test } from "vitest";
import { hasRemoteMatch } from "next/dist/shared/lib/match-remote-pattern";
import nextConfig from "../../next.config";
import { inkPhotoOrPlaceholder, isProvisionalInkPhoto, PERSONALIZED_PLACEHOLDER } from "@/lib/customization/product-status";
import { MAX_UPLOAD_BYTES } from "@/lib/admin/media/process";

const bytes = (v: number | string | undefined): number => (typeof v === "number" ? v : v ? Number.parseFloat(v) * ({ kb: 1024, mb: 1024 ** 2 } as Record<string, number>)[v.replace(/[\d.\s]/g, "").toLowerCase()] : 0);

describe("Server Actions body limit", () => {
  test("given the CMS accepts uploads up to MAX_UPLOAD_BYTES, when the config is read, then Server Actions accept that plus multipart overhead (the 1 MB default rejected real uploads)", () => {
    const limit = bytes(nextConfig.experimental?.serverActions?.bodySizeLimit as string | number | undefined);
    expect(limit).toBeGreaterThanOrEqual(MAX_UPLOAD_BYTES + 20 * 1024);
  });
});

describe("photos of personalized shirts", () => {
  const loads = (u: string) => hasRemoteMatch([], nextConfig.images?.remotePatterns ?? [], new URL(u));
  const INK = "https://gcp-images.majestic.ink.rsvcloud.com";

  test("given INK's provisional photo (/cache/) and the final one, when shown with next/image, then both load (the provisional one was a broken picture in Minhas Estampas on 28/10)", () => {
    for (const u of [`${INK}/cache/37c62f993540c41a744e9ec6d6701244.jpg`, `${INK}/images/product_v2/main_image/9a9c09251845946a34447b73b50e3a40.jpg`]) {
      expect(inkPhotoOrPlaceholder(u)).toBe(u);
      expect(loads(u)).toBe(true);
    }
    expect(isProvisionalInkPhoto(`${INK}/cache/x.jpg`)).toBe(true);
    expect(isProvisionalInkPhoto(`${INK}/images/product_v2/main_image/x.jpg`)).toBe(false);
  });

  test("given an address next/image would refuse, when it is a shirt's photo, then the plain shirt is shown instead of a broken picture", () => {
    for (const u of [`${INK}/images/store/logo_image/x.webp`, `${INK}/x.jpg`, "https://img.example/silva.jpg", "http://gcp-images.majestic.ink.rsvcloud.com/cache/x.jpg"]) {
      expect(inkPhotoOrPlaceholder(u)).toBe(PERSONALIZED_PLACEHOLDER);
    }
    expect(loads(`${INK}/images/store/logo_image/x.webp`)).toBe(false);
  });
});

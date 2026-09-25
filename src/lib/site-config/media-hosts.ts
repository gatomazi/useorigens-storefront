/**
 * Where a published image may come from. A bundle's media table is data written by the CMS and read by the public storefront, so the
 * storefront only renders images that live under its OWN origin: files under /public, and CMS uploads served by its own `/media/...` route
 * (a private Railway Storage Bucket behind that route: the bucket is never exposed, and no foreign host is ever referenced). Only the exact
 * object layout the CMS writes is accepted for `/media/`, and the admin's own URLs (`/admin/...`) can never appear in a published production bundle.
 * Pure; not `server-only` (the validators are shared).
 */
export const MEDIA_PATH = /^\/media\/[0-9a-f]{64}\/\d{3,4}\.webp$/;

export function isAllowedMediaSrc(src: unknown): src is string {
  if (typeof src !== "string" || src.length > 200 || src.includes("..") || /[\s\\?#]/.test(src)) return false;
  if (!src.startsWith("/") || src.startsWith("//")) return false; // same-origin paths only: no scheme, no host
  if (src === "/admin" || src.startsWith("/admin/")) {
    // The admin's own URLs can never be part of a PUBLISHED production bundle. The one exception is the local sandbox (development only):
    // a dev upload is served by the dev-guarded /admin/media/<24 hex>.webp route.
    return process.env.NODE_ENV !== "production" && /^\/admin\/media\/[0-9a-f]{24}\.webp$/.test(src);
  }
  if (src === "/media" || src.startsWith("/media/")) return MEDIA_PATH.test(src);
  return true;
}

/** The URL prefix the public route serves (`/media/<sha256>/<width>.webp`) and its authenticated preview twin for the admin. */
export const publicMediaUrl = (key: string): string => `/${key}`;
export const adminMediaUrl = (key: string): string => `/admin/${key}`;

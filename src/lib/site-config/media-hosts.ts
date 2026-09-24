/**
 * Where a published image may come from. A bundle's media table is data written by the CMS and read by the public storefront, so the
 * storefront only ever renders images from (a) files under /public and (b) the one media origin (R2 behind a Cloudflare custom domain),
 * and only the exact object layout the CMS writes: /media/<sha256>/<width>.webp. Pure; not `server-only` (the validators are shared).
 */
export const MEDIA_ORIGIN = "https://media.useorigens.com.br";
const OBJECT_PATH = /^\/media\/[0-9a-f]{64}\/\d{3,4}\.webp$/;

/** The default origin plus any owner-configured extras (MEDIA_EXTRA_ORIGINS, comma-separated exact origins: a staging domain, or a loopback host in tests). */
export function allowedMediaOrigins(env: Record<string, string | undefined> = process.env): string[] {
  const extra = (env.MEDIA_EXTRA_ORIGINS ?? "").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);
  return [MEDIA_ORIGIN, ...extra];
}

export function isAllowedMediaSrc(src: unknown, env: Record<string, string | undefined> = process.env): src is string {
  if (typeof src !== "string" || src.length > 400 || src.includes("..") || /[\s\\]/.test(src)) return false;
  if (src.startsWith("/")) return !src.startsWith("//");
  try {
    const u = new URL(src);
    if (u.username || u.password || u.search || u.hash) return false;
    return allowedMediaOrigins(env).includes(u.origin) && OBJECT_PATH.test(u.pathname);
  } catch {
    return false;
  }
}

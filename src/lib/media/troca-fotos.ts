import { createHash } from "node:crypto";
import { signV4 } from "../admin/media/s3";

/**
 * `/troca-foto/<id>.<ext>`: public, permanent link to a photo of a defective piece, for INK exchanges (an exchange for a defect, print position
 * or print quality requires at least one photo as an https URL, up to 500 characters). The photos are uploaded by the operator's local product
 * tool (orgulhoregional, scripts/produtos → "Fotos de troca") to `trocas/` in the PRIVATE product-artwork bucket — not the CMS bucket — and this
 * route only reads them back. Rules, all unit-tested:
 *   - the file name must be exactly 32 lowercase hex + jpg/png/webp (the random id is the capability): nothing else reaches the bucket;
 *   - the key is always `trocas/<file>`: no other object of that bucket (e.g. the artwork under `artes/`) is ever readable here;
 *   - missing configuration or a missing object is a 404; a bucket failure is a 502; errors are never cacheable;
 *   - the object never changes under its name, so a hit is immutable for a year (the CDN in front keeps it).
 */
export const TROCA_FOTO_RE = /^[0-9a-f]{32}\.(jpg|png|webp)$/;
const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

type Config = { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string; region: string; addressing: "virtual" | "path" };

/** The product-artwork bucket, from TROCA_FOTOS_BUCKET_* (see docs/admin/production-runbook.md). Incomplete means "no photos": every link is a 404. */
export function trocaFotosConfig(env: Record<string, string | undefined> = process.env): Config | null {
  const { TROCA_FOTOS_BUCKET_ENDPOINT: endpoint, TROCA_FOTOS_BUCKET_NAME: bucket, TROCA_FOTOS_BUCKET_ACCESS_KEY_ID: accessKeyId, TROCA_FOTOS_BUCKET_SECRET_ACCESS_KEY: secretAccessKey } = env;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return { endpoint, bucket, accessKeyId, secretAccessKey, region: env.TROCA_FOTOS_BUCKET_REGION || "auto", addressing: env.TROCA_FOTOS_BUCKET_ADDRESSING === "path" ? "path" : "virtual" };
}

const NOT_FOUND = () => new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
const EMPTY_HASH = createHash("sha256").update("").digest("hex");

export async function serveTrocaFoto(input: { file: string; config: Config | null; fetchImpl?: typeof fetch }): Promise<Response> {
  if (!TROCA_FOTO_RE.test(input.file) || !input.config) return NOT_FOUND();
  const c = input.config;
  const base = new URL(c.endpoint);
  const host = c.addressing === "virtual" ? `${c.bucket}.${base.host}` : base.host;
  const path = `${c.addressing === "virtual" ? "" : `/${c.bucket}`}/trocas/${input.file}`;
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const { authorization } = signV4({ method: "GET", host, path, payloadHash: EMPTY_HASH, accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey, region: c.region, service: "s3", amzDate });
  try {
    const res = await (input.fetchImpl ?? fetch)(`${base.protocol}//${host}${path}`, {
      headers: { Authorization: authorization, "x-amz-date": amzDate, "x-amz-content-sha256": EMPTY_HASH },
      signal: AbortSignal.timeout(20_000),
      redirect: "error",
    });
    if (res.status === 404) return NOT_FOUND();
    if (!res.ok) throw new Error(`bucket GET ${res.status}`);
    const body = Buffer.from(await res.arrayBuffer());
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": TYPES[input.file.split(".")[1]],
        "Content-Length": String(body.length),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch {
    return new Response(null, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}

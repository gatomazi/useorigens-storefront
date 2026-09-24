import { createHash, createHmac } from "node:crypto";

/**
 * A minimal S3-compatible client (Cloudflare R2), AWS Signature V4, using only `fetch` and `node:crypto` (no SDK to install, audit or
 * bundle). Server-only by construction: the keys live in server env vars and are never serialised to a client component. It talks ONLY to
 * the configured endpoint; no URL from a request, a document or a file name ever becomes a request target (keys are built from a sha256
 * and a fixed width by the caller and re-checked here).
 */
export type ObjectStoreConfig = { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string; region?: string };

const sha256Hex = (data: string | Uint8Array): string => createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string): Buffer => createHmac("sha256", key).update(data).digest();
const encodeSegment = (s: string): string => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export type SignInput = {
  method: string;
  host: string;
  path: string; // already the URI path, e.g. /bucket/media/abc/640.webp
  query?: string; // canonical query string, "" when none
  headers?: Record<string, string>; // extra headers to sign (lower-case names)
  payloadHash: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
  amzDate: string; // 20130524T000000Z
};

/** Returns the `Authorization` header value and the signed header set. */
export function signV4(input: SignInput): { authorization: string; signedHeaders: string; signature: string } {
  const date = input.amzDate.slice(0, 8);
  const headers: Record<string, string> = { host: input.host, "x-amz-content-sha256": input.payloadHash, "x-amz-date": input.amzDate, ...(input.headers ?? {}) };
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${headers[n].trim().replace(/\s+/g, " ")}\n`).join("");
  const signedHeaders = names.join(";");
  const canonicalRequest = [input.method, input.path, input.query ?? "", canonicalHeaders, signedHeaders, input.payloadHash].join("\n");
  const scope = `${date}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", input.amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, date), input.region), input.service), "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  return { authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope},SignedHeaders=${signedHeaders},Signature=${signature}`, signedHeaders, signature };
}

export interface ObjectStore {
  put(key: string, body: Uint8Array, options: { contentType: string; cacheControl: string }): Promise<void>;
  exists(key: string): Promise<boolean>;
  remove(key: string): Promise<void>;
}

/** Object keys this CMS writes: `media/<sha256>/<width>.webp`. Anything else is refused before a request is built. */
const KEY_RE = /^media\/[0-9a-f]{64}\/\d{3,4}\.webp$/;

export function createObjectStore(config: ObjectStoreConfig, fetchImpl: typeof fetch = fetch): ObjectStore {
  const base = new URL(config.endpoint);
  const region = config.region ?? "auto";
  const request = async (method: "PUT" | "HEAD" | "DELETE", key: string, body?: Uint8Array, extra: Record<string, string> = {}): Promise<Response> => {
    if (!KEY_RE.test(key)) throw new Error("refusing an object key outside media/<sha256>/<width>.webp");
    const path = `${base.pathname.replace(/\/$/, "")}/${encodeSegment(config.bucket)}/${key.split("/").map(encodeSegment).join("/")}`;
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const payloadHash = sha256Hex(body ?? "");
    const { authorization } = signV4({ method, host: base.host, path, payloadHash, accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, region, service: "s3", amzDate });
    return fetchImpl(`${base.origin}${path}`, {
      method,
      headers: { Authorization: authorization, "x-amz-date": amzDate, "x-amz-content-sha256": payloadHash, ...extra },
      body: body ? Buffer.from(body) : undefined,
      signal: AbortSignal.timeout(20_000),
      redirect: "error", // never follow a redirect to somewhere the operator did not configure
    });
  };
  return {
    async put(key, body, options) {
      const res = await request("PUT", key, body, { "Content-Type": options.contentType, "Cache-Control": options.cacheControl });
      if (!res.ok) throw new Error(`object store PUT failed (${res.status})`);
    },
    async exists(key) {
      const res = await request("HEAD", key);
      if (res.status === 404) return false;
      if (!res.ok) throw new Error(`object store HEAD failed (${res.status})`);
      return true;
    },
    async remove(key) {
      const res = await request("DELETE", key);
      if (!res.ok && res.status !== 404) throw new Error(`object store DELETE failed (${res.status})`);
    },
  };
}

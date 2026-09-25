import { createObjectStore, type Addressing } from "./s3";

/**
 * The Railway Storage Bucket, from the variables of a bucket service referenced into this one (Railway names them ENDPOINT, BUCKET,
 * ACCESS_KEY_ID, SECRET_ACCESS_KEY, REGION; here they are BUCKET_ENDPOINT, BUCKET_NAME, ... — see docs/admin/production-runbook.md).
 * Incomplete configuration means "no uploads": the admin still works with the project's banners.
 */
export function bucketFromEnv(env: Record<string, string | undefined> = process.env) {
  const { BUCKET_ENDPOINT: endpoint, BUCKET_NAME: bucket, BUCKET_ACCESS_KEY_ID: accessKeyId, BUCKET_SECRET_ACCESS_KEY: secretAccessKey, BUCKET_REGION: region, BUCKET_ADDRESSING: addressing } = env;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return createObjectStore({ endpoint, bucket, accessKeyId, secretAccessKey, region: region || "auto", addressing: addressing === "path" || addressing === "virtual" ? (addressing as Addressing) : undefined });
}


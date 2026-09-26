import { describe, expect, test } from "vitest";
import { describeUploadFailure } from "@/lib/admin/media/upload-errors";

describe("upload failures are explained without leaking anything", () => {
  test("given the object store refuses with 403/404/400, when described, then the status and the variable to check are named", () => {
    expect(describeUploadFailure(new Error("object store PUT failed (403)"))).toMatch(/HTTP 403.*BUCKET_ACCESS_KEY_ID/);
    expect(describeUploadFailure(new Error("object store PUT failed (404)"))).toMatch(/HTTP 404.*endereçamento/);
    expect(describeUploadFailure(new Error("object store PUT failed (400)"))).toMatch(/HTTP 400/);
  });

  test("given a network failure, then it says it could not reach the Bucket and keeps only the error code", () => {
    const e = Object.assign(new Error("fetch failed"), { cause: { code: "ENOTFOUND" } });
    expect(describeUploadFailure(e)).toMatch(/não foi possível conectar ao Bucket.*ENOTFOUND/);
  });

  test("given a sharp load failure or a missing table, then each is named as such", () => {
    expect(describeUploadFailure(new Error("Could not load the \"sharp\" module"))).toMatch(/sharp/);
    expect(describeUploadFailure(new Error('relation "media_asset" does not exist'))).toMatch(/migrations/);
  });

  test("given an unknown error carrying a secret-looking message, then only its class is shown", () => {
    const text = describeUploadFailure(Object.assign(new TypeError("token=abc123SECRET at https://x"), {}));
    expect(text).not.toContain("abc123SECRET");
    expect(text).toContain("TypeError");
  });
});

describe("the S3 error code names the real problem", () => {
  test("given NoSuchBucket, SignatureDoesNotMatch and AccessDenied, when described, then each says what to check and which addressing is in use", () => {
    expect(describeUploadFailure(new Error("object store PUT failed (404 NoSuchBucket)"), "path")).toMatch(/BUCKET_NAME.*não existe.*endereçamento em uso: path/);
    expect(describeUploadFailure(new Error("object store PUT failed (403 SignatureDoesNotMatch)"))).toMatch(/assinatura.*BUCKET_REGION/);
    expect(describeUploadFailure(new Error("object store PUT failed (403 AccessDenied)"))).toMatch(/permissão de escrita/);
    expect(describeUploadFailure(new Error("object store PUT failed (404)"))).toMatch(/endereçamento em uso: virtual/);
  });
});

import { describe, expect, test } from "vitest";
import { createObjectStore, signV4 } from "@/lib/admin/media/s3";

describe("AWS Signature V4", () => {
  test("given the documented GET Object example, when signed, then the signature matches AWS's published value", () => {
    // https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html (Example: GET Object, with a Range header)
    const r = signV4({
      method: "GET", host: "examplebucket.s3.amazonaws.com", path: "/test.txt", headers: { range: "bytes=0-9" },
      payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", region: "us-east-1", service: "s3", amzDate: "20130524T000000Z",
    });
    expect(r.signedHeaders).toBe("host;range;x-amz-content-sha256;x-amz-date");
    expect(r.signature).toBe("f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41");
    expect(r.authorization).toContain("Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request");
  });
});

describe("object store", () => {
  const SHA = "a".repeat(64);
  const config = { endpoint: "https://acct.r2.cloudflarestorage.com", bucket: "media-bucket", accessKeyId: "AKIA", secretAccessKey: "SECRET" };
  const recorder = (status = 200) => {
    const calls: { method: string; url: string; headers: Record<string, string>; redirect: string | undefined; bodyBytes: number }[] = [];
    const impl = (async (url: string, init: RequestInit) => {
      calls.push({ method: String(init.method), url, headers: init.headers as Record<string, string>, redirect: init.redirect, bodyBytes: init.body ? (init.body as Buffer).length : 0 });
      return new Response(null, { status });
    }) as unknown as typeof fetch;
    return { calls, impl };
  };

  test("given an object, when put, then it is a signed PUT to bucket/key with immutable cache headers and never follows a redirect", async () => {
    const { calls, impl } = recorder();
    await createObjectStore(config, impl).put(`media/${SHA}/640.webp`, new Uint8Array([1, 2, 3]), { contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" });
    expect(calls[0]).toMatchObject({ method: "PUT", url: `https://acct.r2.cloudflarestorage.com/media-bucket/media/${SHA}/640.webp`, redirect: "error", bodyBytes: 3 });
    expect(calls[0].headers.Authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIA\/\d{8}\/auto\/s3\/aws4_request,SignedHeaders=host;x-amz-content-sha256;x-amz-date,Signature=[0-9a-f]{64}$/);
    expect(calls[0].headers["Cache-Control"]).toContain("immutable");
    expect(JSON.stringify(calls[0])).not.toContain("SECRET");
  });

  test("given keys outside the media layout, when used, then no request is ever built (no traversal, no other prefix, no host tricks)", async () => {
    const { calls, impl } = recorder();
    const store = createObjectStore(config, impl);
    for (const key of ["../etc/passwd", `media/${SHA}/../x.webp`, "media/short/640.webp", `media/${SHA}/640.svg`, `originals/${SHA}`, `//evil.example/${SHA}`, `media/${SHA}/640.webp?x=1`]) {
      await expect(store.put(key, new Uint8Array([1]), { contentType: "image/webp", cacheControl: "x" }), key).rejects.toThrow("refusing");
      await expect(store.remove(key), key).rejects.toThrow("refusing");
    }
    expect(calls).toHaveLength(0);
  });

  test("given the store's answers, when checking or deleting, then 404 means absent, 5xx is an error, and a failed PUT throws", async () => {
    const key = `media/${SHA}/1080.webp`;
    expect(await createObjectStore(config, recorder(404).impl).exists(key)).toBe(false);
    expect(await createObjectStore(config, recorder(200).impl).exists(key)).toBe(true);
    await expect(createObjectStore(config, recorder(503).impl).exists(key)).rejects.toThrow("503");
    await expect(createObjectStore(config, recorder(403).impl).put(key, new Uint8Array([1]), { contentType: "image/webp", cacheControl: "x" })).rejects.toThrow("403");
    await expect(createObjectStore(config, recorder(404).impl).remove(key)).resolves.toBeUndefined();
  });
});

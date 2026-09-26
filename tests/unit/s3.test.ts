import { describe, expect, test } from "vitest";
import { createObjectStore, defaultAddressing, signV4 } from "@/lib/admin/media/s3";

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
  const config = { endpoint: "https://acct.example-storage.test", bucket: "media-bucket", accessKeyId: "AKIA", secretAccessKey: "SECRET" };
  const railway = { endpoint: "https://t3.storageapi.dev", bucket: "my-bucket-jdhhd8oe18xi", accessKeyId: "AKIA", secretAccessKey: "SECRET", region: "auto" };
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
    expect(calls[0]).toMatchObject({ method: "PUT", url: `https://acct.example-storage.test/media-bucket/media/${SHA}/640.webp`, redirect: "error", bodyBytes: 3 });
    expect(calls[0].headers.Authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIA\/\d{8}\/auto\/s3\/aws4_request,SignedHeaders=host;x-amz-content-sha256;x-amz-date,Signature=[0-9a-f]{64}$/);
    expect(calls[0].headers["Cache-Control"]).toContain("immutable");
    expect(JSON.stringify(calls[0])).not.toContain("SECRET");
  });

  test("given a Railway bucket endpoint, when used, then the bucket is a subdomain (virtual-hosted style), the host is signed, and the region is auto", async () => {
    const { calls, impl } = recorder();
    await createObjectStore(railway, impl).put(`media/${SHA}/640.webp`, new Uint8Array([1]), { contentType: "image/webp", cacheControl: "x" });
    expect(calls[0].url).toBe(`https://my-bucket-jdhhd8oe18xi.t3.storageapi.dev/media/${SHA}/640.webp`);
    expect(calls[0].headers.Authorization).toMatch(/Credential=AKIA\/\d{8}\/auto\/s3\/aws4_request/);
    expect(defaultAddressing("https://t3.storageapi.dev")).toBe("virtual");
    expect(defaultAddressing("https://acct.example-storage.test")).toBe("path");
    expect(defaultAddressing("not a url")).toBe("path");
  });

  test("given path style forced on a Railway endpoint (older buckets), when used, then the bucket goes in the path", async () => {
    const { calls, impl } = recorder();
    await createObjectStore({ ...railway, addressing: "path" }, impl).exists(`media/${SHA}/640.webp`);
    expect(calls[0].url).toBe(`https://t3.storageapi.dev/my-bucket-jdhhd8oe18xi/media/${SHA}/640.webp`);
  });

  test("given a configured signing region that Railway rejects (403), when used, then it retries once with \"auto\" and keeps what works", async () => {
    const seen: string[] = [];
    const impl = (async (_url: string, init: RequestInit) => {
      const region = /Credential=[^/]+\/\d{8}\/([^/]+)\//.exec((init.headers as Record<string, string>).Authorization)![1];
      seen.push(region);
      return new Response(null, { status: region === "iad" ? 403 : 200 });
    }) as unknown as typeof fetch;
    const store = createObjectStore({ ...railway, region: "iad" }, impl);
    expect(await store.exists(`media/${SHA}/640.webp`)).toBe(true);
    expect(await store.exists(`media/${SHA}/1080.webp`)).toBe(true);
    expect(seen).toEqual(["iad", "auto", "auto"]); // the second call goes straight to the region that worked
    const denied = createObjectStore({ ...railway, region: "auto" }, (async () => new Response(null, { status: 403 })) as unknown as typeof fetch);
    await expect(denied.exists(`media/${SHA}/640.webp`)).rejects.toThrow("403"); // a real denial is not retried forever
  });

  test("given a stored object, when read, then its bytes and type come back; a missing one is null and an error throws", async () => {
    const key = `media/${SHA}/640.webp`;
    const ok = (async () => new Response(new Uint8Array([9, 8, 7]), { status: 200, headers: { "content-type": "image/webp" } })) as unknown as typeof fetch;
    const got = await createObjectStore(config, ok).get(key);
    expect(got).toEqual({ body: Buffer.from([9, 8, 7]), contentType: "image/webp" });
    expect(await createObjectStore(config, recorder(404).impl).get(key)).toBeNull();
    await expect(createObjectStore(config, recorder(500).impl).get(key)).rejects.toThrow("500");
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

describe("failures carry the S3 error code", () => {
  test("given a 404 NoSuchBucket XML body, when a PUT fails, then the error names the code (and nothing else from the body)", async () => {
    const fetchImpl = (async () => new Response("<Error><Code>NoSuchBucket</Code><Message>The specified bucket does not exist secret-detail</Message></Error>", { status: 404 })) as typeof fetch;
    const store = createObjectStore({ endpoint: "https://t3.storageapi.dev", bucket: "b", accessKeyId: "AK", secretAccessKey: "SK", region: "auto", addressing: "path" }, fetchImpl);
    const key = `media/${"a".repeat(64)}/640.webp`;
    await expect(store.put(key, new Uint8Array([1]), { contentType: "image/webp", cacheControl: "x" })).rejects.toThrow("object store PUT failed (404 NoSuchBucket)");
    await expect(store.put(key, new Uint8Array([1]), { contentType: "image/webp", cacheControl: "x" })).rejects.not.toThrow(/secret-detail/);
  });
});

import { describe, expect, test } from "vitest";
import { serveTrocaFoto, trocaFotosConfig } from "@/lib/media/troca-fotos";

const ENV = { TROCA_FOTOS_BUCKET_ENDPOINT: "https://t3.storage.test", TROCA_FOTOS_BUCKET_NAME: "artes", TROCA_FOTOS_BUCKET_ACCESS_KEY_ID: "k", TROCA_FOTOS_BUCKET_SECRET_ACCESS_KEY: "s" };
const ID = "a".repeat(32);

const bucket = (status = 200) => {
  const urls: string[] = [];
  const fetchImpl = (async (url: string) => {
    urls.push(url);
    return new Response(status === 200 ? "jpeg-bytes" : null, { status });
  }) as unknown as typeof fetch;
  return { urls, fetchImpl };
};

describe("troca-foto route", () => {
  test("given an uploaded photo, when requested, then it is read from trocas/ only and served immutable with the type of its extension", async () => {
    const b = bucket();
    const r = await serveTrocaFoto({ file: `${ID}.jpg`, config: trocaFotosConfig(ENV), fetchImpl: b.fetchImpl });
    expect(r.status).toBe(200);
    expect(Object.fromEntries(r.headers)).toMatchObject({ "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" });
    expect(Buffer.from(await r.arrayBuffer()).toString()).toBe("jpeg-bytes");
    expect(b.urls).toEqual([`https://artes.t3.storage.test/trocas/${ID}.jpg`]);
  });

  test("given path addressing, then the bucket goes in the path", async () => {
    const b = bucket();
    await serveTrocaFoto({ file: `${ID}.png`, config: trocaFotosConfig({ ...ENV, TROCA_FOTOS_BUCKET_ADDRESSING: "path" }), fetchImpl: b.fetchImpl });
    expect(b.urls).toEqual([`https://t3.storage.test/artes/trocas/${ID}.png`]);
  });

  test("given any name outside <32 hex>.<jpg|png|webp>, then it is a 404 and the bucket is never called", async () => {
    for (const file of ["../artes/x.png", `artes%2F${ID}.png`, `${ID}.heic`, `${ID.slice(1)}.png`, `${ID.toUpperCase()}.png`, `${ID}.png.html`]) {
      const b = bucket();
      const r = await serveTrocaFoto({ file, config: trocaFotosConfig(ENV), fetchImpl: b.fetchImpl });
      expect(r.status, file).toBe(404);
      expect(b.urls, file).toEqual([]);
    }
  });

  test("given a missing object, missing configuration or a failing bucket, then 404/404/502, never cacheable", async () => {
    const missing = await serveTrocaFoto({ file: `${ID}.png`, config: trocaFotosConfig(ENV), fetchImpl: bucket(404).fetchImpl });
    expect(missing.status).toBe(404);
    expect((await serveTrocaFoto({ file: `${ID}.png`, config: trocaFotosConfig({}), fetchImpl: bucket().fetchImpl })).status).toBe(404);
    const failing = await serveTrocaFoto({ file: `${ID}.png`, config: trocaFotosConfig(ENV), fetchImpl: bucket(500).fetchImpl });
    expect(failing.status).toBe(502);
    expect(failing.headers.get("cache-control")).toBe("no-store");
    expect(missing.headers.get("cache-control")).toBe("no-store");
  });
});

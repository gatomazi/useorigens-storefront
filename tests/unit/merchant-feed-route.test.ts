import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ regenerate: vi.fn(async () => undefined) }));
vi.mock("@/lib/merchant/generate", () => ({ regenerateMerchantFeed: mocks.regenerate }));

const get = (query = "") => new Request(`http://storefront.test/api/feeds/google-merchant${query}`);

describe("GET /api/feeds/google-merchant", () => {
  const env = process.env;
  let dir = "";
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "merchant-route-"));
    process.env = { ...env, CATALOG_SNAPSHOT_DIR: dir };
    delete process.env.MERCHANT_FEED_TOKEN;
    mocks.regenerate.mockClear();
  });
  afterEach(() => {
    process.env = env;
  });
  const writeFeed = () => {
    mkdirSync(path.join(dir, "loja-unica"), { recursive: true });
    writeFileSync(path.join(dir, "loja-unica", "google-merchant.tsv"), "id\ttitle\n1\tCamiseta\n");
  };

  test("before the first generation it answers 503 (never an empty feed) and asks for one", async () => {
    const { GET } = await import("@/app/api/feeds/google-merchant/route");
    const res = await GET(get());
    expect(res.status).toBe(503);
    expect(mocks.regenerate).toHaveBeenCalledTimes(1);
  });

  test("a fresh file is served as TSV without regenerating", async () => {
    writeFeed();
    const { GET } = await import("@/app/api/feeds/google-merchant/route");
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/tab-separated-values; charset=utf-8");
    expect(await res.text()).toBe("id\ttitle\n1\tCamiseta\n");
    expect(mocks.regenerate).not.toHaveBeenCalled();
  });

  test("with MERCHANT_FEED_TOKEN set, a missing or wrong token is a 404 and the right one gets the file", async () => {
    writeFeed();
    process.env.MERCHANT_FEED_TOKEN = "s3cret";
    const { GET } = await import("@/app/api/feeds/google-merchant/route");
    expect((await GET(get())).status).toBe(404);
    expect((await GET(get("?token=nope"))).status).toBe(404);
    expect((await GET(get("?token=s3cret"))).status).toBe(200);
  });
});

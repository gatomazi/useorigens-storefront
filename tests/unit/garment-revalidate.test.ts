import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { GarmentSyncRunResult } from "@/lib/catalog/garment-sync-service";
import { requestGarmentRevalidation, revalidateAfterPromotion } from "@/lib/catalog/garment-revalidate-client";
import type { CatalogSnapshot, UnrankedBinding } from "@/lib/catalog/types";
import type { CommerceStoreKey } from "@/lib/geo/regions";

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

const NOW = "2026-09-28T00:00:00.000Z";
const TIJUCAS_SC = "4218004";
const XAMBIOA_TO = "1722107";

const canonical = (store: CommerceStoreKey, cityId: string, id: string, cluster: string): UnrankedBinding => ({
  cityId,
  designFamily: "traco",
  designVariant: "base",
  commerceStoreKey: store,
  inkProductId: id,
  slug: `classic-${id}`,
  storeProductUrl: `https://example.invalid/${id}`,
  imageUrl: "https://gcp-images.majestic.ink.rsvcloud.com/classic.jpg",
  price: 109.9,
  syncedAt: NOW,
  productClusterId: cluster,
});

const snapshot: CatalogSnapshot = {
  version: 1,
  stores: {
    "use-sul": { commerceStoreKey: "use-sul", syncedAt: NOW, productCount: 1, bindings: [canonical("use-sul", TIJUCAS_SC, "1", "100")], merch: [], excluded: [] },
    "use-norte": { commerceStoreKey: "use-norte", syncedAt: NOW, productCount: 1, bindings: [canonical("use-norte", XAMBIOA_TO, "2", "200")], merch: [], excluded: [] },
  },
};

const INDEX = JSON.stringify({ version: 1, stores: { "use-sul": { syncedAt: NOW, clusters: { "100": [[72, "11", "peruano", "images/p.jpg", 139.9]] } } } });
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

describe("garment revalidation", () => {
  let dir: string;
  const env = process.env;

  beforeEach(async () => {
    revalidatePath.mockReset();
    dir = await mkdtemp(path.join(tmpdir(), "garment-revalidate-"));
    process.env = { ...env, CATALOG_SNAPSHOT_DIR: dir, ADMIN_SYNC_TOKEN: "test-token" };
    await writeFile(path.join(dir, "catalog-snapshot.json"), JSON.stringify(snapshot));
    await writeFile(path.join(dir, "garment-index.json"), INDEX);
  });
  afterEach(async () => {
    process.env = env;
    await rm(dir, { recursive: true, force: true });
  });

  const post = async (body: unknown, token: string | null = "test-token") => {
    const { POST } = await import("@/app/api/admin/garment-index/revalidate/route");
    return POST(
      new Request("http://localhost/api/admin/garment-index/revalidate", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    );
  };

  describe("which city pages are affected", () => {
    test("given a promoted Sul index, when paths are computed, then only cities whose primary comes from the Sul store are included", async () => {
      const { garmentRevalidationPaths } = await import("@/lib/catalog/garment-revalidate");
      expect(garmentRevalidationPaths(["use-sul"])).toEqual(["/sul/sc/tijucas"]);
      expect(garmentRevalidationPaths(["use-norte"])).toEqual(["/norte/to/xambioa"]);
    });

    test("given no store filter, when paths are computed, then every covered city is included", async () => {
      const { garmentRevalidationPaths } = await import("@/lib/catalog/garment-revalidate");
      expect([...garmentRevalidationPaths([])].sort()).toEqual(["/norte/to/xambioa", "/sul/sc/tijucas"]);
    });

    test("given a store with no products in the catalog, when paths are computed, then nothing is invalidated", async () => {
      const { garmentRevalidationPaths } = await import("@/lib/catalog/garment-revalidate");
      expect(garmentRevalidationPaths(["use-centro"])).toEqual([]);
    });
  });

  describe("POST /api/admin/garment-index/revalidate", () => {
    test("given no ADMIN_SYNC_TOKEN configured, when called, then it is disabled (503), never open", async () => {
      delete process.env.ADMIN_SYNC_TOKEN;
      expect((await post({})).status).toBe(503);
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    test("given a wrong or missing token, when called, then it answers 401 and invalidates nothing", async () => {
      expect((await post({}, "nope")).status).toBe(401);
      expect((await post({}, null)).status).toBe(401);
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    test("given a malformed body or an unknown store, when called, then it answers 400 and invalidates nothing", async () => {
      expect((await post("{not json")).status).toBe(400);
      expect((await post({ storeKeys: ["use-origens"] })).status).toBe(400);
      expect((await post({ storeKeys: "use-sul" })).status).toBe(400);
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    test("given a valid request for the Sul store, when called, then exactly that city page is marked for revalidation", async () => {
      const res = await post({ storeKeys: ["use-sul"] });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ revalidated: true, cities: 1 });
      expect(revalidatePath.mock.calls).toEqual([["/sul/sc/tijucas"]]);
    });

    test("given revalidatePath throws, when called, then it answers 500 and the promoted index file is byte-identical", async () => {
      revalidatePath.mockImplementation(() => {
        throw new Error("cache layer down");
      });
      const before = sha(await readFile(path.join(dir, "garment-index.json"), "utf8"));
      const res = await post({ storeKeys: ["use-sul"] });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "revalidation failed: cache layer down" });
      expect(sha(await readFile(path.join(dir, "garment-index.json"), "utf8"))).toBe(before);
    });
  });

  describe("the CLI side", () => {
    const outcome = (over: Record<string, unknown> = {}) => ({ storeKey: "use-sul", ok: true, mode: "full", requestsUsedThisRun: 10, pagesThisRun: 10, totalPages: 10, truncated: false, completedFullPass: false, newGarmentBindings: 5, totalGarmentBindingsForStore: 5, ...over });
    const run = (...outcomes: Record<string, unknown>[]) => ({ startedAt: NOW, finishedAt: NOW, outcomes }) as unknown as GarmentSyncRunResult;

    test("given plain http to a remote host, when requested, then the token is never sent", async () => {
      const fetchImpl = vi.fn();
      const result = await requestGarmentRevalidation("http://storefront.example.com", "t", ["use-sul"], { fetchImpl: fetchImpl as unknown as typeof fetch });
      expect(result).toEqual({ ok: false, error: expect.stringContaining("plain http") });
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    test("given loopback http or https, when requested, then it POSTs to the revalidate route with the bearer token and the stores", async () => {
      const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ revalidated: true, cities: 7 }), { status: 200 }));
      for (const base of ["http://127.0.0.1:3000", "https://www.example.com"]) {
        const result = await requestGarmentRevalidation(base, "secret", ["use-sul"], { fetchImpl: fetchImpl as unknown as typeof fetch });
        expect(result).toEqual({ ok: true, cities: 7 });
      }
      const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
      expect(String(url)).toBe("http://127.0.0.1:3000/api/admin/garment-index/revalidate");
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret");
      expect(init.body).toBe(JSON.stringify({ storeKeys: ["use-sul"] }));
    });

    test("given a non-2xx answer or a network error, when requested, then it returns a failure value and never throws", async () => {
      const bad = vi.fn(async () => new Response("no", { status: 401 }));
      expect(await requestGarmentRevalidation("https://x.example.com", "t", [], { fetchImpl: bad as unknown as typeof fetch })).toEqual({ ok: false, error: "revalidation endpoint answered 401" });
      const boom = vi.fn(async () => {
        throw new TypeError("terminated");
      });
      expect(await requestGarmentRevalidation("https://x.example.com", "t", [], { fetchImpl: boom as unknown as typeof fetch })).toEqual({ ok: false, error: "revalidation request failed: terminated" });
    });

    test("given a sync that changed nothing or failed, when finishing, then no revalidation is requested", async () => {
      const fetchImpl = vi.fn();
      const env = { baseUrl: "https://x.example.com", token: "t" };
      const deps = { fetchImpl: fetchImpl as unknown as typeof fetch };
      expect(await revalidateAfterPromotion(run(outcome({ newGarmentBindings: 0 })), env, deps)).toMatchObject({ requested: false });
      expect(await revalidateAfterPromotion(run({ storeKey: "use-sul", ok: false, error: "boom" }), env, deps)).toMatchObject({ requested: false });
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    test("given no URL or token configured, when finishing, then it says so instead of guessing a target", async () => {
      expect(await revalidateAfterPromotion(run(outcome()), {})).toEqual({ requested: false, reason: "GARMENT_REVALIDATE_URL and ADMIN_SYNC_TOKEN are not both set" });
    });

    test("given a promoted index and a failing revalidation, when finishing, then the failure is reported and the index is untouched", async () => {
      const before = sha(await readFile(path.join(dir, "garment-index.json"), "utf8"));
      const boom = vi.fn(async () => {
        throw new TypeError("terminated");
      });
      const post = await revalidateAfterPromotion(run(outcome(), outcome({ storeKey: "use-norte", newGarmentBindings: 0, completedFullPass: true })), { baseUrl: "https://x.example.com", token: "t" }, { fetchImpl: boom as unknown as typeof fetch });
      expect(post).toMatchObject({ requested: true, stores: ["use-sul", "use-norte"], result: { ok: false } });
      expect(sha(await readFile(path.join(dir, "garment-index.json"), "utf8"))).toBe(before);
    });
  });
});

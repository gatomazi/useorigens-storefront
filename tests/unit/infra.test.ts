import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { citiesOfRegion } from "@/lib/geo/cities";
import { getCatalog } from "@/lib/catalog/repository";
import { snapshotStatus } from "@/lib/catalog/snapshot-file";

// Every test here restores process.env exactly as it found it, since these read real env vars by design.
const ENV_KEYS = ["NEXT_PUBLIC_SITE_URL", "COMMERCE_STORE_PRIORITY", "INK_TOKEN_SUL", "INK_TOKEN_NORTE", "INK_TOKEN_CENTRO", "ADMIN_SYNC_TOKEN"] as const;
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe("env config", () => {
  test("given NEXT_PUBLIC_SITE_URL unset, when read, then falls back to the production domain", async () => {
    const { siteUrl } = await import("@/lib/config/env");
    expect(siteUrl()).toBe("https://www.useorigens.com.br");
  });

  test("given an invalid NEXT_PUBLIC_SITE_URL, when read, then it throws a clear ConfigError", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "not-a-url";
    const { siteUrl, ConfigError } = await import("@/lib/config/env");
    expect(() => siteUrl()).toThrow(ConfigError);
    expect(() => siteUrl()).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });

  test("given COMMERCE_STORE_PRIORITY unset, when read, then there is no override", async () => {
    const { commerceStorePriorityOverride } = await import("@/lib/config/env");
    expect(commerceStorePriorityOverride()).toBeNull();
  });

  test("given COMMERCE_STORE_PRIORITY with an unknown store key, when read, then it throws naming the bad key", async () => {
    process.env.COMMERCE_STORE_PRIORITY = "use-sul,use-not-a-store";
    const { commerceStorePriorityOverride, ConfigError } = await import("@/lib/config/env");
    expect(() => commerceStorePriorityOverride()).toThrow(ConfigError);
    expect(() => commerceStorePriorityOverride()).toThrow(/use-not-a-store/);
  });

  test("given a valid COMMERCE_STORE_PRIORITY list, when read, then it returns the parsed keys in order", async () => {
    process.env.COMMERCE_STORE_PRIORITY = "use-origens,use-sul";
    const { commerceStorePriorityOverride } = await import("@/lib/config/env");
    expect(commerceStorePriorityOverride()).toEqual(["use-origens", "use-sul"]);
  });

  test("given no INK token at all, when requireAtLeastOneInkToken runs, then it throws instead of syncing nothing silently", async () => {
    const { requireAtLeastOneInkToken, ConfigError } = await import("@/lib/config/env");
    expect(() => requireAtLeastOneInkToken()).toThrow(ConfigError);
  });

  test("given one INK token set, when requireAtLeastOneInkToken runs, then it does not throw", async () => {
    process.env.INK_TOKEN_SUL = "x";
    const { requireAtLeastOneInkToken } = await import("@/lib/config/env");
    expect(() => requireAtLeastOneInkToken()).not.toThrow();
  });

  test("given ADMIN_SYNC_TOKEN unset, when read, then it is null (the sync route stays disabled)", async () => {
    const { adminSyncToken } = await import("@/lib/config/env");
    expect(adminSyncToken()).toBeNull();
  });
});

describe("catalog snapshot status", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "snapshot-status-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("given no snapshot file, when read, then present is false and nothing throws", () => {
    const file = path.join(dir, "missing.json");
    const status = snapshotStatus(file);
    expect(status).toEqual({ present: false, ageMs: null, stores: [], totalProducts: 0, path: file });
  });

  test("given a real snapshot file, when read, then it reports per-store counts and a non-negative age", () => {
    const file = path.join(dir, "catalog-snapshot.json");
    writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        stores: {
          "use-sul": { commerceStoreKey: "use-sul", syncedAt: "2026-09-20T00:00:00.000Z", productCount: 42, bindings: [], merch: [], excluded: [] },
        },
      }),
    );
    const status = snapshotStatus(file);
    expect(status.present).toBe(true);
    expect(status.totalProducts).toBe(42);
    expect(status.stores).toEqual([{ storeKey: "use-sul", productCount: 42, syncedAt: "2026-09-20T00:00:00.000Z" }]);
    expect(status.ageMs).toBeGreaterThanOrEqual(0);
  });

  test("given a corrupted (non-JSON) snapshot file, when read, then it is treated as present with zero stores, not a crash", () => {
    const file = path.join(dir, "corrupt.json");
    writeFileSync(file, "{not json");
    const status = snapshotStatus(file);
    expect(status.present).toBe(true);
    expect(status.totalProducts).toBe(0);
    expect(status.stores).toEqual([]);
  });
});

describe("no network calls while serving pages", () => {
  test("given fetch stubbed to always throw, when reading geo data and the catalog, then nothing calls it", () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("network access attempted during page render");
    }) as typeof fetch;
    try {
      // Geo data is a build-time JSON import (src/lib/geo/cities.ts) — never a request-time read or fetch.
      expect(() => citiesOfRegion("sul").length).not.toThrow();
      expect(citiesOfRegion("sul").length).toBeGreaterThan(0);
      // The catalog reads the local snapshot file synchronously — also never a fetch.
      const catalog = getCatalog();
      expect(() => catalog.merch("sul")).not.toThrow();
      expect(() => catalog.coveredCityIds("sul")).not.toThrow();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

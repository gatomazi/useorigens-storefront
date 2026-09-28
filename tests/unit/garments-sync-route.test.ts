import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { beginSyncJob, resetSyncJobForTests } from "@/lib/catalog/sync-job";

const mocks = vi.hoisted(() => ({ after: vi.fn(), revalidatePath: vi.fn(), runGarmentSyncJob: vi.fn(async () => undefined) }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/catalog/garment-sync-runner", () => ({ runGarmentSyncJob: mocks.runGarmentSyncJob, lastGarmentSyncRun: () => null }));

const URL_ = "http://storefront.test/api/admin/garments-sync";
const call = (method: "POST" | "GET", { token = "secret", body }: { token?: string | null; body?: string } = {}) =>
  new Request(URL_, { method, headers: token === null ? {} : { authorization: `Bearer ${token}` }, ...(body !== undefined ? { body } : {}) });

describe("POST/GET /api/admin/garments-sync", () => {
  const env = process.env;
  beforeEach(() => {
    process.env = { ...env, ADMIN_SYNC_TOKEN: "secret" };
    resetSyncJobForTests();
    Object.values(mocks).forEach((m) => m.mockClear());
  });
  afterEach(() => {
    process.env = env;
    resetSyncJobForTests();
  });

  test("given no token configured, then the endpoint is disabled (503) and starts nothing", async () => {
    delete process.env.ADMIN_SYNC_TOKEN;
    const { POST } = await import("@/app/api/admin/garments-sync/route");
    expect((await POST(call("POST"))).status).toBe(503);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  test("given a missing or wrong token, then 401 and nothing starts, for POST and GET", async () => {
    const { POST, GET } = await import("@/app/api/admin/garments-sync/route");
    expect((await POST(call("POST", { token: null }))).status).toBe(401);
    expect((await POST(call("POST", { token: "nope" }))).status).toBe(401);
    expect((await GET(call("GET", { token: "nope" }))).status).toBe(401);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  test("given a valid token, then it answers 202 at once and schedules exactly one job", async () => {
    const { POST } = await import("@/app/api/admin/garments-sync/route");
    const res = await POST(call("POST"));
    expect(res.status).toBe(202);
    expect(mocks.after).toHaveBeenCalledTimes(1);
  });

  test("given a job already running, then a second POST is 409 and schedules nothing", async () => {
    beginSyncJob([]);
    const { POST } = await import("@/app/api/admin/garments-sync/route");
    const res = await POST(call("POST"));
    expect(res.status).toBe(409);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  test("given a body with any parameter other than a valid storeKeys list, then 400", async () => {
    const { POST } = await import("@/app/api/admin/garments-sync/route");
    expect((await POST(call("POST", { body: "{not json" }))).status).toBe(400);
    expect((await POST(call("POST", { body: JSON.stringify({ beginDate: "2020-01-01" }) }))).status).toBe(400);
    expect((await POST(call("POST", { body: JSON.stringify({ storeKeys: ["use-origens"] }) }))).status).toBe(400);
    expect((await POST(call("POST", { body: JSON.stringify({ storeKeys: "use-sul" }) }))).status).toBe(400);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  test("given a valid store list, then it is accepted", async () => {
    const { POST } = await import("@/app/api/admin/garments-sync/route");
    expect((await POST(call("POST", { body: JSON.stringify({ storeKeys: ["use-sul"] }) }))).status).toBe(202);
  });
});

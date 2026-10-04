import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ revalidatePath: vi.fn(), syncUmaPenca: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/umapenca/sync", () => ({ syncUmaPenca: mocks.syncUmaPenca }));

describe("POST /api/admin/umapenca-sync", () => {
  const call = (token: string | null) => new Request("http://storefront.test/api/admin/umapenca-sync", { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {} });
  const env = process.env;
  beforeEach(() => {
    process.env = { ...env, ADMIN_SYNC_TOKEN: "secret" };
    Object.values(mocks).forEach((m) => m.mockReset());
  });
  afterEach(() => {
    process.env = env;
  });

  test("disabled without a token, 401 with a wrong one, and nothing is fetched", async () => {
    const { POST } = await import("@/app/api/admin/umapenca-sync/route");
    expect((await POST(call("nope"))).status).toBe(401);
    delete process.env.ADMIN_SYNC_TOKEN;
    expect((await POST(call("secret"))).status).toBe(503);
    expect(mocks.syncUmaPenca).not.toHaveBeenCalled();
  });

  test("revalidates the page only when the snapshot changed, and reports a failed feed as 502", async () => {
    const { POST } = await import("@/app/api/admin/umapenca-sync/route");
    mocks.syncUmaPenca.mockResolvedValueOnce({ ok: true, changed: false, entryCount: 1, articleCount: 1, excluded: [] });
    expect((await POST(call("secret"))).status).toBe(200);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    mocks.syncUmaPenca.mockResolvedValueOnce({ ok: true, changed: true, entryCount: 1, articleCount: 1, excluded: [] });
    await POST(call("secret"));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/[region]/outros-artigos", "page");
    mocks.syncUmaPenca.mockResolvedValueOnce({ ok: false, error: "feed answered HTTP 404" });
    expect((await POST(call("secret"))).status).toBe(502);
  });
});

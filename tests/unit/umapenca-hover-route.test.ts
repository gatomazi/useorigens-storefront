import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ revalidatePath: vi.fn(), syncUmaPencaHover: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/umapenca/hover", () => ({ syncUmaPencaHover: mocks.syncUmaPencaHover }));

describe("POST /api/admin/umapenca-hover-sync", () => {
  const call = (token: string | null, query = "") => new Request(`http://storefront.test/api/admin/umapenca-hover-sync${query}`, { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {} });
  const env = process.env;
  beforeEach(() => {
    process.env = { ...env, ADMIN_SYNC_TOKEN: "secret" };
    Object.values(mocks).forEach((m) => m.mockReset());
  });
  afterEach(() => {
    process.env = env;
  });

  test("disabled without a token, 401 with a wrong one, and nothing is fetched", async () => {
    const { POST } = await import("@/app/api/admin/umapenca-hover-sync/route");
    expect((await POST(call("nope"))).status).toBe(401);
    delete process.env.ADMIN_SYNC_TOKEN;
    expect((await POST(call("secret"))).status).toBe(503);
    expect(mocks.syncUmaPencaHover).not.toHaveBeenCalled();
  });

  test("passes ?refresh=1 through, revalidates the region pages only when a photo was fetched, and reports a failure as 502", async () => {
    const { POST } = await import("@/app/api/admin/umapenca-hover-sync/route");
    mocks.syncUmaPencaHover.mockResolvedValueOnce({ ok: true, fetched: [], kept: 7, missing: [] });
    expect((await POST(call("secret"))).status).toBe(200);
    expect(mocks.syncUmaPencaHover).toHaveBeenLastCalledWith({ refresh: false });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    mocks.syncUmaPencaHover.mockResolvedValueOnce({ ok: true, fetched: [{ id: "1", url: "https://umapenca.imgix.net/430102/other-side.jpg" }], kept: 0, missing: [] });
    await POST(call("secret", "?refresh=1"));
    expect(mocks.syncUmaPencaHover).toHaveBeenLastCalledWith({ refresh: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/[region]", "layout");
    mocks.syncUmaPencaHover.mockResolvedValueOnce({ ok: false, error: "no Uma Penca snapshot yet — run the feed sync first" });
    expect((await POST(call("secret"))).status).toBe(502);
  });
});

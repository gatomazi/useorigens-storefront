import { describe, expect, test } from "vitest";
import { checkDevAdminRequest, devAdminEnabled, isLoopbackHost } from "@/lib/admin/dev-guard";

const DEV = { NODE_ENV: "development", ADMIN_DEV_MODE: "true" };
const req = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });

describe("dev-only admin guard", () => {
  test("given a development server with the flag and a localhost request, when checked, then it is allowed", () => {
    for (const host of ["localhost:3000", "localhost", "127.0.0.1:3000", "[::1]:3000", "LOCALHOST:3000"]) {
      expect(checkDevAdminRequest(req({ host }), DEV), host).toEqual({ ok: true });
    }
  });

  test("given a production process, when checked, then it is refused even with the flag and a localhost host", () => {
    expect(checkDevAdminRequest(req({ host: "localhost:3000" }), { NODE_ENV: "production", ADMIN_DEV_MODE: "true" }).ok).toBe(false);
    expect(checkDevAdminRequest(req({ host: "localhost:3000" }), { ADMIN_DEV_MODE: "true" }).ok).toBe(false);
    expect(devAdminEnabled({ NODE_ENV: "production", ADMIN_DEV_MODE: "true" })).toBe(false);
  });

  test("given a development server WITHOUT the explicit flag (or a truthy-looking value), when checked, then it is refused", () => {
    for (const flag of [undefined, "", "1", "TRUE", "yes", "false"]) {
      expect(checkDevAdminRequest(req({ host: "localhost:3000" }), { NODE_ENV: "development", ADMIN_DEV_MODE: flag }).ok, String(flag)).toBe(false);
    }
  });

  test("given a public or look-alike host, when checked, then it is refused", () => {
    for (const host of ["www.useorigens.com.br", "admin.useorigens.com.br", "localhost.evil.example", "evil.example:3000", "127.0.0.1.evil.example", "0.0.0.0:3000", "192.168.2.5:3000", "", "example.com@localhost"]) {
      expect(checkDevAdminRequest(req({ host }), DEV).ok, host).toBe(false);
    }
    expect(checkDevAdminRequest(req({}), DEV).ok).toBe(false); // no Host header at all
  });

  test("given the headers Next itself adds (loopback values), when checked, then the request is still allowed", () => {
    const own = { host: "127.0.0.1:3000", "x-forwarded-host": "127.0.0.1:3000", "x-forwarded-port": "3000", "x-forwarded-proto": "http", "x-forwarded-for": "::1" };
    expect(checkDevAdminRequest(req(own), DEV)).toEqual({ ok: true });
    expect(checkDevAdminRequest(req({ ...own, "x-forwarded-for": "127.0.0.1, ::ffff:127.0.0.1" }), DEV)).toEqual({ ok: true });
  });

  test("given a request that went through a real proxy (public client, public host, via, forwarded), when checked, then it is refused whatever Host says", () => {
    const base = { host: "localhost:3000" };
    expect(checkDevAdminRequest(req({ ...base, "x-forwarded-for": "203.0.113.9" }), DEV).ok).toBe(false);
    expect(checkDevAdminRequest(req({ ...base, "x-forwarded-for": "127.0.0.1, 203.0.113.9" }), DEV).ok).toBe(false); // one hop is public
    expect(checkDevAdminRequest(req({ ...base, "x-real-ip": "203.0.113.9" }), DEV).ok).toBe(false);
    expect(checkDevAdminRequest(req({ ...base, "x-forwarded-host": "www.useorigens.com.br" }), DEV).ok).toBe(false);
    expect(checkDevAdminRequest(req({ ...base, forwarded: "for=203.0.113.9" }), DEV).ok).toBe(false);
    expect(checkDevAdminRequest(req({ ...base, via: "1.1 railway" }), DEV).ok).toBe(false);
  });

  test("given a query string or path tricks, when the Host is checked, then only the Host header decides", () => {
    expect(isLoopbackHost("localhost:3000/admin")).toBe(true); // a Host never carries a path; the port/path split keeps the name only
    expect(isLoopbackHost("evil.example?localhost")).toBe(false);
  });
});

import { describe, expect, test } from "vitest";
import { decideRoute } from "@/lib/admin/routing";

const ADMIN = "admin.useorigens.com.br";
const on = (host: string, pathname: string, adminHost: string | null = ADMIN) => decideRoute({ host, pathname, adminHost });

describe("admin routing (D4)", () => {
  test("given the store domain, when /admin is requested, then it is a 404 — no admin screen on the public host", () => {
    for (const p of ["/admin", "/admin/", "/admin/home", "/admin/api/publish", "/admin/auth/callback", "/admin/login"]) {
      expect(on("www.useorigens.com.br", p), p).toEqual({ action: "not-found" });
    }
  });

  test("given the apex store domain and a railway host, when /admin is requested, then also 404", () => {
    expect(on("useorigens.com.br", "/admin")).toEqual({ action: "not-found" });
    expect(on("useorigens-storefront-production.up.railway.app", "/admin/x")).toEqual({ action: "not-found" });
  });

  test("given the admin host, when /admin pages are requested, then they pass with noindex and no-store (the panel's links keep the prefix)", () => {
    const headers = { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" };
    for (const p of ["/admin", "/admin/home", "/admin/login", "/admin/auth/callback"]) expect(on(ADMIN, p), p).toEqual({ action: "pass", headers });
  });

  test("given the admin host, when the root is requested, then it redirects to /admin", () => {
    expect(on(ADMIN, "/")).toMatchObject({ action: "redirect", pathname: "/admin" });
  });

  test("given the admin host, when a host header carries a port or upper case, then it is still recognised", () => {
    expect(on("ADMIN.useorigens.com.br:443", "/admin/home")).toMatchObject({ action: "pass" });
  });

  test("given an admin host that carries a port (automated tests), when the port differs, then it is not the admin host", () => {
    expect(decideRoute({ host: "127.0.0.1:3400", pathname: "/admin", adminHost: "127.0.0.1:3400" })).toMatchObject({ action: "pass" });
    expect(decideRoute({ host: "127.0.0.1:3401", pathname: "/admin", adminHost: "127.0.0.1:3400" })).toEqual({ action: "not-found" });
  });

  test("given the admin host, when a traversal or a storefront/API route is requested, then the storefront does not exist there", () => {
    for (const p of ["/a/../admin", "//evil", "/sul", "/sul/sc/tijucas", "/tracking", "/api/cidades/sul", "/api/admin/catalog-sync"]) expect(on(ADMIN, p), p).toEqual({ action: "not-found" });
  });

  test("given a development server with the admin enabled, when a local host asks for /admin, then it passes (the pages still require loopback)", () => {
    expect(decideRoute({ host: "localhost:3000", pathname: "/admin/home", adminHost: null, devAdmin: true })).toMatchObject({ action: "pass" });
    expect(decideRoute({ host: "localhost:3000", pathname: "/admin/home", adminHost: null, devAdmin: false })).toEqual({ action: "not-found" });
  });

  test("given ANY host, when health or ready is requested, then it passes untouched (probes never depend on the gate or the host)", () => {
    for (const h of [ADMIN, "www.useorigens.com.br", "localhost"]) {
      expect(on(h, "/api/health")).toEqual({ action: "pass" });
      expect(on(h, "/api/ready")).toEqual({ action: "pass" });
    }
  });

  test("given ANY host, when a static asset is requested, then it passes", () => {
    for (const h of [ADMIN, "www.useorigens.com.br"]) {
      expect(on(h, "/_next/static/chunks/a.js")).toEqual({ action: "pass" });
      expect(on(h, "/favicon.ico")).toEqual({ action: "pass" });
    }
  });

  test("given the store domain, when the storefront or the machine-to-machine sync route is requested, then nothing changes", () => {
    expect(on("www.useorigens.com.br", "/sul")).toEqual({ action: "pass" });
    expect(on("www.useorigens.com.br", "/sul/sc/tijucas")).toEqual({ action: "pass" });
    expect(on("www.useorigens.com.br", "/api/admin/catalog-sync")).toEqual({ action: "pass" });
  });

  test("given no admin host configured (admin not enabled), when any host asks for /admin, then it is a 404 and everything else passes", () => {
    expect(on("admin.useorigens.com.br", "/admin", null)).toEqual({ action: "not-found" });
    expect(on("admin.useorigens.com.br", "/sul", null)).toEqual({ action: "pass" });
    expect(on("localhost:3000", "/admin", null)).toEqual({ action: "not-found" });
  });

  test("given a look-alike host, when /admin is requested, then it is not treated as the admin host", () => {
    expect(on("admin.useorigens.com.br.evil.example", "/tracking")).toEqual({ action: "pass" });
    expect(on("admin.useorigens.com.br.evil.example", "/admin/home")).toEqual({ action: "not-found" });
    expect(on("xadmin.useorigens.com.br", "/admin")).toEqual({ action: "not-found" });
  });
});

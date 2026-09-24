import { describe, expect, test } from "vitest";
import { decideRoute } from "@/lib/admin/routing";

const ADMIN = "admin.useorigens.com.br";
const on = (host: string, pathname: string, adminHost: string | null = ADMIN) => decideRoute({ host, pathname, adminHost });

describe("admin routing (D4)", () => {
  test("given the store domain, when /admin is requested, then it is a 404 — no admin screen on the public host", () => {
    for (const p of ["/admin", "/admin/", "/admin/regioes", "/admin/api/publish", "/admin/auth/callback"]) {
      expect(on("www.useorigens.com.br", p), p).toEqual({ action: "not-found" });
    }
  });

  test("given the apex store domain and a railway host, when /admin is requested, then also 404", () => {
    expect(on("useorigens.com.br", "/admin")).toEqual({ action: "not-found" });
    expect(on("useorigens-storefront-production.up.railway.app", "/admin/x")).toEqual({ action: "not-found" });
  });

  test("given the admin host, when a path is requested, then it is rewritten under /admin with noindex and no-store", () => {
    expect(on(ADMIN, "/")).toEqual({ action: "rewrite", pathname: "/admin", headers: { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" } });
    expect(on(ADMIN, "/tracking")).toMatchObject({ action: "rewrite", pathname: "/admin/tracking" });
    expect(on(ADMIN, "/auth/callback")).toMatchObject({ action: "rewrite", pathname: "/admin/auth/callback" });
  });

  test("given the admin host, when a host header carries a port or upper case, then it is still recognised", () => {
    expect(on("ADMIN.useorigens.com.br:443", "/regioes")).toMatchObject({ action: "rewrite" });
  });

  test("given the admin host, when the internal prefix or a traversal is spelled out, then it is a 404", () => {
    for (const p of ["/admin", "/admin/tracking", "/a/../admin", "//evil"]) expect(on(ADMIN, p), p).toEqual({ action: "not-found" });
  });

  test("given the admin host, when a storefront route or the public API is requested, then the storefront does not exist there", () => {
    // '/sul' is rewritten to '/admin/sul', which is not an admin page and 404s — the storefront is never served from the admin host.
    expect(on(ADMIN, "/sul")).toMatchObject({ pathname: "/admin/sul" });
    expect(on(ADMIN, "/api/cidades/sul")).toEqual({ action: "not-found" });
    expect(on(ADMIN, "/api/admin/catalog-sync")).toEqual({ action: "not-found" });
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
  });

  test("given a look-alike host, when /admin is requested, then it is not treated as the admin host", () => {
    expect(on("admin.useorigens.com.br.evil.example", "/tracking")).toEqual({ action: "pass" });
    expect(on("xadmin.useorigens.com.br", "/admin")).toEqual({ action: "not-found" });
  });
});

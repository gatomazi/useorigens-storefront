import { describe, expect, test } from "vitest";
import { apexOf, decideRoute } from "@/lib/admin/routing";

const ADMIN = "www.useorigens.com.br";
const on = (host: string, pathname: string, adminHost: string | null = ADMIN) => decideRoute({ host, pathname, adminHost });
const HEADERS = { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" };

describe("admin routing: /admin on the storefront's own host", () => {
  test("given the admin host, when /admin pages are requested, then they pass with noindex and no-store", () => {
    for (const p of ["/admin", "/admin/home", "/admin/login", "/admin/auth/callback", "/admin/media/aaaa/640.webp"]) expect(on(ADMIN, p), p).toEqual({ action: "pass", headers: HEADERS });
  });

  test("given the admin host, when ANY storefront route is requested, then the decision touches nothing (public navigation is unchanged)", () => {
    for (const p of ["/", "/sul", "/sul/sc", "/sul/sc/tijucas", "/sul/privacidade", "/media/abc/640.webp", "/api/cidades/sul", "/api/cart-mirror", "/adminx", "/administrator", "/anything"]) expect(on(ADMIN, p), p).toEqual({ action: "pass" });
  });

  test("given the admin host with a port or upper case, when /admin is requested, then it is still recognised", () => {
    expect(on("WWW.useorigens.com.br:443", "/admin/home")).toMatchObject({ action: "pass", headers: HEADERS });
  });

  test("given a look-alike or a foreign host, when /admin is requested, then it is a 404", () => {
    for (const h of ["www.useorigens.com.br.evil.example", "xwww.useorigens.com.br", "useorigens-storefront-production.up.railway.app", "admin.useorigens.com.br", "evil.example"]) {
      for (const p of ["/admin", "/admin/", "/admin/login", "/admin/auth/callback?code=x", "/admin/media/x"]) expect(on(h, p), `${h}${p}`).toEqual({ action: "not-found" });
    }
  });

  test("given the bare domain of a www admin host, when /admin is requested, then it redirects to the admin host (only /admin; the storefront on the apex is untouched)", () => {
    expect(apexOf(ADMIN)).toBe("useorigens.com.br");
    expect(on("useorigens.com.br", "/admin/home")).toEqual({ action: "redirect", pathname: "/admin/home", toAdminHost: true, headers: HEADERS });
    expect(on("useorigens.com.br:443", "/admin")).toMatchObject({ action: "redirect" });
    expect(on("useorigens.com.br", "/sul")).toEqual({ action: "pass" });
    expect(on("useorigens.com.br", "/")).toEqual({ action: "pass" });
    expect(on("sub.useorigens.com.br", "/admin")).toEqual({ action: "not-found" });
  });

  test("given an admin host that is not a www name, or carries a port, when computing the apex, then there is none (no redirect)", () => {
    expect(apexOf("admin.example.com")).toBeNull();
    expect(apexOf("www.example.com:3000")).toBeNull();
    expect(on("example.com", "/admin", "admin.example.com")).toEqual({ action: "not-found" });
  });

  test("given an admin host with a port (automated tests), when the port differs, then it is not the admin host", () => {
    expect(decideRoute({ host: "127.0.0.1:3400", pathname: "/admin", adminHost: "127.0.0.1:3400" })).toMatchObject({ action: "pass", headers: HEADERS });
    expect(decideRoute({ host: "127.0.0.1:3401", pathname: "/admin", adminHost: "127.0.0.1:3400" })).toEqual({ action: "not-found" });
    expect(decideRoute({ host: "127.0.0.1:3400", pathname: "/sul", adminHost: "127.0.0.1:3400" })).toEqual({ action: "pass" });
  });

  test("given a traversal or a double slash inside /admin on the admin host, when requested, then it is a 404", () => {
    for (const p of ["/admin/../x", "/admin//x"]) expect(on(ADMIN, p), p).toEqual({ action: "not-found" });
  });

  test("given a development server with the admin enabled, when a local host asks for /admin, then it passes (the pages still require loopback)", () => {
    expect(decideRoute({ host: "localhost:3000", pathname: "/admin/home", adminHost: null, devAdmin: true })).toMatchObject({ action: "pass" });
    expect(decideRoute({ host: "localhost:3000", pathname: "/admin/home", adminHost: null, devAdmin: false })).toEqual({ action: "not-found" });
  });

  test("given ANY host, when health, ready or a static asset is requested, then it passes untouched", () => {
    for (const h of [ADMIN, "www.useorigens.com.br", "localhost", "evil.example"]) {
      for (const p of ["/api/health", "/api/ready", "/_next/static/chunks/a.js", "/favicon.ico"]) expect(on(h, p), `${h}${p}`).toEqual({ action: "pass" });
    }
  });

  test("given no admin host configured (admin not enabled), when any host asks for /admin, then it is a 404 and everything else passes", () => {
    expect(on(ADMIN, "/admin", null)).toEqual({ action: "not-found" });
    expect(on("localhost:3000", "/admin", null)).toEqual({ action: "not-found" });
    expect(on(ADMIN, "/sul", null)).toEqual({ action: "pass" });
  });
});

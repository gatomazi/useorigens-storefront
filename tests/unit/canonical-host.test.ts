import { describe, expect, test } from "vitest";
import { apexRedirect, isCanonicalHost } from "@/lib/seo/canonical-host";

const SITE = "https://www.useorigens.com.br";

describe("canonical host (decides whether a page is sent as noindex)", () => {
  test("given the canonical www host, when compared, then it is canonical", () => {
    expect(isCanonicalHost("www.useorigens.com.br", SITE)).toBe(true);
  });

  test("given the canonical host with a port, upper case, spaces or a trailing dot, when compared, then it is still canonical", () => {
    expect(isCanonicalHost("www.useorigens.com.br:443", SITE)).toBe(true);
    expect(isCanonicalHost("WWW.UseOrigens.com.BR", SITE)).toBe(true);
    expect(isCanonicalHost("  www.useorigens.com.br  ", SITE)).toBe(true);
    expect(isCanonicalHost("www.useorigens.com.br.", SITE)).toBe(true);
  });

  test("given the bare domain, when compared, then it is NOT canonical (it stays noindex until redirected to www)", () => {
    expect(isCanonicalHost("useorigens.com.br", SITE)).toBe(false);
    expect(isCanonicalHost("useorigens.com.br:443", SITE)).toBe(false);
  });

  test("given a Railway temporary address or a preview host, when compared, then it is NOT canonical", () => {
    expect(isCanonicalHost("useorigens-storefront-production.up.railway.app", SITE)).toBe(false);
    expect(isCanonicalHost("useorigens-storefront-pr-24.up.railway.app", SITE)).toBe(false);
    expect(isCanonicalHost("localhost:3000", SITE)).toBe(false);
    expect(isCanonicalHost("0.0.0.0:8080", SITE)).toBe(false);
  });

  test("given an unexpected host, when compared, then it is NOT canonical", () => {
    expect(isCanonicalHost("evil.example", SITE)).toBe(false);
    expect(isCanonicalHost("admin.useorigens.com.br", SITE)).toBe(false);
    expect(isCanonicalHost("sul.useorigens.com.br", SITE)).toBe(false);
  });

  test("given a look-alike host, when compared, then it is NOT canonical", () => {
    expect(isCanonicalHost("www.useorigens.com.br.evil.example", SITE)).toBe(false);
    expect(isCanonicalHost("xwww.useorigens.com.br", SITE)).toBe(false);
    expect(isCanonicalHost("www.useorigens.com.br.evil.example:443", SITE)).toBe(false);
  });

  test("given a missing or empty Host, when compared, then it is NOT canonical", () => {
    expect(isCanonicalHost(null, SITE)).toBe(false);
    expect(isCanonicalHost(undefined, SITE)).toBe(false);
    expect(isCanonicalHost("", SITE)).toBe(false);
    expect(isCanonicalHost("   ", SITE)).toBe(false);
  });

  test("given a malformed or multi-valued Host, when compared, then it is NOT canonical", () => {
    for (const h of ["www.useorigens.com.br,evil.example", "www.useorigens.com.br evil.example", "evil.example@www.useorigens.com.br", "www.useorigens.com.br/x", "www.useorigens.com.br:abc", "www.useorigens.com.br:", "[::1]", "http://www.useorigens.com.br", "www.useorigens.com.br\r\nX: y"]) {
      expect(isCanonicalHost(h, SITE), h).toBe(false);
    }
  });

  test("given a malformed configured site URL, when compared, then nothing is canonical (fails closed)", () => {
    expect(isCanonicalHost("www.useorigens.com.br", "not a url")).toBe(false);
    expect(isCanonicalHost("www.useorigens.com.br", "")).toBe(false);
  });

  test("given a site URL with a port or a path, when compared, then only its host name counts", () => {
    expect(isCanonicalHost("www.useorigens.com.br", "https://www.useorigens.com.br:443/sul")).toBe(true);
    expect(isCanonicalHost("staging.example.com", "https://staging.example.com")).toBe(true);
  });
});

describe("apexRedirect (the bare domain sends its PAGES to www)", () => {
  const go = (hostHeader: string | null, pathname: string, search = "", method = "GET", canonicalSiteUrl = SITE) => apexRedirect({ hostHeader, pathname, search, method, canonicalSiteUrl });

  test("given a page on the bare domain, then it moves to the same path and query on www", () => {
    expect(go("useorigens.com.br", "/sul/sc/florianopolis", "?utm_source=ig&q=a%20b")).toBe("https://www.useorigens.com.br/sul/sc/florianopolis?utm_source=ig&q=a%20b");
    expect(go("useorigens.com.br", "/")).toBe("https://www.useorigens.com.br/");
    expect(go("useorigens.com.br", "/sul/busca", "?q=chimarr%C3%A3o")).toBe("https://www.useorigens.com.br/sul/busca?q=chimarr%C3%A3o");
  });

  test("given the same host with a port, upper case, spaces or a trailing dot, then it still moves", () => {
    for (const host of ["useorigens.com.br:443", "UseOrigens.COM.br", "  useorigens.com.br ", "useorigens.com.br."]) expect(go(host, "/sul")).toBe("https://www.useorigens.com.br/sul");
  });

  test("given HEAD, it moves; given POST, PUT or OPTIONS, it does not (a form or a Server Action keeps working)", () => {
    expect(go("useorigens.com.br", "/sul", "", "HEAD")).toBe("https://www.useorigens.com.br/sul");
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) expect(go("useorigens.com.br", "/sul", "", method)).toBeNull();
  });

  test("given www itself, another subdomain, a look-alike or a missing host, then nothing moves", () => {
    for (const host of ["www.useorigens.com.br", "loja.useorigens.com.br", "artigos.useorigens.com.br", "evil-useorigens.com.br", "useorigens.com.br.evil.example", "notuseorigens.com.br", "", null, "bad host", "a.b.c.d:99999x"])
      expect(go(host, "/sul")).toBeNull();
  });

  test("given a machine endpoint, the admin, the editor or an embedded asset, then it stays on the bare domain", () => {
    for (const path of ["/api/busca", "/api/mcp", "/api/feeds/google-merchant", "/api/post-add-kit/sul", "/.well-known/oauth-authorization-server", "/.well-known/oauth-protected-resource", "/admin", "/admin/home", "/estampas", "/estampas/x", "/media/abc/640.webp", "/troca-foto/x.jpg", "/_next/static/chunk.js"])
      expect(go("useorigens.com.br", path)).toBeNull();
  });

  test("given a page whose name only STARTS like a kept path, then it still moves (the match is by segment)", () => {
    for (const path of ["/apisul", "/administracao", "/estampas-do-sul", "/mediacao"]) expect(go("useorigens.com.br", path)).toBe(`https://www.useorigens.com.br${path}`);
  });

  test("given a canonical URL without www (localhost, a temporary Railway address) or a malformed one, then nothing moves", () => {
    expect(go("useorigens.com.br", "/sul", "", "GET", "http://localhost:3000")).toBeNull();
    expect(go("localhost:3000", "/sul", "", "GET", "http://localhost:3000")).toBeNull();
    expect(go("app.up.railway.app", "/sul", "", "GET", "https://app.up.railway.app")).toBeNull();
    expect(go("useorigens.com.br", "/sul", "", "GET", "not a url")).toBeNull();
  });

  test("never becomes another host: a protocol-relative or backslash path stays a PATH on www", () => {
    expect(go("useorigens.com.br", "//evil.example/x")).toBe("https://www.useorigens.com.br//evil.example/x");
    expect(go("useorigens.com.br", "/\\evil.example")).toBe("https://www.useorigens.com.br/\\evil.example");
    expect(new URL(go("useorigens.com.br", "//evil.example/x")!).host).toBe("www.useorigens.com.br");
  });

  test("the destination is built from the canonical ORIGIN, not from what the request says about itself", () => {
    expect(go("useorigens.com.br", "/sul", "", "GET", "https://www.useorigens.com.br/qualquer/caminho?x=1")).toBe("https://www.useorigens.com.br/sul");
  });
});

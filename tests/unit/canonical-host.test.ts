import { describe, expect, test } from "vitest";
import { isCanonicalHost } from "@/lib/seo/canonical-host";

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

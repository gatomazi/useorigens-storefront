import { describe, expect, test } from "vitest";
import { adminConfig, isAdminHost } from "@/lib/admin/config";

const FULL = {
  NODE_ENV: "production",
  ADMIN_HOST: "admin.useorigens.com.br",
  ADMIN_OWNER_EMAIL: "Dono@Example.com",
  RAILWAY_OAUTH_CLIENT_ID: "railway-client-id",
  RAILWAY_OAUTH_CLIENT_SECRET: "client-secret",
  ADMIN_SESSION_SECRET: "x".repeat(40),
  DATABASE_URL: "postgres://user:pass@db.internal:5432/cms",
};

describe("admin mode decision", () => {
  test("given a production process with the complete variable set, when decided, then the admin is on, normalised, and Railway is the issuer", () => {
    const c = adminConfig(FULL);
    expect(c).toMatchObject({ mode: "prod", adminHost: "admin.useorigens.com.br", adminOrigin: "https://admin.useorigens.com.br", ownerEmail: "dono@example.com", oidcIssuer: "https://backboard.railway.com", ownerSub: null });
  });

  test("given any single required variable missing, when decided, then the admin is OFF and names what is missing", () => {
    for (const name of ["ADMIN_HOST", "ADMIN_OWNER_EMAIL", "RAILWAY_OAUTH_CLIENT_ID", "RAILWAY_OAUTH_CLIENT_SECRET", "ADMIN_SESSION_SECRET", "DATABASE_URL"]) {
      const c = adminConfig({ ...FULL, [name]: undefined });
      expect(c.mode, name).toBe("off");
      expect(c.mode === "off" && c.missing.join(" ")).toContain(name);
    }
  });

  test("given blank values, a short session secret, a malformed host or e-mail, when decided, then it is OFF", () => {
    expect(adminConfig({ ...FULL, DATABASE_URL: "   " }).mode).toBe("off");
    expect(adminConfig({ ...FULL, ADMIN_SESSION_SECRET: "short" }).mode).toBe("off");
    expect(adminConfig({ ...FULL, ADMIN_HOST: "https://admin.example.com/x" }).mode).toBe("off");
    expect(adminConfig({ ...FULL, ADMIN_OWNER_EMAIL: "not-an-email" }).mode).toBe("off");
  });

  test("given ADMIN_DEV_MODE in a production process, when decided, then it is ignored: it never opens the admin, complete config or not", () => {
    expect(adminConfig({ NODE_ENV: "production", ADMIN_DEV_MODE: "true" })).toMatchObject({ mode: "off", ignoredDevMode: true });
    expect(adminConfig({ ...FULL, ADMIN_DEV_MODE: "true" }).mode).toBe("prod"); // still the authenticated production admin, never the dev one
  });

  test("given a development server, when decided, then dev mode needs the literal opt-in and never uses the production path", () => {
    expect(adminConfig({ ...FULL, NODE_ENV: "development", ADMIN_DEV_MODE: "true" }).mode).toBe("dev");
    expect(adminConfig({ NODE_ENV: "development" }).mode).toBe("off");
    expect(adminConfig({ NODE_ENV: "development", ADMIN_DEV_MODE: "1" }).mode).toBe("off");
    expect(adminConfig({ ...FULL, NODE_ENV: "test" }).mode).toBe("off");
  });

  test("given an OIDC issuer override, when it is not Railway or a loopback http URL, then the admin stays OFF", () => {
    expect(adminConfig({ ...FULL, ADMIN_OIDC_ISSUER: "https://evil.example" }).mode).toBe("off");
    expect(adminConfig({ ...FULL, ADMIN_OIDC_ISSUER: "http://evil.example" }).mode).toBe("off");
    expect(adminConfig({ ...FULL, ADMIN_OIDC_ISSUER: "http://127.0.0.1:4555/" })).toMatchObject({ mode: "prod", oidcIssuer: "http://127.0.0.1:4555" });
  });

  test("given ADMIN_OWNER_RAILWAY_SUB, when set, then it is carried as the owner's immutable account id", () => {
    expect(adminConfig({ ...FULL, ADMIN_OWNER_RAILWAY_SUB: " abc-123 " })).toMatchObject({ mode: "prod", ownerSub: "abc-123" });
  });

  test("given a loopback admin host (automated tests), when decided, then the origin is http; a real host is always https", () => {
    expect(adminConfig({ ...FULL, ADMIN_HOST: "127.0.0.1:3400" })).toMatchObject({ adminOrigin: "http://127.0.0.1:3400" });
    expect(adminConfig(FULL)).toMatchObject({ adminOrigin: "https://admin.useorigens.com.br" });
  });

  test("given the admin host, when a Host header is compared, then case and default port are tolerated and look-alikes are not", () => {
    expect(isAdminHost("ADMIN.useorigens.com.br", "admin.useorigens.com.br")).toBe(true);
    expect(isAdminHost("admin.useorigens.com.br:443", "admin.useorigens.com.br")).toBe(true);
    expect(isAdminHost("admin.useorigens.com.br.evil.example", "admin.useorigens.com.br")).toBe(false);
    expect(isAdminHost("www.useorigens.com.br", "admin.useorigens.com.br")).toBe(false);
    expect(isAdminHost(null, "admin.useorigens.com.br")).toBe(false);
    expect(isAdminHost("admin.useorigens.com.br", null)).toBe(false);
  });
});

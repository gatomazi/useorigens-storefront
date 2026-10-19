import { describe, expect, it } from "vitest";
import { createStudioSession, hashStudioPassword, STUDIO_SESSION_SECONDS, studioCookieName, studioCookieOptions, studioCredentials, verifyStudioLogin, verifyStudioSession } from "@/lib/print-studio/auth-core";

describe("acesso exclusivo ao editor", () => {
  const secret = "test-editor-session-secret-32-characters";
  const environment = { PRINT_STUDIO_USERNAME: "criacao", PRINT_STUDIO_SESSION_SECRET: secret, PRINT_STUDIO_ORIGIN: "https://origens.example.test" };
  it("exige configuração completa e HTTPS fora do computador local", async () => {
    expect(studioCredentials({})).toBeNull();
    const env = { ...environment, PRINT_STUDIO_PASSWORD_HASH: await hashStudioPassword("Uma-senha-de-teste-123") };
    expect(studioCredentials(env)).not.toBeNull();
    expect(studioCredentials({ ...env, PRINT_STUDIO_ORIGIN: "http://origens.example.test" })).toBeNull();
    expect(studioCredentials({ ...env, PRINT_STUDIO_SESSION_SECRET: "weak" })).toBeNull();
  });
  it("valida usuário e senha sem armazenar a senha em texto puro", async () => {
    const passwordHash = await hashStudioPassword("Uma-senha-de-teste-123");
    const config = studioCredentials({ ...environment, PRINT_STUDIO_PASSWORD_HASH: passwordHash })!;
    expect(passwordHash).not.toContain("Uma-senha");
    expect(await verifyStudioLogin("criacao", "Uma-senha-de-teste-123", config)).toBe(true);
    expect(await verifyStudioLogin("admin", "Uma-senha-de-teste-123", config)).toBe(false);
    expect(await verifyStudioLogin("criacao", "senha errada", config)).toBe(false);
  });
  it("aceita uma senha de nove caracteres definida pelo responsável", async () => {
    const config = studioCredentials({ ...environment, PRINT_STUDIO_PASSWORD_HASH: await hashStudioPassword("teste1234") })!;
    expect(await verifyStudioLogin("criacao", "teste1234", config)).toBe(true);
    await expect(hashStudioPassword("curta")).rejects.toThrow("8 caracteres");
  });
  it("recusa sessão adulterada, expirada, de outro segredo ou anterior à troca da senha", async () => {
    const config = studioCredentials({ ...environment, PRINT_STUDIO_PASSWORD_HASH: await hashStudioPassword("Uma-senha-de-teste-123") })!;
    const now = 1_700_000_000_000;
    const token = createStudioSession(config, now);
    expect(verifyStudioSession(token, config, now + 100)).toBe(true);
    expect(verifyStudioSession(token + "x", config, now)).toBe(false);
    expect(verifyStudioSession(token, config, now + STUDIO_SESSION_SECONDS * 1000)).toBe(false);
    expect(verifyStudioSession(token, { ...config, secret: "other" }, now)).toBe(false);
    expect(verifyStudioSession(token, { ...config, passwordHash: await hashStudioPassword("Outra-senha-de-teste-123") }, now)).toBe(false);
    expect(verifyStudioSession("eyJyb2xlIjoib3duZXIifQ.fake-admin-signature", config, now)).toBe(false);
    expect(studioCookieName(config)).not.toBe("__Secure-uo_admin");
    expect(studioCookieOptions(config)).toMatchObject({ path: "/estampas", httpOnly: true, secure: true, sameSite: "strict" });
  });
});

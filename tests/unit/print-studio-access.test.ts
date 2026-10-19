import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createStudioSession, hashStudioPassword, studioCookieName, studioCredentials } from "@/lib/print-studio/auth-core";
import { resetRateLimitsForTests } from "@/lib/admin/auth/rate-limit";

const state = vi.hoisted(() => ({ token: "", cookieName: "", headers: new Headers(), list: vi.fn(async () => []), save: vi.fn(), read: vi.fn(), lookupAdmin: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => state.headers,
  cookies: async () => ({ get: (name: string) => name === state.cookieName && state.token ? { value: state.token } : undefined }),
}));
vi.mock("@/lib/print-studio/server", () => ({ serverPrintStore: () => ({ list: state.list, save: state.save, read: state.read }) }));
vi.mock("@/lib/admin/platform", () => ({ platform: () => ({ sessions: { lookup: state.lookupAdmin } }) }));

import { GET, POST } from "@/app/estampas/dados/route";
import { GET as getFile } from "@/app/estampas/arquivos/[id]/[file]/route";
import { GET as getLogo } from "@/app/estampas/logos/[id]/route";
import { POST as login } from "@/app/estampas/entrar/route";
import { POST as logout } from "@/app/estampas/sair/route";
import { currentActor } from "@/lib/admin/auth/guard";

describe("isolamento do acesso ao editor", () => {
  const origin = "https://estudio.example.test";
  beforeAll(async () => {
    vi.stubEnv("PRINT_STUDIO_USERNAME", "criacao");
    vi.stubEnv("PRINT_STUDIO_PASSWORD_HASH", await hashStudioPassword("Teste-de-acesso-12345"));
    vi.stubEnv("PRINT_STUDIO_SESSION_SECRET", "a-dedicated-test-secret-for-the-studio");
    vi.stubEnv("PRINT_STUDIO_ORIGIN", origin);
  });
  beforeEach(() => {
    resetRateLimitsForTests(); vi.clearAllMocks();
    state.headers = new Headers({ host: "estudio.example.test" });
    state.token = ""; state.cookieName = studioCookieName(studioCredentials()!);
  });
  const request = (path = "/estampas/dados") => new Request(origin + path);
  const authenticate = () => { state.token = createStudioSession(studioCredentials()!); };
  function loginRequest(password = "Teste-de-acesso-12345", source = origin) {
    return new Request(`${origin}/estampas/entrar`, { method: "POST", headers: { Origin: source }, body: new URLSearchParams({ username: "criacao", password }) });
  }

  it("protege dados e arquivos mesmo se o endereço for acessado diretamente", async () => {
    expect((await GET(request())).status).toBe(401);
    expect((await getFile(request(), { params: Promise.resolve({ id: "example", file: "project.json" }) })).status).toBe(401);
    expect((await getLogo(request("/estampas/logos/sul-clara"), { params: Promise.resolve({ id: "sul-clara" }) })).status).toBe(401);
    expect(state.list).not.toHaveBeenCalled();
    expect(state.read).not.toHaveBeenCalled();
  });
  it("permite a galeria, mas recusa CSRF, publicação de modelos e o arquivo final do administrador", async () => {
    authenticate();
    expect((await GET(request())).status).toBe(200);
    const logo = await getLogo(request("/estampas/logos/sul-clara"), { params: Promise.resolve({ id: "sul-clara" }) });
    expect(logo.status).toBe(200);
    expect(logo.headers.get("content-type")).toBe("image/png");
    const wrongOrigin = await POST(new Request(origin + "/estampas/dados", { method: "POST", headers: { Origin: "https://other.example.test" }, body: "x" }));
    expect(wrongOrigin.status).toBe(403);
    const form = new FormData(); form.set("kind", "template");
    expect((await POST(new Request(origin + "/estampas/dados", { method: "POST", headers: { Origin: origin }, body: form }))).status).toBe(403);
    expect(state.save).not.toHaveBeenCalled();
    expect((await getFile(request(), { params: Promise.resolve({ id: "example", file: "art.png" }) })).status).toBe(404);
    expect(state.read).not.toHaveBeenCalled();
  });
  it("a sessão do editor não autentica a pessoa no painel", async () => {
    authenticate();
    expect(await currentActor({ mode: "prod" } as Parameters<typeof currentActor>[0])).toBeNull();
    expect(state.lookupAdmin).not.toHaveBeenCalled();
  });
  it("entra com senha, limita o cookie ao editor e encerra a sessão", async () => {
    const response = await login(loginRequest());
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(origin + "/estampas");
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain("__Secure-uo_print_studio=");
    expect(cookie).toContain("Path=/estampas");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie.toLowerCase()).toContain("samesite=strict");
    expect(cookie).not.toContain("uo_admin");
    const ended = await logout(new Request(origin + "/estampas/sair", { method: "POST", headers: { Origin: origin } }));
    expect(ended.headers.get("set-cookie")).toContain("Max-Age=0");
  });
  it("recusa senha errada, origem falsa e excesso de tentativas", async () => {
    expect((await login(loginRequest("errada"))).headers.get("location")).toContain("erro=credenciais");
    expect((await login(loginRequest("Teste-de-acesso-12345", "https://other.example.test"))).status).toBe(403);
    for (let i = 0; i < 9; i++) await login(loginRequest("errada"));
    expect((await login(loginRequest())).headers.get("location")).toContain("erro=limite");
    expect((await logout(new Request(origin + "/estampas/sair", { method: "POST" }))).status).toBe(403);
  });
});

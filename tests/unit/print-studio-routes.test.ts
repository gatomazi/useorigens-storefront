import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPreset } from "@/lib/print-studio/model";
import { printStore } from "@/lib/print-studio/server-store";

const auth = vi.hoisted(() => ({ signedIn: true, owner: true, surface: true, store: null as unknown as ReturnType<typeof printStore> }));
vi.mock("@/lib/admin/auth/guard", () => ({
  requireAdmin: vi.fn(async (options: { owner?: boolean } = {}) => {
    if (!auth.signedIn || (options.owner && !auth.owner)) throw new Error("Acesso negado");
    return { id: "test", name: "Ateliê", email: "atelier@example.test", role: auth.owner ? "owner" : "editor" };
  }),
  adminSurface: async () => auth.surface ? { mode: "dev" } : null,
  currentActor: async () => auth.signedIn ? { id: "test" } : null,
}));
vi.mock("@/lib/print-studio/server", () => ({ serverPrintStore: () => auth.store }));

import { GET, POST } from "@/app/admin/estampas/dados/route";
import { GET as getFile } from "@/app/admin/estampas/arquivos/[id]/[file]/route";
import { requireAdmin } from "@/lib/admin/auth/guard";

describe("API autenticada do estúdio", () => {
  let directory: string;
  let png: Buffer;
  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "origens-stamps-api-"));
    auth.store = printStore(directory);
    png = await sharp({ create: { width: 4270, height: 4900, channels: 4, background: "transparent" } }).png().toBuffer();
  });
  beforeEach(() => { auth.signedIn = true; auth.owner = true; auth.surface = true; vi.clearAllMocks(); });
  afterAll(async () => { await rm(directory, { recursive: true, force: true }); });
  function saveRequest(kind = "art") {
    const form = new FormData();
    form.set("kind", kind);
    form.set("project", JSON.stringify(createPreset("peleia")));
    form.set("png", new File([new Uint8Array(png)], "art.png", { type: "image/png" }));
    return new Request("https://studio.example.test/admin/estampas/dados", { method: "POST", body: form });
  }

  it("envia, lista, reabre e baixa a arte do armazenamento do servidor", async () => {
    const response = await POST(saveRequest());
    expect(response.status).toBe(201);
    expect(requireAdmin).toHaveBeenCalledWith({ mutation: true });
    const { item } = await response.json();
    const list = await GET();
    expect(list.headers.get("cache-control")).toBe("private, no-store");
    expect((await list.json()).items.map((i: { id: string }) => i.id)).toContain(item.id);
    const project = await getFile(new Request("https://studio.example.test/project.json"), { params: Promise.resolve({ id: item.id, file: "project.json" }) });
    expect(await project.json()).toEqual(createPreset("peleia"));
    const download = await getFile(new Request("https://studio.example.test/art.png?download=1"), { params: Promise.resolve({ id: item.id, file: "art.png" }) });
    expect(download.status).toBe(200);
    expect(download.headers.get("content-disposition")).toBe('attachment; filename="quem-peleia.png"');
    expect(await sharp(new Uint8Array(await download.arrayBuffer())).metadata()).toMatchObject({ width: 4270, height: 4900, hasAlpha: true, density: 300 });
  });

  it("mantém arquivos privados e não grava sem autenticação ou permissão para modelos", async () => {
    const before = await auth.store.list();
    auth.signedIn = false;
    await expect(POST(saveRequest())).rejects.toThrow("Acesso negado");
    await expect(GET()).rejects.toThrow("Acesso negado");
    const file = await getFile(new Request("https://studio.example.test/art.png"), { params: Promise.resolve({ id: before[0].id, file: "art.png" }) });
    expect(file.status).toBe(404);
    auth.signedIn = true;
    auth.owner = false;
    await expect(POST(saveRequest("template"))).rejects.toThrow("Acesso negado");
    expect(requireAdmin).toHaveBeenCalledWith({ owner: true, mutation: true });
    expect(await auth.store.list()).toEqual(before);
    auth.surface = false;
    expect((await getFile(new Request("https://studio.example.test/art.png"), { params: Promise.resolve({ id: before[0].id, file: "art.png" }) })).status).toBe(404);
  });

  it("recusa uploads grandes antes de ler o corpo e recusa nomes de arquivo arbitrários", async () => {
    const response = await POST(new Request("https://studio.example.test/data", { method: "POST", headers: { "Content-Length": "100000000" }, body: "x" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("limite");
    const file = await getFile(new Request("https://studio.example.test/file"), { params: Promise.resolve({ id: "../../..", file: "metadata.json" }) });
    expect(file.status).toBe(404);
  });
});

import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPreset } from "@/lib/print-studio/model";
import { printStore } from "@/lib/print-studio/server-store";

describe("persistência de estampas no servidor", () => {
  let directory: string;
  let png: Buffer;
  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "origens-stamps-test-"));
    png = await sharp({ create: { width: 4270, height: 4900, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: Buffer.from('<svg width="100" height="100"><rect width="100" height="100" fill="#790b1b"/></svg>'), left: 100, top: 100 }]).png().toBuffer();
  });
  afterAll(async () => { await rm(directory, { recursive: true, force: true }); });

  it("salva arte e modelo sem perder dimensões, transparência ou recursos editáveis", async () => {
    const project = createPreset("peleia");
    project.fonts = [{ id: "font-test", name: "Fonte original", dataUrl: "data:application/octet-stream;base64,AA==" }];
    const store = printStore(directory);
    const saved = await store.save({ project, png, kind: "art", createdBy: "Ateliê" });
    const reopened = printStore(directory);
    expect((await reopened.list()).find((i) => i.id === saved.id)).toEqual(saved);
    expect(JSON.parse((await reopened.read(saved.id, "project.json"))!.toString())).toEqual(project);
    const art = (await reopened.read(saved.id, "art.png"))!;
    expect(await sharp(art).metadata()).toMatchObject({ width: 4270, height: 4900, density: 300, hasAlpha: true });
    const transparent = await sharp(art).extract({ left: 4000, top: 4500, width: 1, height: 1 }).raw().toBuffer();
    expect(transparent[3]).toBe(0);
    const printed = await sharp(art).extract({ left: 120, top: 120, width: 1, height: 1 }).raw().toBuffer();
    expect([...printed]).toEqual([121, 11, 27, 255]);
    expect(await sharp((await reopened.read(saved.id, "preview.webp"))!).metadata()).toMatchObject({ width: 640, hasAlpha: true });
  });

  it("preserva salvamentos simultâneos como versões independentes", async () => {
    const store = printStore(directory);
    const project = createPreset("celebrar");
    const [a, b] = await Promise.all([store.save({ project, png, kind: "art", createdBy: "Ela" }), store.save({ project, png, kind: "template", createdBy: "Ele" })]);
    expect(a.id).not.toBe(b.id);
    const ids = (await store.list()).map((i) => i.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
    expect((await readdir(directory)).some((name) => name.startsWith(".saving-"))).toBe(false);
  });

  it("recusa dimensão incorreta e não escreve um salvamento parcial", async () => {
    const store = printStore(directory);
    const before = await store.list();
    await expect(store.save({ project: { ...createPreset("peleia"), width: 4000 }, png, kind: "art", createdBy: "Teste" })).rejects.toThrow("4270");
    const tiny = await sharp({ create: { width: 10, height: 10, channels: 4, background: "transparent" } }).png().toBuffer();
    await expect(store.save({ project: createPreset("peleia"), png: tiny, kind: "art", createdBy: "Teste" })).rejects.toThrow("4270");
    await expect(store.save({ project: { ...createPreset("peleia"), background: "#000000" }, png, kind: "art", createdBy: "Teste" })).rejects.toThrow("transparente");
    expect(await store.list()).toEqual(before);
    expect(await store.read("../../package.json", "project.json")).toBeNull();
  });
});

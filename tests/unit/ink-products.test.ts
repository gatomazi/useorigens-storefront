import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { InkRequestError, type InkProductClient, type InkProductView } from "@/lib/customization/ink-product-client";
import { inkArts, productJobKey, productName, publicJob, safeInkUrl, type NewProductJob, type PrintArea, type ProductJobStore } from "@/lib/customization/ink-products";
import { fileProductJobStore } from "@/lib/customization/product-store";
import { PHOTO_WAIT_MS, retryDelayMs, runProductJob, type WorkerDeps } from "@/lib/customization/product-worker";
import { needsReview } from "@/lib/customization/review-words";
import { inkColorTakesDarkInk, SHIRT_COLORS, shirtColorsFor } from "@/lib/customization/shirts";

const CAMISETA = ["Vermelho", "Amarelo", "Rosa", "Branca", "Cinza", "Bordeaux", "Marinho", "Verde", "Preta"];
const areas: PrintArea[] = ["Masculino", "Feminino"].flatMap((model, m) => CAMISETA.map((name, c) => ({ base_image_id: 100 * m + c, color: { name }, model })));
const DARK = Buffer.from("dark-ink-art");
const LIGHT = Buffer.from("light-ink-art");

describe("colours: one table for the preview and the product", () => {
  test("white, grey and yellow take the dark-ink art, the other six the light-ink art (pilot 5143876, owner's rule for yellow)", () => {
    expect(CAMISETA.filter((c) => inkColorTakesDarkInk(c))).toEqual(["Amarelo", "Branca", "Cinza"]);
    expect(SHIRT_COLORS.filter((c) => c.light).map((c) => c.id)).toEqual(["branca", "cinza", "amarela"]);
    expect(inkColorTakesDarkInk("Lilás")).toBeNull();
  });
  test("the Camiseta Infantil comes in six colours (INK type 2)", () => {
    expect(shirtColorsFor(true).map((c) => c.ink).sort()).toEqual(["Amarelo", "Bordeaux", "Branca", "Cinza", "Marinho", "Preta"]);
    expect(shirtColorsFor(false)).toHaveLength(9);
  });
  test("every print area gets an art, by colour", () => {
    const arts = inkArts(areas, DARK, LIGHT);
    expect(arts).toHaveLength(18);
    const by = (name: string) => arts.filter((_, i) => areas[i].color?.name === name).map((a) => Buffer.from(a.art_attachment, "base64").toString());
    expect(by("Branca")).toEqual(["dark-ink-art", "dark-ink-art"]);
    expect(by("Amarelo")).toEqual(["dark-ink-art", "dark-ink-art"]);
    expect(by("Preta")).toEqual(["light-ink-art", "light-ink-art"]);
  });
  test("an area of a colour outside the table stops everything instead of guessing", () => {
    expect(() => inkArts([...areas, { base_image_id: 999, color: { name: "Lilás" } }], DARK, LIGHT)).toThrow(/Lilás/);
    expect(() => inkArts([], DARK, LIGHT)).toThrow();
  });
});

describe("naming, reuse and links", () => {
  const base = { region: "sul" as const, templateId: "t-dark", lightTemplateId: "t-light", garment: "camiseta" as const };
  test("the same printed text on the same art version is the same product; spaces do not matter", () => {
    expect(productJobKey({ ...base, printed: ["SILVA"] })).toBe(productJobKey({ ...base, printed: [" SILVA "] }));
    expect(productJobKey({ ...base, printed: ["SILVA"] })).not.toBe(productJobKey({ ...base, printed: ["Silva"] }));
    expect(productJobKey({ ...base, printed: ["SILVA"] })).not.toBe(productJobKey({ ...base, garment: "infantil", printed: ["SILVA"] }));
    expect(productJobKey({ ...base, printed: ["SILVA"] })).not.toBe(productJobKey({ ...base, lightTemplateId: null, printed: ["SILVA"] }));
  });
  test("the INK title is what was typed, the model and the art", () => {
    expect(productName({ sobrenome: "Silva" }, "Natal em família", "Universitário")).toBe("Silva | Natal em família Universitário");
    expect(productName({ sobrenome: "x".repeat(200) }, "M", "A").length).toBe(120);
  });
  test("only https links on our INK stores are ever given to the customer", () => {
    expect(safeInkUrl("https://loja.useorigens.com.br/useorigens/product/silva")).toBe("https://loja.useorigens.com.br/useorigens/product/silva");
    for (const bad of ["http://loja.useorigens.com.br/x", "https://evil.example/x", "https://u:p@loja.useorigens.com.br/x", "javascript:alert(1)", null]) expect(safeInkUrl(bad)).toBeNull();
  });
});

describe("names that go to the team first", () => {
  test.each(["porra", "P0RRA", "p o r r a", "Família Merda", "www.site.com", "Siiilva caralhoooo", "nazi"])("%s", (text) => expect(needsReview(text)).toBe(true));
  test.each(["Silva", "Cunha", "Pinto", "dos Santos", "Costa e Silva", "Albuquerque Vasconcelos", "Puttini", "Cardoso"])("%s passes", (text) => expect(needsReview(text)).toBe(false));
});

// ── The worker, with a scripted INK and a virtual clock ─────────────────────────────────────────────────────────────

type Script = { create?: (n: number) => InkProductView | Error; get?: (n: number) => InkProductView | Error; areas?: PrintArea[] };
function scriptedInk(script: Script) {
  const calls = { create: [] as { body: Record<string, unknown>; key: string }[], get: 0 };
  const client: InkProductClient = {
    live: false,
    printableAreas: async () => script.areas ?? areas,
    async createProduct(body, key) {
      calls.create.push({ body, key });
      const r = script.create ? script.create(calls.create.length) : { id: "5143876", url: "https://loja.useorigens.com.br/useorigens/product/silva", imageUrl: null };
      if (r instanceof Error) throw r;
      return r;
    },
    async getProduct(id) {
      calls.get++;
      const r = script.get ? script.get(calls.get) : { id, url: "https://loja.useorigens.com.br/useorigens/product/silva", imageUrl: calls.get >= 3 ? "https://img.example/silva.jpg" : null };
      if (r instanceof Error) throw r;
      return r;
    },
  };
  return { client, calls };
}

let dir: string;
let store: ProductJobStore;
let clock: number;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "uo-products-"));
  store = fileProductJobStore(path.join(dir, "products.json"));
  clock = Date.parse("2026-12-01T12:00:00Z");
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const NEW: NewProductJob = { dedupeKey: "a".repeat(64), region: "sul", customizerId: "cz-1", customizerSlug: "natal", name: "Silva | Natal em família Universitário", artLabel: "Universitário", fields: { sobrenome: "Silva" }, templateId: "t-dark", lightTemplateId: "t-light", garment: "camiseta", productTypeId: 1, price: "109.90" };
const deps = (client: InkProductClient, over: Partial<WorkerDeps> = {}): WorkerDeps => ({
  store, client, render: async () => ({ darkInk: DARK, lightInk: LIGHT }), now: () => new Date(clock), sleep: async (ms) => { clock += ms; }, ...over,
});
const describeJob = () => ({ description: "d", tags: ["personalizado"] });

describe("making a product", () => {
  test("draws, creates it hidden with the job id as the key, waits for the photo and is ready", async () => {
    const { job } = await store.findOrCreate(NEW);
    const { client, calls } = scriptedInk({});
    await runProductJob(job.id, deps(client), describeJob);
    const done = (await store.get(job.id))!;
    expect(done).toMatchObject({ status: "ready", inkProductId: "5143876", inkUrl: "https://loja.useorigens.com.br/useorigens/product/silva", inkImageUrl: "https://img.example/silva.jpg", leaseUntil: null });
    expect(calls.create).toHaveLength(1);
    expect(calls.create[0].key).toBe(job.id);
    expect(calls.create[0].body).toMatchObject({ product_type_id: 1, name: NEW.name, price: "109.90", visible_in_store: false });
    expect((calls.create[0].body.arts as unknown[]).length).toBe(18);
    expect(publicJob(done)).toEqual({ id: job.id, label: "Universitário", status: "ready", url: done.inkUrl, image: done.inkImageUrl });
  });

  test("two runs at once create ONE product: the second finds the job held", async () => {
    const { job } = await store.findOrCreate(NEW);
    const { client, calls } = scriptedInk({});
    await Promise.all([runProductJob(job.id, deps(client), describeJob), runProductJob(job.id, deps(client), describeJob)]);
    expect(calls.create).toHaveLength(1);
  });

  test("a run whose lease expired while the first one worked never creates a second product", async () => {
    const { job } = await store.findOrCreate(NEW);
    const { client, calls } = scriptedInk({});
    const slow: InkProductClient = { ...client, async createProduct(body, key) { clock += 4 * 60_000; return client.createProduct(body, key); } };
    const d = deps(slow, { render: async () => { clock += 4 * 60_000; return { darkInk: DARK, lightInk: LIGHT }; } });
    await Promise.all([runProductJob(job.id, d, describeJob), runProductJob(job.id, d, describeJob)]);
    expect(calls.create).toHaveLength(1);
    expect(await store.get(job.id)).toMatchObject({ status: "ready", inkProductId: "5143876" });
  });

  test("a second customer with the same name lands on the same job", async () => {
    const a = await store.findOrCreate(NEW);
    const b = await store.findOrCreate(NEW);
    expect(b).toEqual({ job: a.job, created: false });
  });

  test("without the photo in a minute, the customer goes anyway with the link", async () => {
    const { job } = await store.findOrCreate(NEW);
    const { client } = scriptedInk({ get: () => ({ id: "5143876", url: "https://loja.useorigens.com.br/useorigens/product/silva", imageUrl: null }) });
    const start = clock;
    await runProductJob(job.id, deps(client), describeJob);
    expect(await store.get(job.id)).toMatchObject({ status: "ready", inkImageUrl: null });
    expect(clock - start).toBeGreaterThanOrEqual(PHOTO_WAIT_MS);
  });

  test("INK busy (429/5xx/network): back in the queue, retried later with the SAME key", async () => {
    const { job } = await store.findOrCreate(NEW);
    const { client, calls } = scriptedInk({ create: (n) => (n === 1 ? new InkRequestError("POST → 503", 503, true) : { id: "5143876", url: "https://loja.useorigens.com.br/useorigens/product/silva", imageUrl: "https://img.example/x.jpg" }) });
    await runProductJob(job.id, deps(client), describeJob);
    const waiting = (await store.get(job.id))!;
    expect(waiting).toMatchObject({ status: "queued", attempts: 1 });
    expect(Date.parse(waiting.leaseUntil!) - clock).toBe(retryDelayMs(1));
    await runProductJob(job.id, deps(client), describeJob); // too soon: the pause holds it
    expect(calls.create).toHaveLength(1);
    clock += retryDelayMs(1) + 1;
    await runProductJob(job.id, deps(client), describeJob);
    expect(await store.get(job.id)).toMatchObject({ status: "ready" });
    expect(calls.create.map((c) => c.key)).toEqual([job.id, job.id]);
  });

  test("a 409 'indeterminate' never gets a new key: a person checks the store", async () => {
    const { job } = await store.findOrCreate(NEW);
    const { client, calls } = scriptedInk({ create: () => new InkRequestError("POST → 409: idempotency key", 409, false, true) });
    await runProductJob(job.id, deps(client), describeJob);
    expect(await store.get(job.id)).toMatchObject({ status: "check" });
    await runProductJob(job.id, deps(client), describeJob);
    expect(calls.create).toHaveLength(1);
  });

  test("a failure after INK holds the product goes to the team, never back to the queue", async () => {
    const { job } = await store.findOrCreate(NEW);
    const { client } = scriptedInk({ get: () => new InkRequestError("GET → 404", 404, false) });
    await runProductJob(job.id, deps(client), describeJob);
    expect(await store.get(job.id)).toMatchObject({ status: "check", inkProductId: "5143876" });
  });

  test("a colour without a rule fails before anything is sent", async () => {
    const { job } = await store.findOrCreate(NEW);
    const { client, calls } = scriptedInk({ areas: [{ base_image_id: 1, color: { name: "Lilás" } }] });
    await runProductJob(job.id, deps(client), describeJob);
    expect(await store.get(job.id)).toMatchObject({ status: "failed" });
    expect(calls.create).toHaveLength(0);
  });
});

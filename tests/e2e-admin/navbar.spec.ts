import { expect, test, type Page } from "@playwright/test";

/**
 * The CMS side of the INK navbar, end to end in a real browser (sandbox in a temp dir, like the round trip): a PUBLIC collection is shown in the
 * navbar from the collections library → the publish screen sees the change (a navbar-only edit must be publishable) → after publishing, the
 * public `/api/navbar/sul` lists it → an INTERNAL collection cannot be offered → removing it and publishing again empties the list. Nothing
 * of the Worker is involved: this is the "no Worker deploy to change the menu" path. Needs the locally synced INK collections.
 */
const hydrated = (page: Page) => page.waitForFunction(() => document.documentElement.dataset.hydrated === "true", undefined, { timeout: 180_000 });
async function open(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 300_000 });
  await hydrated(page);
}
const navbar = async (page: Page) => ((await (await page.request.get("/api/navbar/sul")).json()) as { v: number; region: string; collections: { name: string; slug: string }[] });
const row = (page: Page, name: string) => page.locator("table.a-table tbody tr", { hasText: name });

test("given the local CMS, when a public collection is shown in the INK navbar and published, then the public config lists it; hiding it and publishing removes it", async ({ page }) => {
  expect((await navbar(page)).collections, "nothing configured: empty list, never an error").toEqual([]);

  await open(page, "/admin/colecoes?q=seu+lugar");
  const seuLugar = row(page, "Seu Lugar");
  await expect(seuLugar, "no synced collections: run `npm run collections:sync` first").toHaveCount(1);
  await expect(seuLugar).toContainText("Pública");
  await seuLugar.getByRole("button", { name: "Mostrar" }).click();
  await expect(page.getByText(/“Seu Lugar” vai aparecer na navbar da INK depois que você publicar/)).toBeVisible();
  await expect(row(page, "Seu Lugar")).toContainText("Na navbar");
  expect((await navbar(page)).collections, "a draft is not public").toEqual([]);

  // An internal collection has no public page: it cannot be offered.
  await open(page, "/admin/colecoes?q=fe+de+origem");
  await expect(row(page, "Fé de Origem")).toContainText("Indisponível");
  await expect(row(page, "Fé de Origem").getByRole("button", { name: "Mostrar" })).toHaveCount(0);

  // A navbar-only change is publishable and says what changes.
  await open(page, "/admin/publicar");
  await expect(page.getByText('"Seu Lugar" passa a aparecer na navbar da INK')).toBeVisible();
  await page.getByLabel(/Nota da publicação/).fill("navbar da INK: Seu Lugar");
  await page.getByRole("button", { name: "Publicar no sandbox local" }).click();
  await expect(page.getByText(/Publicado no sandbox local/)).toBeVisible({ timeout: 300_000 });
  await expect.poll(async () => (await navbar(page)).collections, { timeout: 60_000 }).toEqual([{ name: "Seu Lugar", slug: "seu-lugar" }]);
  expect(await navbar(page)).toMatchObject({ v: 1, region: "sul" });
  const unknownRegion = await page.request.get("/api/navbar/mars");
  expect(unknownRegion.status()).toBe(404);

  // Hide it again: same path, the list empties without touching anything else.
  await open(page, "/admin/colecoes?q=seu+lugar");
  await row(page, "Seu Lugar").getByRole("button", { name: "Tirar" }).click();
  await expect(page.getByText(/“Seu Lugar” sai da navbar da INK depois que você publicar/)).toBeVisible();
  await open(page, "/admin/publicar");
  await expect(page.getByText('"Seu Lugar" sai da navbar da INK')).toBeVisible();
  await page.getByRole("button", { name: "Publicar no sandbox local" }).click();
  await expect(page.getByText(/Publicado no sandbox local/)).toBeVisible({ timeout: 300_000 });
  await expect.poll(async () => (await navbar(page)).collections, { timeout: 60_000 }).toEqual([]);
});

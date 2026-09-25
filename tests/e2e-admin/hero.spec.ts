import { expect, test, type Page } from "@playwright/test";

/**
 * The hero's three configurable product cards per region (dev server, sandbox in a temp dir): pick real products of the region's own INK store,
 * see them in the 375 px and desktop preview, reorder / clear, refuse another store, save as draft, publish to the sandbox, restore, and check that
 * the other regions (and Sul's original three cards) are untouched. Uses the locally synced catalogs.
 */
const hydrated = (page: Page) => page.waitForFunction(() => document.documentElement.dataset.hydrated === "true", undefined, { timeout: 180_000 });
async function open(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 300_000 });
  await hydrated(page);
}
async function chooseRegion(page: Page, name: "Sul" | "Norte" | "Centro-Oeste") {
  await open(page, "/admin");
  await page.getByRole("form", { name: "Região em edição" }).getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await expect(page.getByRole("form", { name: "Região em edição" }).getByRole("button", { name: new RegExp(`^${name}`) })).toHaveAttribute("aria-pressed", "true");
}
const flash = (page: Page, text: RegExp) => page.getByRole("status").locator("p", { hasText: text });
const positions = (page: Page) => page.getByRole("list").filter({ has: page.getByText("Posição 1") }).locator("> li");
const previewCards = (page: Page, kind: "mobile" | "desktop") => page.frameLocator(`iframe[data-preview="${kind}"]`).locator('section[aria-labelledby="hero-title"] ul li a');

async function pick(page: Page, index: number, query: string) {
  const slot = positions(page).nth(index);
  await slot.getByRole("button", { name: /Escolher produto|Substituir/ }).click();
  await slot.getByLabel(/Buscar por cidade/).fill(query);
  const first = slot.getByRole("list", { name: "Resultados" }).getByRole("button", { name: "Usar aqui" }).first();
  await expect(first).toBeVisible({ timeout: 60_000 });
  // The flash text is the same after every save, so wait for the save itself: the server action's POST, then the settled page.
  const saved = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/admin/home/"), { timeout: 120_000 });
  await first.click();
  await saved;
  await expect(slot).toContainText("Disponível na loja");
  await page.waitForLoadState("networkidle");
  await hydrated(page);
}

test.describe.configure({ mode: "serial" });

test("given Norte, when three real products are chosen for the hero, then the preview, draft, publication and restore all keep them and no other region changes", async ({ page }) => {
  const sulHero = async () => (await (await page.request.get("/sul", { timeout: 300_000 })).text()).match(/<section[^>]*aria-labelledby="hero-title"[\s\S]*?<\/section>/)![0];
  const sulBefore = await sulHero();

  await chooseRegion(page, "Norte");
  await open(page, "/admin/home");
  if (await page.getByRole("button", { name: "Criar home inicial" }).isVisible()) {
    await page.getByRole("button", { name: "Criar home inicial" }).click();
    await expect(flash(page, /Home inicial criada/)).toBeVisible();
  }
  await open(page, "/admin/home/seed-hero");
  await expect(page.getByRole("group", { name: "Produtos em destaque" })).toBeVisible();
  await expect(positions(page)).toHaveCount(3);
  await expect(page.getByText(/Nenhum card escolhido/)).toBeVisible();
  expect(await previewCards(page, "desktop").count()).toBe(0);

  // Three real Norte products, one position at a time (each choice is saved as a draft and the preview follows).
  await pick(page, 0, "belem ponto");
  await pick(page, 1, "belem coordenadas");
  await pick(page, 2, "xambioa tipografia");
  for (const kind of ["mobile", "desktop"] as const) {
    await expect(previewCards(page, kind), `${kind} preview`).toHaveCount(3, { timeout: 300_000 });
    for (const href of await previewCards(page, kind).evaluateAll((els) => els.map((e) => e.getAttribute("href")))) expect(href).toMatch(/^\/norte\/[a-z]{2}\/[a-z0-9-]+\/[a-z-]+$/);
  }

  if (process.env.CMS_CAPTURE_DIR) {
    // Captures for the report: the hero preview at 375 px and desktop with the three cards.
    await page.locator('iframe[data-preview="mobile"]').screenshot({ path: `${process.env.CMS_CAPTURE_DIR}/hero-norte-375.png` });
    await page.locator('iframe[data-preview="desktop"]').screenshot({ path: `${process.env.CMS_CAPTURE_DIR}/hero-norte-desktop.png` });
  }

  // Another store's product is refused, nothing is saved.
  await page.evaluate(() => {
    const form = document.querySelector('input[name="featured_mode"]')!.closest("form") as HTMLFormElement;
    (form.elements.namedItem("featured_1") as HTMLInputElement).value = "use-sul:1";
    form.requestSubmit();
  });
  await expect(flash(page, /outra loja|não pode ser usado/)).toBeVisible({ timeout: 120_000 });

  // Persisted across a reload; reorder and clear.
  await open(page, "/admin/home/seed-hero");
  const card = async (i: number) => (await positions(page).nth(i).innerText()).replace(/POSIÇÃO \d/i, "").replace(/\s+/g, " ").trim();
  const firstBefore = await card(0);
  const moved = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/admin/home/"), { timeout: 120_000 });
  await positions(page).nth(0).getByRole("button", { name: /Mover a posição 1 para baixo/ }).click();
  await moved;
  await page.waitForLoadState("networkidle");
  await hydrated(page);
  expect(await card(1)).toBe(firstBefore);
  await open(page, "/admin/home/seed-hero"); // persisted: the order survives a reload
  expect(await card(1)).toBe(firstBefore);
  await open(page, "/admin/publicar");
  await page.getByLabel(/Nota da publicação/).fill("hero A");
  await page.getByRole("button", { name: "Publicar no sandbox local" }).click();
  await expect(flash(page, /Publicado no sandbox local/)).toBeVisible({ timeout: 300_000 });

  await open(page, "/admin/home/seed-hero");
  const cleared = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/admin/home/"), { timeout: 120_000 });
  await positions(page).nth(2).getByRole("button", { name: /Limpar a posição 3/ }).click();
  await cleared;
  await page.waitForLoadState("networkidle");
  await hydrated(page);
  await expect(previewCards(page, "desktop")).toHaveCount(2, { timeout: 300_000 }); // 2 cards: the grid adapts, no empty column
  await open(page, "/admin/publicar");
  await page.getByLabel(/Nota da publicação/).fill("hero B");
  await page.getByRole("button", { name: "Publicar no sandbox local" }).click();
  await expect(flash(page, /Publicado no sandbox local/)).toBeVisible({ timeout: 300_000 });

  // Restore the release with three cards.
  await page.locator("tbody tr", { hasText: "hero A" }).getByRole("button", { name: "Restaurar Norte" }).click().catch(async () => {
    // the note lives in the history table; the button is on the row of the release
    await page.locator("tbody tr").filter({ hasText: /Publicação/ }).nth(1).getByRole("button", { name: "Restaurar Norte" }).click();
  });
  await expect(flash(page, /Norte: versão \d+ restaurada/)).toBeVisible({ timeout: 300_000 });
  await open(page, "/admin/home/seed-hero");
  await expect(previewCards(page, "desktop")).toHaveCount(3, { timeout: 300_000 });

  // Isolation: Centro-Oeste's hero has no cards; Sul's hero (the code's original three cards) is byte-identical and still read-only.
  await chooseRegion(page, "Centro-Oeste");
  await open(page, "/admin/home");
  if (await page.getByRole("button", { name: "Criar home inicial" }).isVisible()) {
    await page.getByRole("button", { name: "Criar home inicial" }).click();
    await expect(flash(page, /Home inicial criada/)).toBeVisible();
  }
  await open(page, "/admin/home/seed-hero");
  await expect(page.getByText(/Nenhum card escolhido/)).toBeVisible();
  await chooseRegion(page, "Sul");
  await open(page, "/admin/home/seed-hero");
  await expect(page.getByText(/definidos no código/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Personalizar a partir destes três" })).toBeVisible();
  expect(await sulHero()).toBe(sulBefore);
});

test("given Centro-Oeste, when a product is chosen, then only Centro-Oeste products are offered", async ({ page }) => {
  await chooseRegion(page, "Centro-Oeste");
  await open(page, "/admin/home/seed-hero");
  await pick(page, 0, "campo grande");
  await expect(previewCards(page, "desktop")).toHaveCount(1, { timeout: 300_000 });
  expect(await previewCards(page, "desktop").first().getAttribute("href")).toMatch(/^\/centro-oeste\//);
  // Searching for a Norte city finds nothing in this store.
  await positions(page).nth(1).getByRole("button", { name: /Escolher produto/ }).click();
  await positions(page).nth(1).getByLabel(/Buscar por cidade/).fill("belem");
  await expect(page.getByText(/Nenhum produto elegível encontrado/)).toBeVisible({ timeout: 60_000 });
});

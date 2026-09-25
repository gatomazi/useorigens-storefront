import { expect, test, type Page } from "@playwright/test";

/**
 * The three structured home components (city styles, state chooser, regional campaign) as CMS models, per region (dev server, sandbox in a
 * temp dir): Home → Adicionar seção → model → edit → save draft → 375 px and desktop preview → publish to the sandbox → restore.
 * Uses the locally synced catalogs of the three stores. Runs after roundtrip.spec.ts / scopes.spec.ts, which it does not depend on.
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
const models = (page: Page) => page.getByRole("list", { name: "Componentes da home" });

async function ensureHome(page: Page) {
  await open(page, "/admin/home");
  const create = page.getByRole("button", { name: "Criar home inicial" });
  if (await create.isVisible()) {
    await create.click();
    await expect(flash(page, /Home inicial criada/)).toBeVisible();
  }
}

test.describe.configure({ mode: "serial" });

for (const region of [{ name: "Norte" as const, slug: "norte", uf: "pa" }, { name: "Centro-Oeste" as const, slug: "centro-oeste", uf: "go" }]) {
  test(`given ${region.name}, when the three structured models are added, edited, previewed and published, then only ${region.name} changes`, async ({ page }) => {
    const sulBefore = await (await page.request.get("/sul", { timeout: 300_000 })).text();
    await chooseRegion(page, region.name);
    await ensureHome(page);

    // The models are offered with their purpose and the region's real-data status; nothing is inserted by itself.
    await expect(models(page)).toContainText("Estilos da cidade");
    await expect(models(page)).toContainText("Escolha seu estado");
    await expect(models(page)).toContainText("Campanha regional");
    const sectionsBefore = await page.locator("table.a-table tbody tr").count();

    // A. City styles: add → neutral title for this region → edit → save.
    if (await models(page).getByRole("button", { name: "Adicionar Estilos da cidade" }).isVisible()) {
      await models(page).getByRole("button", { name: "Adicionar Estilos da cidade" }).click();
      await expect(page).toHaveURL(/\/admin\/home\/custom-[0-9a-f]+/);
      await expect(page.getByLabel("Título", { exact: true })).toHaveValue("Sua cidade, do seu jeito."); // never "8 jeitos" outside Sul
      await page.getByLabel("Título", { exact: true }).fill(`Sua cidade no ${region.name}`);
      await page.getByLabel("Quantos estilos mostrar").fill("4");
      await page.getByRole("button", { name: "Salvar rascunho" }).click();
      await expect(flash(page, /Rascunho salvo/)).toBeVisible();
      await expect(page.getByText("Dados reais desta região")).toBeVisible();
      for (const kind of ["mobile", "desktop"] as const) {
        const frame = page.frameLocator(`iframe[data-preview="${kind}"]`);
        await expect(frame.locator("section#estilos h2"), `${kind} preview`).toHaveText(`Sua cidade no ${region.name}`, { timeout: 300_000 });
        const cards = frame.locator("section#estilos li");
        expect(await cards.count()).toBeLessThanOrEqual(4);
        expect(await frame.locator("section#estilos a[href*='usesul.com.br']").count(), "never Sul's store").toBe(0);
      }
    }
    await open(page, "/admin/home");
    // Once it exists, it cannot be added again: the model offers "Ir para a seção".
    await expect(models(page).getByRole("button", { name: "Adicionar Estilos da cidade" })).toHaveCount(0);
    await expect(models(page).getByRole("link", { name: /Ir para a seção/ }).first()).toBeVisible();

    // B. State chooser: added when the region has none, edited when the seed already made one.
    if (await models(page).getByRole("button", { name: "Adicionar Escolha seu estado" }).isVisible()) {
      await models(page).getByRole("button", { name: "Adicionar Escolha seu estado" }).click();
    } else {
      const states = page.locator("table.a-table tbody tr", { hasText: "Escolha o seu estado" });
      await states.getByRole("link", { name: "Editar" }).click();
    }
    await hydrated(page);
    await page.getByLabel("Título", { exact: true }).fill(`Escolha o estado do ${region.name}`);
    await page.getByLabel("Subtítulo").fill("Cada estado com as cidades que já têm camiseta.");
    await page.getByRole("button", { name: "Salvar rascunho" }).click();
    await expect(flash(page, /Rascunho salvo/)).toBeVisible();
    for (const kind of ["mobile", "desktop"] as const) {
      const frame = page.frameLocator(`iframe[data-preview="${kind}"]`);
      await expect(frame.locator("section[id^='estados'] h2").first(), `${kind} preview`).toHaveText(`Escolha o estado do ${region.name}`, { timeout: 300_000 });
      await expect(frame.locator("section[id^='estados']").first()).toContainText("Cada estado com as cidades");
      expect(await frame.locator(`section[id^='estados'] a[href^='/${region.slug}/']`).count()).toBeGreaterThan(0); // links stay inside the region
      expect(await frame.locator("section[id^='estados'] a[href^='/sul/']").count()).toBe(0);
    }

    // C. Regional campaign: add → neutral copy (no Sul text) → edit with a button to a page of THIS region → save.
    await open(page, "/admin/home");
    await models(page).getByRole("button", { name: /^Adicionar( outra)? Campanha regional$/ }).click();
    await expect(page).toHaveURL(/\/admin\/home\/custom-[0-9a-f]+/);
    expect(await page.getByLabel("Título", { exact: true }).inputValue()).not.toMatch(/Sul/);
    await page.getByLabel("Título", { exact: true }).fill(`Sua cidade fala ${region.name}`);
    await page.getByLabel("Subtítulo").fill("Busque a camiseta do seu lugar.");
    await page.getByLabel("Destino", { exact: true }).selectOption("route");
    await page.getByLabel("Texto do botão").fill("Ver estado");
    await page.getByLabel(/Caminho/).fill(`/${region.slug}/${region.uf}`);
    await page.getByRole("button", { name: "Salvar rascunho" }).click();
    await expect(flash(page, /Rascunho salvo/)).toBeVisible();
    for (const kind of ["mobile", "desktop"] as const) {
      const frame = page.frameLocator(`iframe[data-preview="${kind}"]`);
      const section = frame.locator("section[id^='campanha']").last();
      await expect(section.locator("h2"), `${kind} preview`).toHaveText(`Sua cidade fala ${region.name}`, { timeout: 300_000 });
      await expect(section.getByRole("link", { name: "Ver estado" })).toHaveAttribute("href", `/${region.slug}/${region.uf}`);
    }
    // A button to another region is refused, nothing is saved.
    await page.getByLabel(/Caminho/).fill("/sul/sc");
    await page.getByRole("button", { name: "Salvar rascunho" }).click();
    await expect(page.getByRole("status").getByText(/must be a page of this region/)).toBeVisible();

    // D. Publish to the sandbox (draft → publication), then the history restores it; Sul is untouched.
    await open(page, "/admin/publicar");
    await page.getByRole("button", { name: "Publicar no sandbox local" }).click();
    await expect(flash(page, /Publicado no sandbox local/)).toBeVisible({ timeout: 300_000 });
    await open(page, "/admin/home");
    expect(await page.locator("table.a-table tbody tr").count()).toBeGreaterThan(sectionsBefore);
    const sections = (html: string) => [...html.matchAll(/<section[^>]*id="([^"]+)"/g)].map((m) => m[1]);
    expect(sections(await (await page.request.get("/sul", { timeout: 300_000 })).text())).toEqual(sections(sulBefore));
  });
}

test("given the Sul home, when the structured models are inspected, then its original sections are intact, editable and never duplicated", async ({ page }) => {
  await chooseRegion(page, "Sul");
  await open(page, "/admin/home");
  const rows = page.locator("table.a-table tbody tr");
  const count = await rows.count();
  await expect(rows.filter({ hasText: "Sua cidade, de 8 jeitos." })).toHaveCount(1);
  await expect(rows.filter({ hasText: "Escolha o seu estado" })).toHaveCount(1);
  await expect(models(page).getByRole("button", { name: "Adicionar Estilos da cidade" })).toHaveCount(0);
  await expect(models(page).getByRole("button", { name: "Adicionar Escolha seu estado" })).toHaveCount(0);
  await expect(models(page).getByRole("link", { name: /Ir para a seção/ })).toHaveCount(3 - 1 + 1); // city styles, states and the existing campaign
  await rows.filter({ hasText: "Sua cidade, de 8 jeitos." }).getByRole("link", { name: "Editar" }).click();
  await hydrated(page);
  await expect(page.getByLabel("Título", { exact: true })).toHaveValue("Sua cidade, de 8 jeitos.");
  await open(page, "/admin/home");
  expect(await rows.count()).toBe(count);
});

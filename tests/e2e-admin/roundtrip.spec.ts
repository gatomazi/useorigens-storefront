import { expect, test, type Page } from "@playwright/test";

/**
 * The local CMS round trip, end to end, in a real browser against a real dev server (sandbox in a temp dir):
 *   Biblioteca: find an internal collection (no accents) → enable it → autocomplete → create a section from it → give it a background and a banner → reorder → save draft → reload (persists) → preview at 375 px and
 *   desktop (real cards, no tracking) → publish to the SANDBOX → the storefront (flag ON) shows it → edit + publish again → restore the
 *   previous version → the storefront shows the restored one. The original curated sections must be untouched throughout.
 * It relies on the locally synced INK collections (`npm run collections:sync`); if they are missing the first assertion says so.
 */
const hydrated = (page: Page) => page.waitForFunction(() => document.documentElement.dataset.hydrated === "true", undefined, { timeout: 180_000 });
async function open(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 300_000 });
  await hydrated(page);
}
const rows = (page: Page) => page.locator("table.a-table tbody tr");
const titles = async (page: Page) => (await rows(page).locator("td:nth-child(2) p.font-bold").allInnerTexts()).map((t) => t.trim());

test.describe.configure({ mode: "serial" });

test("given the local CMS, when a collection section is created, styled, reordered, saved, previewed, published, edited and restored, then every step persists and the storefront follows", async ({ page, context }) => {
  // Preview must never reach a tracker: any request to Meta/Google fails the test.
  const trackerRequests: string[] = [];
  await context.route(/connect\.facebook\.net|facebook\.com\/tr|googletagmanager\.com|google-analytics\.com/, (route) => {
    trackerRequests.push(route.request().url());
    return route.abort();
  });

  // 1. The original curated home is intact.
  await open(page, "/admin/home");
  const original = await titles(page);
  expect(original.slice(0, 4)).toEqual(["O seu lugar, do seu jeito.", "Sua cidade, de 8 jeitos.", "Da Nossa Terra", "Escolha o seu estado"]);
  expect(original.length).toBe(10); // nine sections plus the fixed footer row

  // 2. Library: an INTERNAL (hidden on INK) collection is found without accents, enabled individually, and only then offered by the autocomplete.
  await open(page, "/admin/colecoes");
  await expect(page.getByRole("heading", { name: "Coleções da INK" }), "no synced collections: run `npm run collections:sync` first").toBeVisible();
  await page.getByLabel(/Buscar por nome, slug ou número/).fill("fe de origem"); // no accents, no case: finds "Fé de Origem"
  const libRow = page.locator("table.a-table tbody tr", { hasText: "Fé de Origem" });
  await expect(libRow).toHaveCount(1);
  await expect(libRow).toContainText("Interna (oculta na INK)");
  await expect(libRow).toContainText("Desabilitada");
  // Before enabling, the section creator does not offer it as selectable (it explains where to enable it).
  await open(page, "/admin/home");
  const combo = page.getByRole("combobox", { name: /Coleção \(busque pelo nome\)/ });
  await combo.fill("fe de origem");
  const hidden = page.getByRole("option", { name: /Fé de Origem/ });
  await expect(hidden).toHaveAttribute("aria-disabled", "true");
  await open(page, "/admin/colecoes?q=fe+de+origem");
  await page.locator("table.a-table tbody tr", { hasText: "Fé de Origem" }).getByRole("button", { name: "Habilitar" }).click();
  await expect(page.getByText(/“Fé de Origem” habilitada para uso no CMS/)).toBeVisible();
  await expect(page.locator("table.a-table tbody tr", { hasText: "Fé de Origem" })).toContainText("Habilitada no CMS");
  // Enabling one does not enable its neighbours.
  await page.goto("/admin/colecoes?q=sul+-+rs", { waitUntil: "domcontentloaded" });
  await expect(page.locator("table.a-table tbody tr", { hasText: "SUL - RS" }).first().getByRole("button", { name: "Habilitar" })).toBeVisible();

  // 2b. Autocomplete (keyboard) in the section creator picks it; the saved link is store + id.
  await open(page, "/admin/home");
  const picker = page.getByRole("combobox", { name: /Coleção \(busque pelo nome\)/ });
  await picker.fill("fe de");
  await expect(page.getByRole("option", { name: /Fé de Origem/ })).not.toHaveAttribute("aria-disabled", "true");
  await picker.press("ArrowDown");
  await picker.press("Enter");
  await expect(picker).toHaveValue("Fé de Origem");
  await page.getByLabel("Título (opcional)").fill("Terra em foco");
  await page.getByLabel("Cards").fill("6");
  await page.getByRole("button", { name: "Criar seção" }).click();
  await expect(page).toHaveURL(/\/admin\/home\/custom-[0-9a-f]+(\?|$)/);
  await expect(page.getByText("Seção criada no rascunho.")).toBeVisible();
  // An internal collection has no public page: the editor says so instead of offering a "Ver todos".
  await expect(page.getByText(/Coleção interna: link “Ver todos” desativado/)).toBeVisible();

  // 3. Background: solid regional green, light text, plus a banner with a dark veil.
  await page.getByLabel("Cor sólida").check();
  await page.getByLabel("Cor", { exact: true }).selectOption("token:region-primary");
  await page.getByLabel("Cor do texto").selectOption("dark");
  await page.getByLabel("Imagem mobile (opcional)").selectOption("legacy:sul/fala-daqui-mobile");
  await page.getByLabel("Imagem desktop (opcional)").selectOption("legacy:sul/fala-daqui-desktop");
  await page.getByLabel("Véu", { exact: true }).selectOption("regional-wash-dark");
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page.getByText("Rascunho salvo.")).toBeVisible();

  // 4. Reorder: one step up (before "Fala daqui"'s neighbour) and check it persisted after a reload.
  await open(page, "/admin/home");
  const before = await titles(page);
  expect(before.at(-1)).toBe("Rodapé");
  expect(before.at(-2)).toBe("Nome, número e jeito de falar: cada cidade do Sul tem os seus.");
  expect(before.at(-3)).toBe("Terra em foco"); // new sections land right before the closing campaign
  await page.getByRole("button", { name: "Mover “Terra em foco” para cima" }).click();
  await expect(page.getByText("Ordem alterada.")).toBeVisible();
  const moved = await titles(page);
  expect(moved.indexOf("Terra em foco")).toBe(before.indexOf("Terra em foco") - 1);
  await page.reload({ waitUntil: "domcontentloaded" });
  await hydrated(page);
  expect(await titles(page)).toEqual(moved); // persisted across a reload
  await expect(page.getByText("Alterações não publicadas").first()).toBeVisible();

  // 5. Preview: real components at 375 px and desktop, with the real cards of the collection and no tracking.
  const mobile = page.frameLocator('iframe[data-preview="mobile"]');
  const desktop = page.frameLocator('iframe[data-preview="desktop"]');
  for (const [name, frame] of [["mobile", mobile], ["desktop", desktop]] as const) {
    const section = frame.locator("section#colecao-terra-em-foco");
    await expect(section, `${name} preview shows the new section`).toBeVisible({ timeout: 300_000 });
    await expect(section.getByRole("heading", { name: "Terra em foco" })).toBeVisible();
    expect(await section.locator('a[href^="https://www.usesul.com.br/"]').count(), `${name}: real INK cards`).toBeGreaterThanOrEqual(3);
    await expect(section.locator("picture img").first()).toHaveAttribute("src", /\/banners\/sul\/fala-daqui-mobile-\d+\.webp/); // banner is a layer INSIDE the section
  }
  expect(await page.locator('iframe[data-preview="mobile"]').getAttribute("width")).toBe("375");
  // The original sections are still in the preview.
  await expect(mobile.getByRole("heading", { name: "Da Nossa Terra", exact: true })).toBeVisible();
  expect(trackerRequests).toEqual([]);

  // 5b. While a section uses it, the collection cannot be disabled.
  await open(page, "/admin/colecoes?q=fe+de+origem");
  const usedRow = page.locator("table.a-table tbody tr", { hasText: "Fé de Origem" });
  await expect(usedRow).toContainText("Usada em: Terra em foco");
  await expect(usedRow.getByRole("button", { name: "Desabilitar" })).toBeDisabled();

  // 6. Publish to the sandbox and see it on the storefront (flag ON, reading the sandbox).
  await open(page, "/admin/publicar");
  await expect(page.getByText('Nova seção "Terra em foco"')).toBeVisible();
  await page.getByLabel(/Nota da publicação/).fill("primeira publicação do roundtrip");
  await page.getByRole("button", { name: "Publicar no sandbox local" }).click();
  await expect(page.getByText(/Publicado no sandbox local \(release 1\)/)).toBeVisible({ timeout: 300_000 });
  await expect(page.getByText("Coerente").first()).toBeVisible();
  await open(page, "/sul");
  await expect(page.locator("section#colecao-terra-em-foco h2")).toHaveText("Terra em foco");
  await expect(page.locator("section#terra h2")).toHaveText("Da Nossa Terra"); // the curated section is untouched
  expect(await page.locator("section#colecao-terra-em-foco a[href^='https://www.usesul.com.br/']").count()).toBeGreaterThanOrEqual(3);
  expect(await page.locator("section#colecao-terra-em-foco a[href*='/collections/']").count(), "no 'Ver todos' for an internal collection").toBe(0);

  // 7. Edit, publish again, then restore release 1.
  await open(page, "/admin/home");
  await page.getByRole("link", { name: "Editar" }).nth((await titles(page)).indexOf("Terra em foco")).click();
  await hydrated(page);
  await page.getByLabel("Título", { exact: true }).fill("Terra em foco 2");
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page.getByText("Rascunho salvo.")).toBeVisible();
  await open(page, "/admin/publicar");
  await page.getByRole("button", { name: "Publicar no sandbox local" }).click();
  await expect(page.getByText(/release 2/).first()).toBeVisible({ timeout: 300_000 });
  await open(page, "/sul");
  await expect(page.locator("section#colecao-terra-em-foco h2")).toHaveText("Terra em foco 2");
  await open(page, "/admin/publicar");
  await page.locator("tr", { hasText: "#1" }).getByRole("button", { name: "Restaurar esta versão" }).click();
  await expect(page.getByText(/Versão 1 restaurada/)).toBeVisible({ timeout: 300_000 });
  await open(page, "/sul");
  await expect(page.locator("section#colecao-terra-em-foco h2")).toHaveText("Terra em foco");
  await open(page, "/admin/publicar");
  await expect(page.locator("tbody tr").first()).toContainText("Restauração");
  expect(trackerRequests).toEqual([]);
});

test("given a stale form (the draft changed in another tab), when it is submitted, then nothing is overwritten and the person is told", async ({ page }) => {
  await open(page, "/admin/home");
  const row = page.locator("tr", { hasText: "Fala daqui" });
  const staleRev = await row.locator('input[name="rev"]').first().inputValue();
  // Change the draft through the UI (this bumps the revision) …
  await row.getByRole("button", { name: /Ocultar/ }).click();
  await expect(page.getByText("Seção ocultada.")).toBeVisible();
  // … then replay a form that still carries the old revision.
  const result = await page.evaluate(async (rev) => {
    const form = document.querySelector('tr:has(td) form input[name="rev"]')?.closest("form") as HTMLFormElement | null;
    if (!form) return "no form";
    (form.querySelector('input[name="rev"]') as HTMLInputElement).value = rev;
    form.requestSubmit();
    return "submitted";
  }, staleRev);
  expect(result).toBe("submitted");
  await expect(page.getByText(/O rascunho mudou em outra aba/)).toBeVisible();
});

test("given a dev-only upload, when a hostile or oversized file is sent, then it is refused, and a real image is accepted, stored locally and offered as a banner", async ({ page }) => {
  await open(page, "/admin/midia");
  const send = async (name: string, mimeType: string, buffer: Buffer) => {
    await page.locator('input[type="file"]').setInputFiles({ name, mimeType, buffer });
    await page.getByRole("button", { name: "Enviar", exact: true }).click();
  };
  await send("evil.svg", "image/svg+xml", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'));
  await expect(page.getByText(/não foi possível ler a imagem|formato não permitido/)).toBeVisible();
  await send("fake.png", "image/png", Buffer.from("this is not a png at all"));
  await expect(page.getByText(/não foi possível ler a imagem/)).toBeVisible();
  // A real (tiny) PNG.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC", "base64");
  await send("minha foto.png", "image/png", png);
  await expect(page.getByText(/Imagem "minha foto" enviada/)).toBeVisible();
  const img = page.locator('li img[src^="/admin/media/"]').first();
  await expect(img).toBeVisible();
  const res = await page.request.get((await img.getAttribute("src"))!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/webp");
  expect((await page.request.get("/admin/media/../../etc/passwd")).status()).toBe(404);
  expect((await page.request.get("/admin/media/zzzzzzzzzzzzzzzzzzzzzzzz.webp")).status()).toBe(404);
});

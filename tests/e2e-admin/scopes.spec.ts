import { expect, test, type Page } from "@playwright/test";

/**
 * (Runs AFTER roundtrip.spec.ts, which counts sandbox releases from 1.) Norte and Centro-Oeste in the CMS, end to end (dev server, sandbox in a temp dir; nothing here touches production):
 * region switcher → the region has no home → "Criar home inicial" builds it ONLY from the region's own INK store → the Library is that store's →
 * an internal collection is enabled for that region → the public site says "not launched" (404, no navigation link) → launch → the public
 * region shows REAL products with links to the region's own INK store, Sul is untouched → recall → restore, each per region.
 * Relies on the locally synced catalogs and collections of the three stores (`npm run catalog:sync`, `npm run collections:sync`).
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
/** The flash message (the history table repeats the note text, so a plain getByText would match twice). */
const flash = (page: Page, text: RegExp) => page.getByRole("status").locator("p", { hasText: text });
const status = async (page: Page, url: string) => (await page.request.get(url, { timeout: 300_000 })).status();

test.describe.configure({ mode: "serial" });

const REGIONS = [
  { name: "Norte" as const, slug: "norte", host: "usenorte.com.br", store: "Norte" },
  { name: "Centro-Oeste" as const, slug: "centro-oeste", host: "usecentro.com.br", store: "Centro-Oeste" },
];

for (const region of REGIONS) {
  test(`given ${region.name} is only in preview, when its home is created, its library used, launched, recalled and restored, then only ${region.name} changes and Sul never does`, async ({ page }) => {
    const sulBefore = await (await page.request.get("/sul", { timeout: 300_000 })).text();

    // 1. Not launched: no public page, no navigation link to it.
    expect(await status(page, `/${region.slug}`)).toBe(404);
    await open(page, "/sul");
    expect(await page.locator(`footer a[href="/${region.slug}"], header a[href="/${region.slug}"]`).count()).toBe(0);

    // 2. Region switcher; the region has no home yet. While in preview the sidebar offers no store link (its public page is a 404).
    await chooseRegion(page, region.name);
    await expect(page.getByRole("link", { name: /Abrir a loja/ })).toHaveCount(0);
    await expect(page.getByText(/Região ainda em prévia/)).toBeVisible();
    await open(page, "/admin/home");
    await expect(page.getByRole("heading", { name: "Esta região ainda não tem home" })).toBeVisible();
    await open(page, "/admin/publicar");
    await expect(page.getByText("Em prévia: não aparece na loja nem na navegação")).toBeVisible();
    await expect(page.getByText(/a home ainda não foi criada/)).toBeVisible();
    await expect(page.getByRole("button", { name: new RegExp(`Lançar ${region.name}`) })).toBeDisabled();

    // 3. Create the initial home from the region's own store.
    await open(page, "/admin/home");
    await page.getByRole("button", { name: "Criar home inicial" }).click();
    await expect(flash(page, /Home inicial criada no rascunho/)).toBeVisible();
    const inHome = page.locator("table.a-table tbody");
    await expect(inHome).toContainText("Rodapé");
    await expect(inHome).not.toContainText("Sul");

    // 4. The Library is this region's store, never another one; an internal collection is enabled and disabled for this region only.
    await open(page, "/admin/colecoes");
    await expect(page.getByText(new RegExp(`Coleções da loja INK de ${region.store}`))).toBeVisible();
    await expect(page.locator("table.a-table tbody")).not.toContainText("SUL - RS");
    await expect(page.getByRole("button", { name: new RegExp(`Sincronizar catálogo de ${region.store}`) })).toBeVisible(); // the owner can sync this store's catalog from the panel
    const enableButtons = page.locator("table.a-table tbody").getByRole("button", { name: "Habilitar" });
    if ((await enableButtons.count()) > 0) {
      const row = page.locator("table.a-table tbody tr").filter({ has: page.getByRole("button", { name: "Habilitar" }) }).first();
      const label = (await row.locator("td p.font-bold").first().innerText()).trim();
      await row.getByRole("button", { name: "Habilitar" }).click();
      await expect(flash(page, /habilitada para uso no CMS/)).toBeVisible();
      await expect(page.locator("table.a-table tbody tr", { hasText: label }).first()).toContainText("Habilitada no CMS");
    }

    // 5. Launch (publishes only this region's document, with the launched flag).
    await open(page, "/admin/publicar");
    await expect(page.getByText(/Ainda não dá para lançar/), "the region must be launchable with the local catalog").toHaveCount(0);
    await page.getByRole("button", { name: `Lançar ${region.name} ao público` }).click();
    await expect(flash(page, new RegExp(`${region.name} lançada publicamente`))).toBeVisible({ timeout: 300_000 });

    await open(page, "/admin");
    await expect(page.getByRole("link", { name: /Abrir a loja/ })).toHaveAttribute("href", `/${region.slug}`); // follows the selected region once it is public
    // 6. Public: real products, links to the region's OWN INK store, the region shows in the navigation, Sul is untouched.
    await open(page, `/${region.slug}`);
    expect(await page.locator(`a[href^="https://www.${region.host}/"]`).count(), "real INK products of the region").toBeGreaterThanOrEqual(3);
    expect(await page.locator('a[href^="https://www.usesul.com.br/"]').count(), "never Sul's store").toBe(0);
    await expect(page.getByText(/^0 cidades|\b0 cidades\b/)).toHaveCount(0);
    await open(page, "/sul");
    expect(await page.locator(`footer a[href="/${region.slug}"]`).count()).toBeGreaterThan(0);
    // Sul's content is what it was before (the launch of another region never touches it).
    const sulAfter = await (await page.request.get("/sul", { timeout: 300_000 })).text();
    const sections = (html: string) => [...html.matchAll(/<section[^>]*id="([^"]+)"/g)].map((m) => m[1]);
    expect(sections(sulAfter)).toEqual(sections(sulBefore));

    // 7. Recall: back to preview, publicly gone again; Sul still untouched.
    await open(page, "/admin/publicar");
    await page.getByRole("button", { name: new RegExp(`Recolher ${region.name}`) }).click();
    await expect(flash(page, new RegExp(`${region.name} recolhida`))).toBeVisible({ timeout: 300_000 });
    expect(await status(page, `/${region.slug}`)).toBe(404);

    // 8. Restore the launch release (a new release with only this region's document).
    const history = page.locator("tbody tr", { hasText: region.name }).filter({ has: page.getByRole("button", { name: `Restaurar ${region.name}` }) });
    await history.last().getByRole("button", { name: `Restaurar ${region.name}` }).click();
    await expect(flash(page, new RegExp(`${region.name}: versão \\d+ restaurada`))).toBeVisible({ timeout: 300_000 });
    expect(await status(page, `/${region.slug}`)).toBe(200);
    expect(sections(await (await page.request.get("/sul", { timeout: 300_000 })).text())).toEqual(sections(sulBefore));

    // 8b. History cleanup: the LIVE release has no delete button; an old one needs the confirmation and then disappears.
    await open(page, "/admin/publicar");
    const headRow = page.locator("tbody tr", { hasText: "No ar" });
    await expect(headRow.getByRole("button", { name: /Apagar a release/ })).toHaveCount(0);
    const victim = page.locator("tbody tr").filter({ has: page.getByRole("button", { name: /Apagar a release/ }) }).last();
    const victimId = (await victim.locator("td").first().innerText()).replace("#", "").trim();
    await victim.getByRole("button", { name: /Apagar a release/ }).click();
    await expect(flash(page, /Marque a confirmação/)).toBeVisible(); // nothing is deleted without the confirmation
    await page.locator("tbody tr").filter({ has: page.getByRole("button", { name: `Apagar a release ${victimId}` }) }).getByLabel(/confirmo apagar/).check();
    await page.getByRole("button", { name: `Apagar a release ${victimId}` }).click();
    await expect(flash(page, new RegExp(`Release ${victimId} apagada`))).toBeVisible();
    await expect(page.locator("tbody tr").filter({ hasText: new RegExp(`^#${victimId}\\b`) })).toHaveCount(0);

    // 9. Leave it in preview for the next scenario.
    await open(page, "/admin/publicar");
    await page.getByRole("button", { name: new RegExp(`Recolher ${region.name}`) }).click();
    await expect(flash(page, new RegExp(`${region.name} recolhida`))).toBeVisible({ timeout: 300_000 });
  });
}

test("given a change of the global tracking in DRAFT, when nothing is published, then no region's effective ID changes; production follows only each confirmed publish", async ({ page }) => {
  await chooseRegion(page, "Sul");
  await open(page, "/admin/tracking");
  const row = (scope: string, tool: string) => page.getByTestId(`eff-${scope}-${tool}`);
  const live = (scope: string, tool: string) => row(scope, tool).locator("td").nth(2);
  const ifPublished = (scope: string, tool: string) => row(scope, tool).locator("td").nth(3);
  await expect(live("norte", "meta")).toContainText("nenhum");
  await expect(live("centro-oeste", "ga4")).toContainText("nenhum");

  // Norte inherits Meta; the global gets an active ID — both as DRAFTS only.
  const norte = page.locator('section[aria-labelledby="t-norte"]');
  await norte.locator("fieldset", { hasText: "Meta Pixel" }).getByRole("radio", { name: "Herdar o global" }).check();
  await norte.getByRole("button", { name: /Salvar rascunho/ }).click();
  await expect(flash(page, /Rascunho de tracking salvo/)).toBeVisible();
  const global = page.locator('section[aria-labelledby="t-global"]');
  const globalMeta = global.locator("fieldset", { hasText: "Meta Pixel" });
  await globalMeta.getByRole("radio", { name: "Ativo com este ID" }).check();
  await globalMeta.locator("input:not([type])").fill("4444444444444444");
  await global.getByRole("button", { name: /Salvar rascunho/ }).click();
  await expect(flash(page, /Rascunho de tracking salvo/)).toBeVisible();
  await expect(live("norte", "meta")).toContainText("nenhum"); // production unchanged
  await expect(ifPublished("norte", "meta")).toContainText("4444444444444444");
  await expect(ifPublished("norte", "meta")).toContainText("muda");
  await expect(ifPublished("centro-oeste", "meta")).not.toContainText("4444444444444444");

  // Publishing the global alone changes nobody: Norte's OWN published document still says "off", so nothing is asked and nothing moves.
  await page.getByRole("button", { name: "Publicar tracking global" }).click();
  await expect(flash(page, /Tracking global publicado/)).toBeVisible({ timeout: 300_000 });
  await expect(live("norte", "meta")).toContainText("nenhum");

  // Norte's own publish is what makes it inherit, and it must be confirmed (effective ID changes).
  await chooseRegion(page, "Norte");
  await open(page, "/admin/publicar");
  await page.getByRole("button", { name: "Publicar no sandbox local" }).click();
  await expect(flash(page, /Confirme os IDs/)).toBeVisible({ timeout: 300_000 });
  await page.locator("form", { has: page.getByRole("button", { name: "Publicar no sandbox local" }) }).getByLabel(/Revisei os IDs efetivos/).check(); // (the launch panel has its own, separate confirmation)
  await page.getByRole("button", { name: "Publicar no sandbox local" }).click();
  await expect(flash(page, /Publicado no sandbox local/)).toBeVisible({ timeout: 300_000 });
  await open(page, "/admin/tracking");
  await expect(live("norte", "meta")).toContainText("4444444444444444");
  await expect(live("norte", "meta")).toContainText("herdado do global");
  await expect(live("centro-oeste", "meta")).toContainText("nenhum");

  // Now a global change moves an inheriting region: the owner is warned, and it needs the confirmation.
  await chooseRegion(page, "Sul");
  await open(page, "/admin/tracking");
  await expect(page.getByText(/Hoje herdam o global:/)).toContainText("Norte");
  await globalMeta.locator("input:not([type])").fill("5555555555555555");
  await global.getByRole("button", { name: /Salvar rascunho/ }).click();
  await expect(flash(page, /Rascunho de tracking salvo/)).toBeVisible();
  await expect(page.getByRole("group", { name: "Confirmação do rastreamento" })).toContainText("Norte · Meta Pixel");
  await page.getByRole("button", { name: "Publicar tracking global" }).click();
  await expect(flash(page, /Confirme os IDs/)).toBeVisible({ timeout: 300_000 });
  await expect(live("norte", "meta")).toContainText("4444444444444444"); // refused: still the old one
  await page.getByLabel(/Revisei os IDs efetivos/).check();
  await page.getByRole("button", { name: "Publicar tracking global" }).click();
  await expect(flash(page, /Tracking global publicado/)).toBeVisible({ timeout: 300_000 });
  await expect(live("norte", "meta")).toContainText("5555555555555555");

  // Invalid formats are refused with a clear message (the draft is not saved).
  await globalMeta.locator("input:not([type])").fill("abc");
  await global.getByRole("button", { name: /Salvar rascunho/ }).click();
  await expect(flash(page, /formato de ID inválido/)).toBeVisible();

  // Only the owner edits the global; the dev user is the owner, so the form is editable here (regional editors get it read-only: unit-tested in draft/permissions).
  await expect(global.getByRole("button", { name: /Salvar rascunho/ })).toBeVisible();
});

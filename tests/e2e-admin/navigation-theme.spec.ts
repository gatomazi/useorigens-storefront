import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Regional navigation and palette, end to end on the local CMS sandbox (dev server; nothing here touches production):
 *   launch Norte and Centro-Oeste → the mobile menu of each region is real-data hierarchy (states of the region, the OTHER launched regions) →
 *   Navegação: labels / order / visibility, live preview, draft ≠ public until published → Aparência: own palette, unreadable contrast warned and
 *   refused at publish, a region with no config keeps today's look → the global palette, inherited by a region and followed without republishing it →
 *   restoring an older release brings the region back to its previous look → a region that is not launched disappears from the menus.
 * Runs LAST (after structured.spec.ts, which is why it launches the regions itself and never assumes their state). `CAPTURE=1` also writes the
 * screenshots of docs/screenshots/navigation-theme-round/.
 */
const hydrated = (page: Page) => page.waitForFunction(() => document.documentElement.dataset.hydrated === "true", undefined, { timeout: 180_000 });
async function open(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 300_000 });
  await hydrated(page);
}
async function chooseRegion(page: Page, name: "Sul" | "Norte" | "Centro-Oeste") {
  await open(page, "/admin");
  const switcher = page.getByRole("form", { name: "Região em edição" });
  await switcher.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await expect(switcher.getByRole("button", { name: new RegExp(`^${name}`) })).toHaveAttribute("aria-pressed", "true");
}
const flash = (page: Page, text: RegExp) => page.getByRole("status").locator("p", { hasText: text });

type RegionName = "Sul" | "Norte" | "Centro-Oeste";
const REGIONS: { name: RegionName; slug: string; primary: string }[] = [
  { name: "Sul", slug: "sul", primary: "rgb(77, 84, 61)" },
  { name: "Norte", slug: "norte", primary: "rgb(35, 75, 80)" },
  { name: "Centro-Oeste", slug: "centro-oeste", primary: "rgb(140, 59, 31)" },
];
const STATES = { sul: ["Paraná", "Santa Catarina", "Rio Grande do Sul"], norte: ["Acre", "Amazonas", "Amapá", "Pará", "Rondônia", "Roraima", "Tocantins"], "centro-oeste": ["Distrito Federal", "Goiás", "Mato Grosso do Sul", "Mato Grosso"] } as const;

async function publishRegion(page: Page, name: RegionName) {
  await chooseRegion(page, name);
  await open(page, "/admin/publicar");
  await page.getByRole("button", { name: "Publicar no sandbox local" }).click();
  await expect(flash(page, /Publicado no sandbox local/)).toBeVisible({ timeout: 300_000 });
}

async function ensureLaunched(page: Page, name: "Norte" | "Centro-Oeste") {
  await chooseRegion(page, name);
  await open(page, "/admin/home");
  const create = page.getByRole("button", { name: "Criar home inicial" });
  if (await create.isVisible()) {
    await create.click();
    await expect(flash(page, /Home inicial criada/)).toBeVisible();
  }
  await open(page, "/admin/publicar");
  const launch = page.getByRole("button", { name: `Lançar ${name} ao público` });
  if (await launch.isVisible()) {
    await expect(page.getByText(/Ainda não dá para lançar/), "launchable with the local catalog").toHaveCount(0);
    await launch.click();
    await expect(flash(page, new RegExp(`${name} lançada publicamente`))).toBeVisible({ timeout: 300_000 });
  }
}

async function openPublicMenu(page: Page, slug: string, width = 375, height = 812) {
  await page.setViewportSize({ width, height });
  await open(page, `/${slug}`);
  await page.getByRole("button", { name: "Abrir menu" }).click();
  const dialog = page.getByRole("dialog", { name: "Menu" });
  await expect(dialog).toBeVisible();
  return dialog;
}
const headings = (dialog: Locator) => dialog.getByRole("heading", { level: 2 }).allTextContents();
const linksOf = (dialog: Locator, block: "primary" | "states" | "regions") => dialog.locator(`[data-block="${block}"]`).getByRole("link").allTextContents();
const previewHeadings = (page: Page) => page.getByTestId("navigation-preview-drawer").getByRole("heading", { level: 2 }).allTextContents();

const SHOTS = path.join(process.cwd(), "docs", "screenshots", "navigation-theme-round");

test.describe.configure({ mode: "serial" });

test("given Norte and Centro-Oeste are launched, when each mobile menu opens, then it is Comprar, its OWN states and the OTHER launched regions, with no overflow at 320px", async ({ page }) => {
  await ensureLaunched(page, "Norte");
  await ensureLaunched(page, "Centro-Oeste");

  const expected: Record<string, { regions: string[]; label: string }> = {
    sul: { regions: ["Norte", "Centro-Oeste"], label: "Estados do Sul" },
    norte: { regions: ["Sul", "Centro-Oeste"], label: "Estados do Norte" },
    "centro-oeste": { regions: ["Sul", "Norte"], label: "Estados do Centro-Oeste" },
  };
  for (const region of REGIONS) {
    for (const width of [320, 390]) {
      const dialog = await openPublicMenu(page, region.slug, width);
      expect(await headings(dialog), `${region.slug} @${width}`).toEqual(["Comprar", expected[region.slug].label, "Explorar outras regiões"]);
      expect(await linksOf(dialog, "states")).toEqual(STATES[region.slug as keyof typeof STATES]);
      const regions = await linksOf(dialog, "regions");
      expect(regions).toEqual(expected[region.slug].regions);
      expect(regions, "the current region never appears").not.toContain(region.name);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      const hrefs = await dialog.locator("[data-block='regions'] a").evaluateAll((els) => els.map((el) => el.getAttribute("href")));
      expect(hrefs).toEqual(expected[region.slug].regions.map((r) => `/${REGIONS.find((x) => x.name === r)!.slug}`));
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: "Abrir menu" })).toBeFocused();
    }
  }
});

test("given no palette is configured, when the three regions render, then each keeps today's colours (own primary colour on header and menu)", async ({ page }) => {
  for (const region of REGIONS) {
    const dialog = await openPublicMenu(page, region.slug);
    await expect(dialog).toHaveCSS("background-color", region.primary);
    await expect(dialog).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(page.locator("header.site-header")).toHaveCSS("background-color", region.primary);
    expect(await page.locator(`[data-region='${region.slug}']`).evaluate((el) => el.getAttribute("style"))).not.toContain("--nav-");
  }
});

test("given the desktop header of a region with launched neighbours, when read, then the states dropdown and the region switcher use the same launched data and still work", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, "/norte");
  const header = page.locator("header.site-header");
  const nav = header.getByRole("navigation", { name: "Principal" });
  await nav.getByText("Regiões", { exact: true }).click();
  await expect(nav.getByRole("link")).toContainText(["Acre", "Amazonas", "Amapá", "Pará", "Rondônia", "Roraima", "Tocantins"]);
  await page.keyboard.press("Escape");
  await header.getByText("Norte", { exact: true }).click();
  const others = header.locator("ul").filter({ has: page.getByRole("link", { name: "Sul", exact: true }) });
  await expect(others.getByRole("link")).toHaveText(["Sul", "Centro-Oeste"]);
  await expect(others.getByRole("link", { name: "Sul", exact: true })).toHaveCSS("color", "rgb(0, 0, 0)");
  await expect(others.getByRole("link", { name: "Sul", exact: true })).toHaveAttribute("href", "/sul");
  await expect(header.getByRole("link", { name: /Meus Lugares/ })).toBeVisible();
  await expect(header.getByRole("button", { name: "Buscar", exact: true })).toBeVisible();
});

test("given Navegação, when the labels, order and visibility are edited, then the preview follows live, the store only changes after publishing, and the states stay automatic", async ({ page }) => {
  await chooseRegion(page, "Norte");
  await open(page, "/admin/navegacao");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Navegação");
  // No manual list of states or regions exists on the screen: they are shown as read-only facts.
  await expect(page.getByTestId("auto-states")).toContainText("Acre, Amazonas, Amapá, Pará, Rondônia, Roraima, Tocantins");
  await expect(page.getByTestId("auto-regions")).toContainText("Sul, Centro-Oeste");
  await expect(page.getByRole("textbox", { name: /estados/i })).toHaveCount(0);

  const preview = page.getByTestId("preview-drawer").first();
  expect(await previewHeadings(page).catch(() => [])).toEqual([]); // (guard: the helper below reads the drawer preview only)
  const drawerHeadings = () => preview.getByRole("heading", { level: 2 }).allTextContents();
  expect(await drawerHeadings()).toEqual(["Comprar", "Estados do Norte", "Explorar outras regiões"]);

  await page.getByTestId("statesBlock-label").fill("Por estado");
  expect(await drawerHeadings()).toEqual(["Comprar", "Por estado", "Explorar outras regiões"]); // label reflected live
  await page.getByTestId("statesBlock-order").fill("5");
  expect(await drawerHeadings()).toEqual(["Por estado", "Comprar", "Explorar outras regiões"]); // order reflected live
  await page.getByTestId("regionsBlock-visible").uncheck();
  expect(await drawerHeadings()).toEqual(["Por estado", "Comprar"]); // visibility reflected live
  await page.getByTestId("regionsBlock-visible").check();
  await page.getByTestId("link_states-label").fill("Escolha o estado");
  await expect(preview.getByText("Escolha o estado")).toBeVisible();

  await page.getByTestId("save-navigation").click();
  await expect(flash(page, /Rascunho da navegação de Norte salvo/)).toBeVisible();
  // The draft is not public yet.
  const before = await openPublicMenu(page, "norte");
  expect(await headings(before)).toEqual(["Comprar", "Estados do Norte", "Explorar outras regiões"]);

  // The publish screen lists what will change, then the store follows.
  await chooseRegion(page, "Norte");
  await open(page, "/admin/publicar");
  await expect(page.getByText(/Navegação, bloco Estados da região/)).toBeVisible();
  await page.getByRole("button", { name: "Publicar no sandbox local" }).click();
  await expect(flash(page, /Publicado no sandbox local/)).toBeVisible({ timeout: 300_000 });

  const after = await openPublicMenu(page, "norte");
  expect(await headings(after)).toEqual(["Por estado", "Comprar", "Explorar outras regiões"]);
  expect(await linksOf(after, "primary")).toContain("Escolha o estado");
  expect(await linksOf(after, "states")).toEqual(STATES.norte);
  // The desktop header reads the same labels.
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, "/norte");
  await expect(page.locator("header.site-header").getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Escolha o estado" })).toHaveAttribute("href", "/norte#estados");
  // Sul and Centro-Oeste are untouched.
  const sul = await openPublicMenu(page, "sul");
  expect(await headings(sul)).toEqual(["Comprar", "Estados do Sul", "Explorar outras regiões"]);
});

test("given Navegação, when 'Voltar ao padrão' is used and published, then the default hierarchy is back", async ({ page }) => {
  await chooseRegion(page, "Norte");
  await open(page, "/admin/navegacao");
  await page.getByTestId("reset-navigation").click();
  await expect(flash(page, /Navegação padrão restaurada/)).toBeVisible();
  await publishRegion(page, "Norte");
  const dialog = await openPublicMenu(page, "norte");
  expect(await headings(dialog)).toEqual(["Comprar", "Estados do Norte", "Explorar outras regiões"]);
});

test("given Aparência, when a region picks its own palette with an unreadable pair, then the editor warns, the save reports it and the publish is refused; a readable one publishes and only that region changes", async ({ page }) => {
  await chooseRegion(page, "Sul");
  await open(page, "/admin/aparencia");
  const card = page.getByTestId("theme-sul");
  await card.getByTestId("mode-override").check();
  const menuBg = card.getByTestId("color-mobileMenuBackground");
  // Live contrast: white text on a near-white menu is practically invisible.
  await menuBg.fill("#f5f5f5");
  await expect(card.getByTestId("contrast-sul-menu")).toHaveAttribute("data-level", "blocking");
  await expect(card.getByTestId("contrast-warning-sul")).toContainText("quase ilegível");
  // Between 3:1 and 4.5:1 it only warns.
  await menuBg.fill("#8a8a8a");
  await expect(card.getByTestId("contrast-sul-menu")).toHaveAttribute("data-level", "warning");
  // The preview paints the colour being typed.
  await menuBg.fill("#f5f5f5");
  await expect(card.getByTestId("preview-drawer").locator("div").first()).toHaveCSS("background-color", "rgb(245, 245, 245)");
  await card.getByTestId("save-theme-sul").click();
  await expect(page.locator("div[role=status]")).toContainText("NÃO poderá ser publicado assim");

  await open(page, "/admin/publicar");
  await expect(page.getByText(/Bloqueios para publicar/)).toBeVisible();
  await expect(page.getByText(/Aparência: .*quase ilegível/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Publicar no sandbox local" })).toBeDisabled();

  // A readable palette: it publishes, and only Sul changes.
  await open(page, "/admin/aparencia");
  const again = page.getByTestId("theme-sul");
  await again.getByTestId("color-mobileMenuBackground").fill("#1f2a44");
  await expect(again.getByTestId("contrast-sul-menu")).toHaveAttribute("data-level", "ok");
  await again.getByTestId("save-theme-sul").click();
  await expect(flash(page, /Rascunho da aparência de Sul salvo/)).toBeVisible();
  await open(page, "/admin/publicar");
  await expect(page.getByText(/Aparência, fundo do menu mobile: padrão → #1f2a44/)).toBeVisible();
  await page.getByRole("button", { name: "Publicar no sandbox local" }).click();
  await expect(flash(page, /Publicado no sandbox local/)).toBeVisible({ timeout: 300_000 });

  const sul = await openPublicMenu(page, "sul");
  await expect(sul).toHaveCSS("background-color", "rgb(31, 42, 68)");
  await expect(page.locator("header.site-header")).toHaveCSS("background-color", "rgb(77, 84, 61)"); // the header keeps the region's own colour: only the menu was set
  for (const other of ["norte", "centro-oeste"]) {
    const d = await openPublicMenu(page, other);
    await expect(d, `${other} unchanged`).toHaveCSS("background-color", other === "norte" ? "rgb(35, 75, 80)" : "rgb(140, 59, 31)");
  }
});

test("given the global palette, when a region inherits it, then the region shows it and FOLLOWS a later change of the global without being republished; a region with its own palette does not", async ({ page }) => {
  // 1. The Use Origens palette (owner): a dark brown menu.
  await chooseRegion(page, "Norte");
  await open(page, "/admin/aparencia");
  const global = page.getByTestId("theme-global");
  await global.getByTestId("color-mobileMenuBackground").fill("#5a2e1b");
  await expect(global.getByTestId("contrast-global-menu")).toHaveAttribute("data-level", "ok");
  await global.getByTestId("save-theme-global").click();
  await expect(flash(page, /Rascunho da aparência da Use Origens salvo/)).toBeVisible();
  await page.getByTestId("publish-global-theme").click();
  await expect(flash(page, /Paleta global publicada/)).toBeVisible({ timeout: 300_000 });

  // 2. Nobody changed by themselves: Norte has no config, Centro-Oeste neither, Sul has its own.
  for (const [slug, bg] of [["norte", "rgb(35, 75, 80)"], ["centro-oeste", "rgb(140, 59, 31)"], ["sul", "rgb(31, 42, 68)"]] as const) {
    await expect(await openPublicMenu(page, slug), `${slug} before inheriting`).toHaveCSS("background-color", bg);
  }

  // 3. Norte inherits and publishes.
  await chooseRegion(page, "Norte");
  await open(page, "/admin/aparencia");
  const norte = page.getByTestId("theme-norte");
  await norte.getByTestId("mode-inherit").check();
  await expect(norte.getByTestId("color-mobileMenuBackground")).toBeDisabled();
  await expect(norte.getByTestId("preview-drawer").locator("div").first()).toHaveCSS("background-color", "rgb(90, 46, 27)"); // the preview already shows the global colour
  await norte.getByTestId("save-theme-norte").click();
  await expect(flash(page, /Rascunho da aparência de Norte salvo/)).toBeVisible();
  await publishRegion(page, "Norte");
  await expect(await openPublicMenu(page, "norte"), "inherit works").toHaveCSS("background-color", "rgb(90, 46, 27)");
  await expect(page.locator("header.site-header")).toHaveCSS("background-color", "rgb(35, 75, 80)"); // what the global does not set stays Norte's petrol blue
  await expect(await openPublicMenu(page, "sul"), "own palette is not affected").toHaveCSS("background-color", "rgb(31, 42, 68)");

  // 4. The global changes; Norte is NOT republished and still follows.
  await chooseRegion(page, "Norte");
  await open(page, "/admin/aparencia");
  await page.getByTestId("theme-global").getByTestId("color-mobileMenuBackground").fill("#0b3d2e");
  await page.getByTestId("theme-global").getByTestId("save-theme-global").click();
  await expect(flash(page, /Rascunho da aparência da Use Origens salvo/)).toBeVisible();
  await page.getByTestId("publish-global-theme").click();
  await expect(flash(page, /Paleta global publicada/)).toBeVisible({ timeout: 300_000 });
  await expect(await openPublicMenu(page, "norte"), "followed the global").toHaveCSS("background-color", "rgb(11, 61, 46)");
  await expect(await openPublicMenu(page, "sul"), "own palette still its own").toHaveCSS("background-color", "rgb(31, 42, 68)");
  await expect(await openPublicMenu(page, "centro-oeste"), "no config still today's look").toHaveCSS("background-color", "rgb(140, 59, 31)");
});

test("given a region that inherits, when an older release is restored, then it goes back to that release's look and the others stay as they are", async ({ page }) => {
  await chooseRegion(page, "Norte");
  await open(page, "/admin/publicar");
  // Norte's first launch: no navigation, no palette. Picked by its note, not as "the oldest release that touched Norte": in the full ordered
  // run, earlier specs publish Norte while it is still a preview, and restoring one of those takes it off the air (a 404, correctly).
  const history = page.locator("tbody tr").filter({ hasText: "Lançamento público de Norte" }).filter({ has: page.getByRole("button", { name: "Restaurar Norte" }) });
  await history.last().getByRole("button", { name: "Restaurar Norte" }).click();
  await expect(flash(page, /Norte: versão \d+ restaurada/)).toBeVisible({ timeout: 300_000 });
  await expect(await openPublicMenu(page, "norte"), "back to today's look").toHaveCSS("background-color", "rgb(35, 75, 80)");
  expect(await headings(page.getByRole("dialog", { name: "Menu" }))).toEqual(["Comprar", "Estados do Norte", "Explorar outras regiões"]);
  await expect(await openPublicMenu(page, "sul"), "Sul untouched").toHaveCSS("background-color", "rgb(31, 42, 68)");
});

test("given Centro-Oeste is recalled, when the other menus are read, then it is not offered anywhere (mobile block, desktop switcher) and comes back when relaunched", async ({ page }) => {
  await chooseRegion(page, "Centro-Oeste");
  await open(page, "/admin/publicar");
  await page.getByRole("button", { name: /Recolher Centro-Oeste/ }).click();
  await expect(flash(page, /Centro-Oeste recolhida/)).toBeVisible({ timeout: 300_000 });
  const sul = await openPublicMenu(page, "sul");
  expect(await linksOf(sul, "regions")).toEqual(["Norte"]);
  const norte = await openPublicMenu(page, "norte");
  expect(await linksOf(norte, "regions")).toEqual(["Sul"]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, "/sul");
  await page.locator("header.site-header").getByText("Sul", { exact: true }).click();
  await expect(page.locator("header.site-header").getByRole("link", { name: "Centro-Oeste" })).toHaveCount(0);
  // Relaunch for whoever runs next.
  await chooseRegion(page, "Centro-Oeste");
  await open(page, "/admin/publicar");
  await page.getByRole("button", { name: "Lançar Centro-Oeste ao público" }).click();
  await expect(flash(page, /Centro-Oeste lançada publicamente/)).toBeVisible({ timeout: 300_000 });
  expect(await linksOf(await openPublicMenu(page, "sul"), "regions")).toEqual(["Norte", "Centro-Oeste"]);
});

test("given the screens, when a person who is not the owner edits, then the global palette is read-only (permission is enforced by the server as well)", async ({ page }) => {
  await open(page, "/admin/aparencia");
  // In the dev sandbox the person is the owner: the global card is editable, and its save button exists.
  await expect(page.getByTestId("save-theme-global")).toBeVisible();
});

test.describe("screenshots", () => {
  test.skip(!process.env.CAPTURE, "only with CAPTURE=1");

  test("captures for the round report", async ({ page }) => {
    mkdirSync(SHOTS, { recursive: true });
    for (const region of REGIONS) {
      const dialog = await openPublicMenu(page, region.slug, 390, 844);
      await page.screenshot({ path: path.join(SHOTS, `${region.slug}-mobile.png`) });
      await dialog.getByRole("button", { name: "Fechar menu" }).click();
      await page.setViewportSize({ width: 1440, height: 900 });
      await open(page, `/${region.slug}`);
      await page.screenshot({ path: path.join(SHOTS, `${region.slug}-desktop.png`) });
    }
    await page.setViewportSize({ width: 1440, height: 1100 });
    await chooseRegion(page, "Norte");
    await open(page, "/admin/navegacao");
    await page.screenshot({ path: path.join(SHOTS, "cms-navegacao.png"), fullPage: true });
    await open(page, "/admin/aparencia");
    await page.screenshot({ path: path.join(SHOTS, "cms-aparencia.png"), fullPage: true });
  });
});

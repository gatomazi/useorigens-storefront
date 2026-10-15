#!/usr/bin/env node
/**
 * Real captures of the guided help on the storefront's design page (src/components/catalog/PdpGuide.tsx), for the conversion report.
 *
 *   node scripts/qa/guia-storefront.mjs <outDir> [--base=http://127.0.0.1:3100] [--only=sul,norte,centro-oeste] [--label=depois] [--prod-before]
 *
 * Every state is really executed (nothing is mocked but the API failure, which is a blocked request): invite, city search, city results,
 * collections, collection results, dismissed, error — on a phone (390×844) and a desktop (1440×900); the invite also at 375 and 320.
 * `--prod-before` adds the same page in production (the Sul, the only region launched there) without the guide, as the "antes".
 * Files: `<região>-estampa-guia-<estado>-<mobile-390|desktop-1440>-<label>.png`.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, devices } from "@playwright/test";

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => a.replace(/^--/, "").split("=")));
const outDir = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "docs/screenshots/conversao-use-origens";
const base = args.base ?? "http://127.0.0.1:3100";
const label = args.label ?? "depois";
const only = (args.only ?? "sul,norte,centro-oeste").split(",");
mkdirSync(outDir, { recursive: true });

const PAGES = {
  sul: { path: "/sul/sc/florianopolis/feito-em", search: "tijuc", city: "Tijucas" },
  norte: { path: "/norte/pa/belem/feito-em", search: "manau", city: "Manaus" },
  "centro-oeste": { path: "/centro-oeste/go/goiania/feito-em", search: "aguas cl", city: "Águas Claras" },
};
const VIEWPORTS = {
  "mobile-390": { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } },
  "desktop-1440": { viewport: { width: 1440, height: 900 } },
};
const INVITE = "Procurando sua cidade ou outra estampa?";

const browser = await chromium.launch();
const shot = async (page, name, opts = {}) => {
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(outDir, `${name}.png`), ...opts });
  console.log("  ", name);
};
async function acceptCookies(page) {
  const accept = page.getByRole("region", { name: "Preferências de cookies" }).getByRole("button", { name: /Aceitar/ });
  if (await accept.isVisible({ timeout: 2500 }).catch(() => false)) await accept.click();
}
/** The invite in the middle of the screen. */
async function scrollToInvite(page) {
  await page.getByRole("region", { name: INVITE }).evaluate((el) => el.scrollIntoView({ block: "center" }));
}

for (const region of only) {
  const cfg = PAGES[region];
  console.log(region, cfg.path);
  for (const [vp, device] of Object.entries(VIEWPORTS)) {
    const context = await browser.newContext({ ...device, locale: "pt-BR" });
    const page = await context.newPage();
    const url = base + cfg.path;
    const name = (state) => `${region}-estampa-guia-${state}-${vp}-${label}`;

    // 1. First visit: the page as it opens (invite under the purchase block, nothing open).
    await page.goto(url, { waitUntil: "networkidle" });
    await page.getByRole("region", { name: INVITE }).waitFor();
    await shot(page, name("convite-primeira-visita"));
    await acceptCookies(page);
    await scrollToInvite(page);
    await shot(page, name("convite"));

    // 2. City path.
    await page.getByRole("button", { name: "Buscar uma cidade" }).click();
    const sheet = page.locator("dialog[open]");
    await sheet.getByRole("combobox").fill(cfg.search);
    await sheet.getByRole("option").first().waitFor();
    await shot(page, name("busca"));
    await sheet.getByRole("option", { name: new RegExp(cfg.city) }).first().click();
    await sheet.getByRole("heading", { name: `Estampas de ${cfg.city}` }).waitFor();
    await sheet.locator('[data-pdp-guide="results"] img').first().waitFor();
    await page.waitForTimeout(600);
    await shot(page, name("cidade-resultados"));
    await page.keyboard.press("Escape");

    // 3. Prints path.
    await scrollToInvite(page);
    await page.getByRole("button", { name: "Ver outras estampas" }).click();
    await sheet.getByRole("heading", { name: "Ver outras estampas" }).waitFor();
    await page.waitForTimeout(600);
    await shot(page, name("colecoes"));
    const first = sheet.locator('[data-pdp-guide="collections"] button').first();
    await first.click();
    await sheet.locator('[data-pdp-guide="results"] img').first().waitFor();
    await sheet.getByRole("link", { name: /Ver a coleção completa/ }).waitFor();
    await page.waitForTimeout(600);
    await shot(page, name("colecao-resultados"));
    await page.keyboard.press("Escape");

    // 4. "Mais estampas de <cidade>": the page's own list.
    await scrollToInvite(page);
    await page.getByRole("button", { name: /^Mais estampas de/ }).click();
    await page.waitForTimeout(900);
    await shot(page, name("mais-estampas"));

    // 5. API down: the guide says so, the purchase is untouched.
    await page.route("**/api/guia/**", (route) => route.abort());
    await scrollToInvite(page);
    await page.getByRole("button", { name: "Ver outras estampas" }).click();
    await sheet.locator('[data-pdp-guide="collections"] button').first().click();
    await sheet.getByText("Não conseguimos carregar agora.").waitFor();
    await shot(page, name("erro"));
    await page.keyboard.press("Escape");
    await page.unroute("**/api/guia/**");

    // 6. Dismissed: the one reopen line, and the memory after a reload.
    await scrollToInvite(page);
    await page.getByRole("button", { name: "Dispensar esta ajuda" }).click();
    await page.locator('[data-pdp-guide="reopen"]').waitFor();
    await page.locator('[data-pdp-guide="reopen"]').evaluate((el) => el.scrollIntoView({ block: "center" }));
    await shot(page, name("dispensado"));
    await page.reload({ waitUntil: "networkidle" });
    await page.locator('[data-pdp-guide="reopen"]').waitFor();
    await page.locator('[data-pdp-guide="reopen"]').getByRole("button").click();
    await sheet.getByRole("button", { name: "Buscar uma cidade" }).waitFor();
    await shot(page, name("reaberto"));
    await context.close();
  }

  // Small phones: the invite at 375 and 320 (overflow is asserted by tests/e2e/pdp-guide.spec.ts; this shows it).
  for (const width of [375, 320]) {
    const context = await browser.newContext({ ...devices["iPhone 13"], viewport: { width, height: width === 375 ? 812 : 640 }, locale: "pt-BR" });
    const page = await context.newPage();
    await page.goto(base + cfg.path, { waitUntil: "networkidle" });
    await acceptCookies(page);
    await scrollToInvite(page);
    await shot(page, `${region}-estampa-guia-convite-mobile-${width}-${label}`);
    await context.close();
  }
}

if ("prod-before" in args && only.includes("sul")) {
  console.log("produção (antes)");
  for (const [vp, device] of Object.entries(VIEWPORTS)) {
    const context = await browser.newContext({ ...device, locale: "pt-BR" });
    const page = await context.newPage();
    await page.goto("https://www.useorigens.com.br" + PAGES.sul.path, { waitUntil: "networkidle" });
    await acceptCookies(page);
    await page.getByRole("link", { name: "Escolher tamanho na loja" }).evaluate((el) => el.scrollIntoView({ block: "center" }));
    await shot(page, `sul-estampa-guia-convite-${vp}-antes`);
    await context.close();
  }
}

await browser.close();

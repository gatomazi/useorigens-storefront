// Entrada do checkout da INK (só a primeira tela, nada é preenchido nem pago): PDP → modelo/cor/tamanho → adicionar → drawer → "Finalizar compra".
//   node scripts/qa/conversao-checkout-entry.mjs <outDir> [label]
import { chromium, devices } from "@playwright/test";
import path from "node:path";
const [OUT, LABEL = "antes"] = process.argv.slice(2);
const browser = await chromium.launch();
const jsClick = (page, sel) => page.evaluate((x) => { const el = [...document.querySelectorAll(x)].find((e) => e.getClientRects().length); if (!el) return false; el.scrollIntoView({ block: "center", behavior: "instant" }); el.click(); return true; }, sel);
for (const [vp, opts] of [["desktop-1440", { viewport: { width: 1440, height: 900 } }], ["mobile-390", { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } }]]) {
  const ctx = await browser.newContext({ ...opts, locale: "pt-BR" });
  await ctx.route(/googletagmanager|google-analytics|facebook|connect\.facebook|newrelic|nr-data|tiktok|doubleclick|clarity\.ms|hotjar/, (r) => r.abort());
  const page = await ctx.newPage();
  await page.goto("https://www.usesul.com.br/usesul/product/feito-em-florianopolis", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('form[id^="form-product-"]', { timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { const b = [...document.querySelectorAll(".cookie-acceptance button")].find((e) => /aceitar/i.test(e.textContent)); if (b) b.click(); });
  for (const id of ["4714617-model-Masculino", "4714617-color-Preta", "4714617-size-M"]) { await jsClick(page, `label[for="${id}"]`); await page.waitForTimeout(1300); }
  await jsClick(page, "#add-to-cart-desk");
  await page.waitForSelector("#modal-wrapper .checkout-btn", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1000);
  await jsClick(page, "#modal-wrapper .checkout-btn");
  await page.waitForSelector("#checkout-btn", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const before = await page.evaluate(() => { const b = document.getElementById("checkout-btn"); const r = b && b.getBoundingClientRect(); return b ? { text: b.textContent.trim(), visible: r.height > 0 && r.bottom <= innerHeight, y: Math.round(r.top) } : null; });
  console.log(vp, "drawer", JSON.stringify(before));
  await jsClick(page, "#checkout-btn");
  await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(4000);
  const url = page.url().replace(/\?.*$/, "?…");
  console.log(vp, "checkout url", url, JSON.stringify(await page.evaluate(() => ({ h1: document.querySelector("h1")?.textContent?.trim().slice(0, 60), title: document.title.slice(0, 60), forms: document.querySelectorAll("form").length, inputs: [...document.querySelectorAll("input:not([type=hidden])")].map((i) => i.type + ":" + (i.name || i.id)).slice(0, 8) }))));
  await page.screenshot({ path: path.join(OUT, `sul-checkout-entrada-${vp}-${LABEL}.png`) });
  await ctx.close();
}
await browser.close();

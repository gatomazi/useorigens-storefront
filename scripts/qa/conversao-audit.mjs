// Auditoria de conversão (rodada 10/2026): capturas REAIS da vitrine (useorigens.com.br) e das PDPs da INK das três lojas, em 1440×900 e
// 390×844 (home, cidade e PDP também em 375×812 e 320×640), com os estados executados de verdade: primeira visita, retorno, CTA com variantes,
// tamanho pendente, pós-adição, drawer do carrinho, volta à vitrine com carrinho. Nunca finaliza pedido nem pagamento; tags de analytics bloqueadas.
//   node scripts/qa/conversao-audit.mjs <outDir> [--only=sul,norte,centro-oeste] [--label=antes] [--storefront=https://www.useorigens.com.br]
import { chromium, devices } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = Object.fromEntries(process.argv.slice(3).map((a) => { const m = /^--([^=]+)=(.*)$/.exec(a); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
const OUT = process.argv[2] || "docs/screenshots/conversao-use-origens";
const LABEL = args.label || "antes";
const STOREFRONT = (args.storefront || "https://www.useorigens.com.br").replace(/\/$/, "");
const ONLY = args.only ? String(args.only).split(",") : ["sul", "norte", "centro-oeste"];
const SKIP_INK = args["skip-ink"] === true;
const SKIP_SITE = args["skip-site"] === true;
mkdirSync(OUT, { recursive: true });
const metrics = [];
const note = (name, data) => { metrics.push({ name, ...data }); console.log(name, JSON.stringify(data)); };

const REGIONS = {
  sul: { ink: "https://www.usesul.com.br", base: "/usesul", city: "feito-em-florianopolis", editorial: "paranaense-pe-vermelho",
    pages: [["home", "/sul"], ["estado", "/sul/sc"], ["cidade", "/sul/sc/florianopolis"], ["estampa", "/sul/sc/florianopolis/feito-em"], ["colecao", "/sul/colecoes/da-nossa-terra"], ["busca", "/sul/busca?q=floripa"]] },
  norte: { ink: "https://www.usenorte.com.br", base: "/usenorte", city: "assis-brasil-origem-ac", editorial: "ilha-do-bananal-063",
    pages: [["home", "/norte"], ["estado", "/norte/am"], ["cidade", "/norte/am/manaus"], ["estampa", "/norte/am/manaus/ponto-de-origem"], ["colecao", "/norte/colecoes/made-in-norte"], ["busca", "/norte/busca?q=manaus"]] },
  "centro-oeste": { ink: "https://www.usecentro.com.br", base: "/usecentro", city: "goiania-origem-go", editorial: "e-bem-mato-grosso",
    pages: [["home", "/centro-oeste"], ["estado", "/centro-oeste/go"], ["cidade", "/centro-oeste/go/goiania"], ["estampa", "/centro-oeste/go/goiania/ponto-de-origem"], ["colecao", "/centro-oeste/colecoes/identidade"], ["busca", "/centro-oeste/busca?q=goiania"]] },
};
const VIEWPORTS = {
  "desktop-1440": { viewport: { width: 1440, height: 900 } },
  "mobile-390": { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } },
  "mobile-375": { ...devices["iPhone 13"], viewport: { width: 375, height: 812 } },
  "mobile-320": { ...devices["iPhone 13"], viewport: { width: 320, height: 640 } },
};
const BLOCK = /googletagmanager|google-analytics|facebook|connect\.facebook|newrelic|nr-data|tiktok|doubleclick|clarity\.ms|hotjar/;

const browser = await chromium.launch();
const file = (region, page, state, vp) => path.join(OUT, `${region}-${page}-${state}-${vp}-${LABEL}.png`);
const shot = (page, p, full = false) => page.screenshot({ path: p, fullPage: full });
const wait = (page, ms) => page.waitForTimeout(ms);

async function context(vpName) {
  const ctx = await browser.newContext({ ...VIEWPORTS[vpName], locale: "pt-BR" });
  await ctx.route(BLOCK, (r) => r.abort());
  return ctx;
}

// Métricas comuns de uma página (overflow, elementos fixos visíveis, LCP de laboratório).
const pageMetrics = (page) => page.evaluate(() => new Promise((resolve) => {
  const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden";
  const fixed = [...document.querySelectorAll("body *")].filter((e) => { const cs = getComputedStyle(e); return (cs.position === "fixed" || cs.position === "sticky") && vis(e) && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0; })
    .map((e) => { const r = e.getBoundingClientRect(); return { el: (e.tagName + (e.id ? "#" + e.id : "") + "." + String(e.className || "").trim().split(/\s+/).slice(0, 2).join(".")).slice(0, 60), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })
    .filter((f) => f.x < document.documentElement.clientWidth && f.y < innerHeight && f.x + f.w > 0 && f.y + f.h > 0).slice(0, 14);
  const out = { docW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth, docH: document.documentElement.scrollHeight, h1: [...document.querySelectorAll("h1")].map((h) => h.textContent.trim().slice(0, 60)), fixed };
  try {
    const po = new PerformanceObserver((list) => { const last = list.getEntries().pop(); if (last) out.lcpMs = Math.round(last.startTime); });
    po.observe({ type: "largest-contentful-paint", buffered: true });
    setTimeout(() => { po.disconnect(); resolve(out); }, 300);
  } catch { resolve(out); }
}));

// ─── Vitrine (storefront) ─────────────────────────────────────────────────────────────────────────────────────────────
async function storefront(region, cfg) {
  for (const vp of ["desktop-1440", "mobile-390", "mobile-375", "mobile-320"]) {
    const pages = vp === "desktop-1440" || vp === "mobile-390" ? cfg.pages : cfg.pages.filter(([n]) => n === "home" || n === "cidade");
    const ctx = await context(vp);
    const page = await ctx.newPage();
    let first = true;
    for (const [name, p] of pages) {
      try {
        await page.goto(STOREFRONT + p, { waitUntil: "networkidle", timeout: 90000 });
        await wait(page, 1200);
        const state = first ? "primeira-visita" : "retorno";
        await shot(page, file(region, name, state, vp));
        if (vp === "desktop-1440" || vp === "mobile-390") await shot(page, file(region, name, state + "-pagina-inteira", vp), true);
        note(`${region} ${name} ${vp} ${state}`, await pageMetrics(page));
        if (first) {
          // Aceita o banner de cookies da vitrine (primeira visita) para as páginas seguintes contarem como retorno.
          const accept = page.getByRole("region", { name: "Preferências de cookies" }).getByRole("button", { name: /Aceitar/ });
          if (await accept.count()) { await accept.first().click(); await wait(page, 400); }
          first = false;
        }
      } catch (e) { note(`${region} ${name} ${vp} ERRO`, { error: e.message.slice(0, 160) }); }
    }
    await ctx.close();
  }
}

// ─── INK ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const inkState = (page) => page.evaluate(() => {
  const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden";
  const rect = (e) => { if (!vis(e)) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const overlap = (a, b) => !!a && !!b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const price = [...document.querySelectorAll('.details-product [class*="price"]')].find((e) => vis(e) && /R\$/.test(e.textContent) && !e.closest("[data-origens-reco], .buy-together, .modal-buy-together, #modal-wrapper, .cart-drawer"));
  const fab = document.querySelector("[data-origens-promo-fab], .o-promo-fab, button[aria-label*='upon' i]");
  const cookie = document.querySelector(".cookie-acceptance");
  const ctaDesk = document.getElementById("add-to-cart-desk");
  const ctaMob = document.querySelector(".form-product-options__add-to-cart-mobile");
  const discovery = document.querySelector('[data-origens-discovery="product"]');
  const reco = document.querySelector("[data-origens-reco]");
  const form = [...document.querySelectorAll('form[id^="form-product-"]')].find((f) => !f.closest(".modal-buy-together, #quick_add_frame, #modal-wrapper"));
  const errors = [...document.querySelectorAll('[class*="error"], [class*="alert"], [role="alert"]')].filter(vis).map((e) => e.textContent.replace(/\s+/g, " ").trim().slice(0, 90)).filter(Boolean);
  return {
    loader: window.__useOrigensLoader || null, docW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth,
    price: price ? price.textContent.replace(/\s+/g, " ").trim().slice(0, 40) : null, priceRect: rect(price), fab: rect(fab), cookie: rect(cookie), ctaDesk: rect(ctaDesk), ctaMob: rect(ctaMob),
    fabOverPrice: overlap(rect(fab), rect(price)), fabOverCta: overlap(rect(fab), rect(ctaDesk)) || overlap(rect(fab), rect(ctaMob)),
    discovery: rect(discovery), reco: rect(reco), formId: form ? form.id : null, errors,
    drawerPostAdd: vis(document.querySelector("#modal-wrapper")) && /Produto adicionado/i.test(document.querySelector("#modal-wrapper")?.textContent || ""),
    cartDrawer: (() => { const d = document.querySelector(".cart-drawer"); if (!vis(d)) return null; const r = d.getBoundingClientRect(); return r.x < document.documentElement.clientWidth ? rect(d) : null; })(),
    whatsapp: rect([...document.querySelectorAll("a[href*='wa.me'], a[href*='whatsapp']")].find(vis)),
    stickyTop: rect(document.querySelector("header, .o-nav")),
  };
});
async function jsClick(page, selector) { return page.evaluate((sel) => { const el = [...document.querySelectorAll(sel)].find((e) => e.getClientRects().length); if (!el) return false; el.scrollIntoView({ block: "center", behavior: "instant" }); el.click(); return true; }, selector); }
async function openInk(page, url) {
  for (let n = 1; n <= 2; n++) {
    try { await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }); await page.waitForSelector('form[id^="form-product-"]', { timeout: 30000 }); return; }
    catch (e) { if (n === 2) throw e; await wait(page, 1500); }
  }
}
async function ink(region, cfg) {
  for (const kind of ["cidade", "editorial"]) {
    const slug = kind === "cidade" ? cfg.city : cfg.editorial;
    const url = `${cfg.ink}${cfg.base}/product/${slug}`;
    for (const vp of ["desktop-1440", "mobile-390", "mobile-375", "mobile-320"]) {
      const full = vp === "desktop-1440" || vp === "mobile-390";
      if (!full && kind === "editorial") continue;
      const ctx = await context(vp);
      const page = await ctx.newPage();
      const pdp = `pdp-${kind}`;
      try {
        // 1. Primeira visita: aviso de cookies da INK, cupom, abas, CTA fixo.
        await openInk(page, url);
        await wait(page, 3500);
        await shot(page, file(region, pdp, "primeira-visita", vp));
        note(`${region} ${pdp} ${vp} primeira-visita`, await inkState(page));
        if (full) await shot(page, file(region, pdp, "primeira-visita-pagina-inteira", vp), true);
        // 2. Variantes + CTA (rolagem até o formulário) com o aviso ainda na tela.
        await page.evaluate(() => document.getElementById("add-to-cart-desk")?.scrollIntoView({ block: "center", behavior: "instant" }));
        await wait(page, 1200);
        await shot(page, file(region, pdp, "cta-variantes", vp));
        note(`${region} ${pdp} ${vp} cta-variantes`, await inkState(page));
        if (!full) { await ctx.close(); continue; }
        // 3. Tamanho pendente: tenta adicionar sem escolher nada.
        await jsClick(page, "#add-to-cart-desk");
        await wait(page, 1200);
        await shot(page, file(region, pdp, "tamanho-pendente", vp));
        note(`${region} ${pdp} ${vp} tamanho-pendente`, await inkState(page));
        // 4. Aceita o aviso de cookies e volta ao topo (retorno).
        const accepted = await page.evaluate(() => { const b = [...document.querySelectorAll(".cookie-acceptance button")].find((e) => /aceitar/i.test(e.textContent)); if (!b) return false; b.click(); return true; });
        await wait(page, 600);
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
        await wait(page, 600);
        await shot(page, file(region, pdp, "retorno-sem-aviso", vp));
        note(`${region} ${pdp} ${vp} retorno-sem-aviso`, { accepted, ...(await inkState(page)) });
        // 5. Escolhe modelo, cor e tamanho; adiciona ao carrinho (sem checkout).
        const formId = await page.evaluate(() => [...document.querySelectorAll('form[id^="form-product-"]')].find((f) => !f.closest(".modal-buy-together, #quick_add_frame, #modal-wrapper"))?.id.replace("form-product-", ""));
        for (const sel of [`label[for="${formId}-model-Masculino"]`, `label[for="${formId}-model-Feminino"]`]) { if (await jsClick(page, sel)) break; }
        await wait(page, 1500);
        await jsClick(page, `label[for^="${formId}-color-"]`);
        await wait(page, 1500);
        await jsClick(page, `label[for="${formId}-size-M"], label[for^="${formId}-size-"]`);
        await wait(page, 800);
        await page.evaluate(() => document.getElementById("add-to-cart-desk")?.scrollIntoView({ block: "center", behavior: "instant" }));
        await wait(page, 500);
        await shot(page, file(region, pdp, "variantes-escolhidas", vp));
        note(`${region} ${pdp} ${vp} variantes-escolhidas`, await inkState(page));
        await jsClick(page, "#add-to-cart-desk");
        await page.waitForFunction(() => { const m = document.querySelector("#modal-wrapper"); return m && m.getClientRects().length > 0 && /Produto adicionado/i.test(m.textContent); }, null, { timeout: 20000 }).catch(() => {});
        await wait(page, 1500);
        await shot(page, file(region, pdp, "pos-adicao", vp));
        note(`${region} ${pdp} ${vp} pos-adicao`, await inkState(page));
        // 6. Drawer do carrinho.
        await jsClick(page, ".checkout-btn, #modal-wrapper a[href*='cart'], #modal-wrapper button.checkout-btn");
        await wait(page, 2500);
        let st = await inkState(page);
        if (!st.cartDrawer) { await jsClick(page, "#shopping-cart-menu-mob, #shopping-cart-menu, .cart-shopping, a[href$='/cart']"); await wait(page, 2500); st = await inkState(page); }
        await shot(page, file(region, pdp, "carrinho", vp));
        note(`${region} ${pdp} ${vp} carrinho`, st);
        // 7. Entrada do checkout (só a primeira tela; nada é preenchido).
        const went = await jsClick(page, ".cart-drawer a[href*='checkout'], .cart-drawer button[type=submit], .cart-drawer .checkout-btn");
        if (went) { await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {}); await wait(page, 3000); await shot(page, file(region, pdp, "entrada-checkout", vp)); note(`${region} ${pdp} ${vp} entrada-checkout`, { url: page.url().replace(/\?.*$/, "?…"), ...(await pageMetrics(page)) }); }
        // 8. Volta à vitrine com carrinho: reabre a PDP, abre o carrinho e segue "Explorar todas as estampas" do bloco do carrinho.
        await openInk(page, url);
        await wait(page, 2500);
        await jsClick(page, "#shopping-cart-menu-mob, #shopping-cart-menu, .cart-shopping, a[href$='/cart']");
        await page.waitForSelector('[data-origens-discovery="cart"] .o-cta', { timeout: 15000 }).catch(() => {});
        await wait(page, 800);
        await shot(page, file(region, pdp, "carrinho-retorno", vp));
        const link = await page.evaluate(() => { const a = document.querySelector('[data-origens-discovery="cart"] .o-cta'); if (!a) return null; a.click(); return a.href.replace(/cart_ref=[^&]+/, "cart_ref=<token>"); });
        if (link) {
          await page.waitForURL(/useorigens\.com\.br/, { timeout: 45000 }).catch(() => {});
          await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
          await wait(page, 1500);
          const mirror = page.getByRole("button", { name: /Meu carrinho/ });
          if (await mirror.count()) { await mirror.first().click(); await wait(page, 2500); }
          await shot(page, file(region, pdp, "vitrine-com-carrinho", vp));
          note(`${region} ${pdp} ${vp} vitrine-com-carrinho`, { link, url: page.url().replace(/cart_ref=[^&]+/, "cart_ref=<token>"), ...(await pageMetrics(page)) });
        } else note(`${region} ${pdp} ${vp} vitrine-com-carrinho`, { error: "sem link do bloco do carrinho" });
      } catch (e) { note(`${region} ${pdp} ${vp} ERRO`, { error: e.message.slice(0, 200) }); }
      await ctx.close();
    }
  }
}

for (const region of ONLY) {
  const cfg = REGIONS[region];
  if (!SKIP_SITE) await storefront(region, cfg);
  if (!SKIP_INK) await ink(region, cfg);
}
await browser.close();
writeFileSync(path.join(OUT, `_metricas-${LABEL}-${ONLY.join("-")}${SKIP_INK ? "-site" : SKIP_SITE ? "-ink" : ""}.json`), JSON.stringify(metrics, null, 1));
console.log("done", metrics.length);

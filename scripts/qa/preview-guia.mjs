#!/usr/bin/env node
/**
 * Interactive preview of the guided help on a design page: two real Chrome windows on the local storefront — a desktop (1440×900) and a
 * phone (390×844, touch) — kept open until Ctrl+C.
 *
 *   node scripts/qa/preview-guia.mjs [--base=http://127.0.0.1:3100] [--path=/sul/sc/florianopolis/feito-em]
 */
import { chromium, devices } from "@playwright/test";

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => a.replace(/^--/, "").split("=")));
const base = args.base ?? "http://127.0.0.1:3100";
const pagePath = args.path ?? "/sul/sc/florianopolis/feito-em";

const browser = await chromium.launch({ headless: false, channel: "chrome" }).catch(() => chromium.launch({ headless: false }));
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR" });
const mobile = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, locale: "pt-BR" });
const d = await desktop.newPage();
const m = await mobile.newPage();
await Promise.all([d.goto(base + pagePath), m.goto(base + pagePath)]);
console.log(`Prévia aberta em ${base}${pagePath} (desktop 1440×900 e celular 390×844). Ctrl+C para fechar.`);
await new Promise((resolve) => {
  process.on("SIGINT", resolve);
  process.on("SIGTERM", resolve);
  browser.on("disconnected", resolve);
});
await browser.close().catch(() => {});

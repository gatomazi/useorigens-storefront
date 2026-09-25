#!/usr/bin/env node
// QA de navegação ponta a ponta do consumidor do espelho, com a INK REAL (produção) e o storefront LOCAL (`next start`):
//   PW_PATH=/tmp/pw node scripts/qa-cart-mirror-roundtrip.mjs [--width 1280] [--store http://localhost:3100]
// Só a rota /api/cart-mirror do storefront é respondida com um snapshot de teste (o Worker segue com cart-mirror OFF).
// Sessão anônima descartável, janela visível (a INK bloqueia headless); o banner de cookies não é aceito; nada é adicionado ao carrinho.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire((process.env.PW_PATH || '.') + '/');
const { chromium } = require('playwright-core');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const WIDTH = Number(arg('--width', 1280)); const HEIGHT = WIDTH < 768 ? (WIDTH === 320 ? 640 : 844) : 800;
const STORE = arg('--store', 'http://localhost:3100'); const OUT = arg('--out', 'docs/evidence/cart-mirror'); mkdirSync(OUT, { recursive: true });
const REF = 'AbCdEfGhIjKlMnOpQrStUv';
const IMG = 'https://gcp-images.majestic.ink.rsvcloud.com/images/product_art/final_image/1880b16e4d326a02dea0508acc56925d.jpg';
const snap = { v: 1, count: 2, items: [0, 1].map((i) => ({ productId: String(4932916 + i), name: 'Serra Catarinense', color: ['Preta', 'Branca'][i], size: 'M', quantity: 1, linePriceText: 'R$ 109,90', image: IMG })), totalText: 'R$ 219,80', ageSeconds: 90, expiresInSeconds: 1700 };
const results = []; const check = (n, ok, d = '') => { results.push(!!ok); console.log((ok ? 'PASS ' : 'FAIL ') + n + (d ? '  — ' + d : '')); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--window-size=' + (WIDTH + 20) + ',' + (HEIGHT + 120)] }).catch(() => chromium.launch({ headless: false }));
const ctx = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, locale: 'pt-BR' });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.route('**/api/cart-mirror**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'cache-control': 'no-store' }, body: JSON.stringify(snap) }));

// 1. storefront com o token → resumo → "Ir para meu carrinho"
await page.goto(STORE + '/sul?utm_source=qa&cart_ref=' + REF, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid=cart-mirror-trigger]', { timeout: 30000 });
check('storefront: token removido da URL, outros params preservados', new URL(page.url()).search === '?utm_source=qa', page.url());
await page.click('[data-testid=cart-mirror-trigger]'); await page.waitForSelector('[data-testid=cart-mirror-item]'); await wait(900);
await page.screenshot({ path: OUT + '/roundtrip-1-storefront-w' + WIDTH + '.jpg', type: 'jpeg', quality: 80 });
const href = await page.getAttribute('[data-testid=cart-mirror-go]', 'href');
check('"Ir para meu carrinho" aponta para a Serra com origens_open_cart=1', href === 'https://www.usesul.com.br/usesul/product/serra-catarinense?origens_open_cart=1', href);

// 2. INK real: a página autorizada abre o drawer nativo sozinha
await Promise.all([page.waitForURL(/usesul\.com\.br\/usesul\/product\/serra-catarinense/, { timeout: 60000 }), page.click('[data-testid=cart-mirror-go]')]);
const opened = await page.waitForSelector('.cart-drawer.open', { timeout: 30000 }).then(() => true).catch(() => false);
check('INK: o loader abriu o drawer NATIVO do carrinho (origens_open_cart=1)', opened);
await wait(1500);
check('INK: parâmetro origens_open_cart removido da URL', !page.url().includes('origens_open_cart'), page.url());
const ink = await page.evaluate(() => ({ loader: window.__useOrigensLoader, blocks: document.querySelectorAll('.cart-drawer [data-origens-discovery="cart"]').length, cartRefInUrl: location.href.includes('cart_ref') }));
check('INK: loader 4.0 com o bloco cart-discovery, sem cart_ref na URL', ink.loader === '4.0' && ink.blocks === 1 && !ink.cartRefInUrl, JSON.stringify(ink));
await page.screenshot({ path: OUT + '/roundtrip-2-ink-drawer-w' + WIDTH + '.jpg', type: 'jpeg', quality: 80 });

// 3. volta ao storefront: continua navegável e o token continua só na sessão desta aba
await page.goto(STORE + '/sul', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid=cart-mirror-trigger]', { timeout: 30000 }).then(() => check('volta ao storefront: "Meu carrinho" reaparece a partir do token da sessão', true)).catch(() => check('volta ao storefront: "Meu carrinho" reaparece a partir do token da sessão', false));
await page.click('[data-testid=cart-mirror-trigger]'); await page.click('[data-testid=cart-mirror-continue]'); await wait(300);
check('"Continuar escolhendo" fecha o painel e mantém no storefront', new URL(page.url()).pathname === '/sul' && !(await page.isVisible('[data-testid=cart-mirror-dialog]')));
await page.goto(STORE + '/sul/sc', { waitUntil: 'domcontentloaded' });
check('storefront navegável depois da volta (/sul/sc)', (await page.locator('h1').count()) > 0 && new URL(page.url()).pathname === '/sul/sc');
const store = await page.evaluate(() => ({ s: Object.keys(sessionStorage), l: Object.keys(localStorage).filter((k) => !k.startsWith('useorigens:consent')) }));
check('só o token em sessionStorage; nada em localStorage', store.s.join() === 'origens:cart_ref' && store.l.length === 0, JSON.stringify(store));
check('nenhum erro de página atribuível ao storefront', errors.filter((e) => !/buttons|eventIDViewContent|controller/.test(e)).length === 0, errors.join(' | ').slice(0, 200));
console.log('RESUMO roundtrip w' + WIDTH + ': ' + results.filter(Boolean).length + ' PASS, ' + results.filter((x) => !x).length + ' FAIL');
await browser.close(); process.exit(results.every(Boolean) ? 0 : 1);

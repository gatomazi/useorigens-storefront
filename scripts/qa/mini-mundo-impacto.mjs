// Mede o impacto do "Meu Pequeno Mundo" nas páginas da loja: requisições, bytes transferidos, JS e se algum recurso 3D (Three.js)
// foi carregado. Roda contra um `next start` (build de produção) e salva um JSON para comparar a base com a versão alterada.
// Usage: node scripts/qa/mini-mundo-impacto.mjs <saida.json> [baseUrl] [rótulo]
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const [saida, base = "http://127.0.0.1:3100", rotulo = "build"] = process.argv.slice(2);
if (!saida) throw new Error("uso: node scripts/qa/mini-mundo-impacto.mjs <saida.json> [baseUrl] [rótulo]");

const PAGINAS = [
  { nome: "home Sul", caminho: "/sul" },
  { nome: "cidade (Florianópolis)", caminho: "/sul/sc/florianopolis" },
  { nome: "produto (Ponto de Origem, Florianópolis)", caminho: "/sul/sc/florianopolis/ponto-de-origem" },
  { nome: "cidade (Tijucas)", caminho: "/sul/sc/tijucas" },
];
const browser = await chromium.launch();
const resultado = { rotulo, base, quando: new Date().toISOString(), paginas: [] };
for (const vp of [{ nome: "desktop", viewport: { width: 1440, height: 900 } }, { nome: "mobile", viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }]) {
  for (const p of PAGINAS) {
    const ctx = await browser.newContext({ viewport: vp.viewport, isMobile: vp.isMobile, hasTouch: vp.hasTouch, locale: "pt-BR" });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    const bytesPorId = new Map();
    const urlPorId = new Map();
    cdp.on("Network.responseReceived", (e) => urlPorId.set(e.requestId, { url: e.response.url, tipo: e.type }));
    cdp.on("Network.loadingFinished", (e) => bytesPorId.set(e.requestId, e.encodedDataLength));
    const js = [];
    page.on("response", async (r) => {
      if (r.request().resourceType() !== "script") return;
      try { const corpo = await r.text(); js.push({ url: r.url(), tem3d: /WebGLRenderer|OrbitControls/.test(corpo) }); } catch { /* resposta sem corpo */ }
    });
    const t0 = Date.now();
    const resposta = await page.goto(base + p.caminho, { waitUntil: "load", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    const tempo = Date.now() - t0;
    const nav = await page.evaluate(() => {
      const n = performance.getEntriesByType("navigation")[0];
      return n ? { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) } : null;
    });
    let total = 0, totalJs = 0, req = 0;
    for (const [id, bytes] of bytesPorId) {
      const info = urlPorId.get(id);
      if (!info) continue;
      req++;
      total += bytes;
      if (info.tipo === "Script") totalJs += bytes;
    }
    const linksMundo = await page.$$eval('a[href*="meu-pequeno-mundo"]', (as) => as.map((a) => a.getAttribute("href")));
    resultado.paginas.push({
      viewport: vp.nome, pagina: p.nome, caminho: p.caminho, status: resposta?.status(), tempoAteOcioso: tempo, navegacao: nav,
      requisicoes: req, bytesTransferidos: total, bytesJs: totalJs, scripts: js.length, scripts3d: js.filter((x) => x.tem3d).map((x) => x.url),
      linksParaOMundo: linksMundo,
    });
    console.log(`${vp.nome.padEnd(7)} ${p.nome.padEnd(42)} ${resposta?.status()} req=${req} total=${(total / 1024).toFixed(0)}KB js=${(totalJs / 1024).toFixed(0)}KB 3d=${js.filter((x) => x.tem3d).length} links=${linksMundo.length}`);
    await ctx.close();
  }
}
await browser.close();
writeFileSync(saida, JSON.stringify(resultado, null, 2));

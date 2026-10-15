// QA da integração do "Meu Pequeno Mundo" à loja (v3): flag nos três modos, entradas (home, cidade, rodapé), chegada com sugestão de
// cidade, mundo por link e progresso salvo (v1 e v2), retorno à loja, links do ambiente, PNG com e sem lembranças, compartilhamento
// cancelado, privacidade do analytics (GA4 interceptado: nada de lembrança, busca ou mundo nas coletas), falhas isoladas (3D e dados)
// e capturas em 375 × 812 e 1440 × 900.
// Usage: node scripts/qa/mini-mundo-v3.mjs <outDir> --on <url> [--pagina <url>] [--off <url>]
//   Cada URL é a raiz de um `next start` com MEU_PEQUENO_MUNDO=on / pagina / off (servidores separados: cache ISR separado).
import { chromium, devices } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const outDir = args[0];
const opcao = (n) => { const i = args.indexOf(n); return i > 0 ? args[i + 1].replace(/\/$/, "") : null; };
const ON = opcao("--on"), PAGINA = opcao("--pagina"), OFF = opcao("--off");
if (!outDir || !ON) throw new Error("uso: node scripts/qa/mini-mundo-v3.mjs <outDir> --on <url> [--pagina <url>] [--off <url>]");
mkdirSync(outDir, { recursive: true });

const CWB = "4106902", POA = "4314902", GYN = "5208707", MAO = "1302603", FLN = "4205407", NT = "4211504";
const LEMBRANCA = "Minha avó 🌊 fazia pão aqui todo domingo";
const BUSCA = "Florian";
const ARGS_GL = ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"];
const browser = await chromium.launch({ args: ARGS_GL });
const resultado = { quando: new Date().toISOString(), servidores: { on: ON, pagina: PAGINA, off: OFF }, checagens: [], consoleErros: [], coletas: [] };
const checar = (nome, ok, detalhe = "") => {
  resultado.checagens.push({ nome, ok: !!ok, detalhe: String(detalhe).slice(0, 300) });
  console.log(`${ok ? "OK  " : "FALHOU"} ${nome}${detalhe ? ` — ${String(detalhe).slice(0, 200)}` : ""}`);
};
const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  mobile: { ...devices["iPhone 13"], viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 },
};
const CONSENTIMENTO = (escolha) => `localStorage.setItem("useorigens:consent:marketing", JSON.stringify({ choice: "${escolha}", version: 2, decidedAt: new Date().toISOString() }));`;

/** Página com GA4 interceptado: o gtag.js carrega de verdade; as coletas são respondidas com 204 e guardadas para inspeção. */
async function novaPagina(vp, { consentimento = "accepted", extraCtx = {}, antes = "", errosEsperados = null } = {}) {
  const ctx = await browser.newContext({ ...VIEWPORTS[vp], locale: "pt-BR", acceptDownloads: true, ...extraCtx });
  if (consentimento) await ctx.addInitScript(CONSENTIMENTO(consentimento));
  if (antes) await ctx.addInitScript(antes);
  const page = await ctx.newPage();
  const coletas = [], terceiros = [], pedidos = [];
  await page.route(/google-analytics\.com|googletagmanager\.com|analytics\.google\.com/, (r) => {
    const u = r.request().url();
    if (/\/g\/collect|\/collect\?/.test(u)) { coletas.push({ url: u, corpo: r.request().postData() ?? "" }); return r.fulfill({ status: 204, body: "" }); }
    return r.continue();
  });
  page.on("request", (q) => { const u = q.url(); pedidos.push(u); if (/facebook|fbevents|clarity\.ms/.test(u)) terceiros.push(u); });
  const esperado = (t) => errosEsperados?.test(t);
  page.on("console", (m) => { if (m.type() === "error" && !/net::ERR_|Failed to load resource/.test(m.text()) && !esperado(m.text())) resultado.consoleErros.push(`[${vp}] ${m.text()}`); });
  page.on("pageerror", (e) => { if (!esperado(e.message)) resultado.consoleErros.push(`[${vp}] pageerror: ${e.message}`); });
  return { ctx, page, coletas, terceiros, pedidos };
}
const pronta = (page) => page.waitForFunction(() => document.getElementById("status-cena")?.hidden || !document.getElementById("estatico")?.hidden, null, { timeout: 90000 });
const foto = (page, nome, opts = {}) => page.screenshot({ path: path.join(outDir, `${nome}.png`), ...opts });
const est = (page) => page.evaluate(() => window.__meuPequenoMundo.estado());
const altura = (page, sel) => page.$eval(sel, (n) => n.getBoundingClientRect().height);
const eventos = (coletas) => coletas.flatMap((c) => [c.url, ...c.corpo.split("\n")]).map((linha) => { try { return new URLSearchParams(linha.split("?")[1] ?? linha); } catch { return null; } }).filter((p) => p?.get("en"));
const evento = (coletas, nome) => eventos(coletas).filter((p) => p.get("en") === nome);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const status = async (url) => (await fetch(url, { redirect: "manual" })).status;
const html = async (url) => (await fetch(url)).text();
const pulados = [];
const pular = (nome, motivo) => { pulados.push({ nome, motivo }); console.log(`PULADO ${nome} — ${motivo}`); };
const esperarEvento = async (coletas, nome, filtro = () => true, ms = 20000) => {
  for (let t = 0; t < ms; t += 500) { if (evento(coletas, nome).some(filtro)) return true; await dormir(500); }
  return false;
};

// ---------------------------------------------------------------- 1. flag nos três modos (HTTP, sem navegador)
for (const [modo, base] of [["off", OFF], ["pagina", PAGINA], ["on", ON]]) {
  if (!base) continue;
  const pagina = await status(`${base}/meu-pequeno-mundo`), indice = await status(`${base}/api/mundo/indice`), perfis = await status(`${base}/api/mundo/perfis/4106902.json`);
  const home = await html(`${base}/sul`), cidade = await html(`${base}/sul/pr/curitiba`);
  const temEntradas = { home: home.includes("entrada=home"), rodape: home.includes("entrada=rodape"), cidade: cidade.includes(`entrada=cidade&amp;cidade=${CWB}`) || cidade.includes(`entrada=cidade&cidade=${CWB}`) };
  if (modo === "off") {
    checar(`[off] página, índice e perfis respondem 404`, pagina === 404 && indice === 404 && perfis === 404, `${pagina}/${indice}/${perfis}`);
    checar(`[off] nenhuma entrada na home, no rodapé ou na cidade`, !temEntradas.home && !temEntradas.rodape && !temEntradas.cidade && !home.includes("mundo-home-titulo"), JSON.stringify(temEntradas));
  } else {
    checar(`[${modo}] página, índice e perfis respondem 200`, pagina === 200 && indice === 200 && perfis === 200, `${pagina}/${indice}/${perfis}`);
    const doc = await html(`${base}/meu-pequeno-mundo`);
    const robots = doc.match(/<meta name="robots" content="([^"]+)"/)?.[1] ?? "";
    const canonical = doc.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? "";
    checar(`[${modo}] canonical sem parâmetros`, /\/meu-pequeno-mundo$/.test(canonical), canonical);
    if (modo === "pagina") {
      checar(`[pagina] página com noindex`, /noindex/.test(robots), robots);
      checar(`[pagina] nenhuma entrada na loja`, !temEntradas.home && !temEntradas.rodape && !temEntradas.cidade, JSON.stringify(temEntradas));
    } else {
      checar(`[on] metadados da página sem noindex próprio`, !/noindex/.test(robots), robots || "(sem meta robots)");
      checar(`[on] as três entradas aparecem (home, rodapé, cidade)`, temEntradas.home && temEntradas.rodape && temEntradas.cidade, JSON.stringify(temEntradas));
      for (const r of ["norte", "centro-oeste"]) {
        const h = await html(`${base}/${r}`);
        // o bloco entra depois da seção de estados; a configuração local destas regiões pode não ter essa seção (a de produção tem)
        if (!/aria-labelledby="(states|estados)-title"/.test(h)) pular(`[on] home /${r} com o bloco`, "a configuração local da home desta região não tem a seção de estados");
        else checar(`[on] home /${r} com o bloco e a loja certa no link`, h.includes(`entrada=home&amp;loja=${r}`) || h.includes(`entrada=home&loja=${r}`));
        checar(`[on] rodapé de /${r} com o link e a loja certa`, h.includes(`entrada=rodape&amp;loja=${r}`) || h.includes(`entrada=rodape&loja=${r}`));
      }
    }
  }
}
// o link antigo do protótipo
{
  const r = await fetch(`${ON}/meu-pequeno-mundo-use-origens.html?mundo=1&origem=${CWB}&presente=${GYN}`, { redirect: "manual" });
  const destino = r.headers.get("location") ?? "";
  checar("link antigo do protótipo redireciona com os parâmetros", [301, 302, 307, 308].includes(r.status) && destino.includes("/meu-pequeno-mundo?") && destino.includes(`origem=${CWB}`), `${r.status} → ${destino}`);
}

// ---------------------------------------------------------------- 2. entradas na loja (desktop e celular)
for (const vp of ["desktop", "mobile"]) {
  const { ctx, page, coletas, pedidos } = await novaPagina(vp);
  await page.goto(`${ON}/sul`, { waitUntil: "networkidle", timeout: 120000 });
  const bloco = page.locator("#mundo-home-titulo");
  await bloco.scrollIntoViewIfNeeded();
  await dormir(600);
  await foto(page, `${vp}-01-home-bloco`);
  const botao = 'a.btn[href*="entrada=home"]';
  checar(`[${vp}] home: bloco "Os lugares que fazem parte de você" com "Montar meu mundo"`, (await bloco.textContent())?.includes("Os lugares que fazem parte de você") && (await page.textContent(botao))?.trim() === "Montar meu mundo");
  checar(`[${vp}] home: botão com 44 px ou mais`, (await altura(page, botao)) >= 44, `${await altura(page, botao)} px`);
  const imagem = await page.$eval("#mundo-home-titulo >> xpath=ancestor::section//img", (i) => ({ ok: i.complete && i.naturalWidth > 0, src: i.currentSrc }));
  checar(`[${vp}] home: imagem estática carregada`, imagem.ok, imagem.src.slice(0, 90));
  const rodape = 'footer a[href*="entrada=rodape"]';
  checar(`[${vp}] rodapé: link "Meu Pequeno Mundo" com 44 px ou mais`, (await page.textContent(rodape))?.trim() === "Meu Pequeno Mundo" && (await altura(page, rodape)) >= 44);
  const doMundo = pedidos.filter((u) => /\/api\/mundo|\/meu-pequeno-mundo|three/i.test(u));
  checar(`[${vp}] home: nada do mundo carregado (nem prefetch, nem dados, nem 3D)`, doMundo.length === 0, doMundo.join(" "));
  if (vp === "desktop") {
    // teclado: o botão é alcançável com Tab e abre o mundo com Enter
    await page.evaluate(() => window.scrollTo(0, 0));
    let achou = false;
    for (let k = 0; k < 160 && !achou; k++) { await page.keyboard.press("Tab"); achou = await page.evaluate(() => document.activeElement?.matches?.('a.btn[href*="entrada=home"]') ?? false); }
    const anel = achou ? await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return `${s.outlineStyle} ${s.outlineWidth}`; }) : "";
    checar("[desktop] home: botão alcançável pelo teclado, com foco visível", achou && !/^none/.test(anel), anel);
    if (achou) { await foto(page, "desktop-02-home-foco-teclado"); await page.keyboard.press("Enter"); }
    else await page.click(botao);
  } else await page.click(botao);
  await page.waitForURL(/\/meu-pequeno-mundo/, { timeout: 60000 });
  await pronta(page);
  await dormir(2500);
  checar(`[${vp}] home → mundo: barra limpa`, new URL(page.url()).search === "", page.url());
  checar(`[${vp}] home → mundo: entrada registrada como "home"`, await esperarEvento(coletas, "mundo_entrada", (p) => p.get("ep.origem") === "home"), evento(coletas, "mundo_entrada").map((p) => p.get("ep.origem")).join(","));
  checar(`[${vp}] "Voltar à loja" leva para /sul`, (await page.getAttribute("#app .marca", "href")) === "/sul");
  await ctx.close();

  // página da cidade
  const c = await novaPagina(vp);
  await c.page.goto(`${ON}/sul/pr/curitiba`, { waitUntil: "networkidle", timeout: 120000 });
  const convite = c.page.locator("#mundo-cidade-titulo");
  await convite.scrollIntoViewIfNeeded();
  await dormir(500);
  await foto(c.page, `${vp}-03-cidade-convite`);
  const link = 'a[href*="entrada=cidade"]';
  checar(`[${vp}] cidade: convite "Curitiba faz parte da sua história?"`, (await convite.textContent())?.includes("Curitiba faz parte da sua história?"));
  checar(`[${vp}] cidade: link com cidade=${CWB} e loja=sul, 44 px ou mais`, (await c.page.getAttribute(link, "href"))?.includes(`cidade=${CWB}`) && (await altura(c.page, link)) >= 44);
  const produtosAntes = await c.page.$$eval("main a[href*='/sul/']", (as) => as.length);
  checar(`[${vp}] cidade: o convite fica abaixo dos produtos`, await c.page.evaluate(() => {
    const conv = document.getElementById("mundo-cidade-titulo").getBoundingClientRect().top + scrollY;
    const cards = [...document.querySelectorAll("main a")].filter((a) => a.querySelector("img")).map((n) => n.getBoundingClientRect().top + scrollY);
    return cards.length > 0 && Math.min(...cards) < conv;
  }), `${produtosAntes} links da loja`);
  const doMundoC = c.pedidos.filter((u) => /\/api\/mundo|\/meu-pequeno-mundo|three/i.test(u));
  checar(`[${vp}] cidade: nada do mundo carregado`, doMundoC.length === 0, doMundoC.join(" "));
  await c.page.click(link);
  await c.page.waitForURL(/\/meu-pequeno-mundo/, { timeout: 60000 });
  await pronta(c.page);
  await dormir(2500);
  const e1 = await est(c.page);
  checar(`[${vp}] cidade → mundo sem progresso: a sugestão aparece e nada é escolhido sozinho`, (await c.page.isVisible("#sugestao-montar")) && Object.values(e1.papeis).every((x) => x === null), JSON.stringify(e1.papeis));
  checar(`[${vp}] cidade → mundo: entrada registrada como "cidade"`, await esperarEvento(c.coletas, "mundo_entrada", (p) => p.get("ep.origem") === "cidade"));
  await foto(c.page, `${vp}-04-mundo-sugestao`);
  await c.page.click("#sugestao-montar .sugestao-papeis button:nth-child(2)");
  await dormir(2500);
  checar(`[${vp}] escolher "Meu presente" põe Curitiba só no presente`, JSON.stringify((await est(c.page)).papeis) === JSON.stringify({ origem: null, presente: CWB, coracao: null }));
  await c.ctx.close();
}

// ---------------------------------------------------------------- 3. chegada com progresso salvo, link completo e "Agora não"
{
  const salvoV2 = JSON.stringify({ v: 2, papeis: { origem: FLN, presente: null, coracao: null }, passo: 0, concluido: true, lembrancas: {}, incluirLembrancas: false });
  const { ctx, page } = await novaPagina("desktop", { antes: `if (!sessionStorage.getItem("qa-semeado")) { localStorage.setItem("useorigens:meu-pequeno-mundo", ${JSON.stringify(salvoV2)}); sessionStorage.setItem("qa-semeado", "1"); }` });
  await page.goto(`${ON}/meu-pequeno-mundo?entrada=cidade&cidade=${CWB}&loja=sul`, { timeout: 120000 });
  await pronta(page); await dormir(2500);
  const e = await est(page);
  checar("com progresso salvo (v2): nada é trocado sozinho", e.papeis.origem === FLN && !e.papeis.presente && !e.papeis.coracao, JSON.stringify(e.papeis));
  checar("com progresso salvo: a sugestão aparece no resultado", await page.isVisible("#sugestao-mundo"));
  await foto(page, "desktop-05-sugestao-com-progresso");
  await page.click("#sugestao-mundo .sugestao-papeis button:nth-child(3)");
  await dormir(2500);
  const e2 = await est(page);
  checar("escolher \"Meu lugar do coração\" mantém a origem salva", e2.papeis.origem === FLN && e2.papeis.coracao === CWB, JSON.stringify(e2.papeis));
  await ctx.close();

  const salvoV1 = JSON.stringify({ v: 1, papeis: { origem: NT, presente: FLN, coracao: null }, passo: 1, concluido: true });
  const v1 = await novaPagina("desktop", { antes: `if (!sessionStorage.getItem("qa-semeado")) { localStorage.setItem("useorigens:meu-pequeno-mundo", ${JSON.stringify(salvoV1)}); sessionStorage.setItem("qa-semeado", "1"); }` });
  await v1.page.goto(`${ON}/meu-pequeno-mundo`, { timeout: 120000 });
  await pronta(v1.page); await dormir(2000);
  const ev1 = await est(v1.page);
  checar("progresso salvo no formato da v1 continua abrindo", ev1.papeis.origem === NT && ev1.papeis.presente === FLN, JSON.stringify(ev1.papeis));
  await v1.page.goto(`${ON}/meu-pequeno-mundo?entrada=cidade&cidade=${CWB}`, { timeout: 120000 });
  await pronta(v1.page); await dormir(2000);
  await v1.page.click('#sugestao-mundo button:has-text("Agora não")').catch(() => {});
  await dormir(800);
  const ev1b = await est(v1.page);
  checar("\"Agora não\" fecha a sugestão sem mudar nada", !(await v1.page.isVisible("#sugestao-mundo")) && ev1b.papeis.origem === NT && !ev1b.papeis.coracao, JSON.stringify(ev1b.papeis));
  await v1.ctx.close();

  // link completo + cidade: o mundo do link prevalece
  const l = await novaPagina("desktop");
  await l.page.goto(`${ON}/meu-pequeno-mundo?mundo=1&origem=${CWB}&presente=${GYN}&coracao=${MAO}&entrada=cidade&cidade=${POA}&loja=norte`, { timeout: 120000 });
  await pronta(l.page); await dormir(3000);
  const el = await est(l.page);
  checar("link completo com cidade: o mundo do link prevalece e não há sugestão", el.papeis.origem === CWB && el.papeis.presente === GYN && el.papeis.coracao === MAO && !(await l.page.isVisible("#sugestao-mundo")), JSON.stringify(el.papeis));
  checar("mundo por link: barra limpa", new URL(l.page.url()).search === "", l.page.url());
  checar("mundo por link não grava por cima do mundo salvo da pessoa", await l.page.evaluate(() => localStorage.getItem("useorigens:meu-pequeno-mundo") === null));
  checar("\"Voltar à loja\" leva para a loja de chegada (/norte)", (await l.page.getAttribute("#app .marca", "href")) === "/norte");
  await l.page.reload({ timeout: 120000 }); await pronta(l.page); await dormir(2000);
  checar("recarregar a página mantém o mundo aberto pelo link", (await est(l.page)).papeis.coracao === MAO);
  const hrefs = await l.page.$$eval("#lista-lugares a[href], #painel-mundo a[href]", (as) => as.map((a) => a.getAttribute("href")));
  checar("links de cidade e produto são do próprio ambiente", hrefs.length > 0 && hrefs.every((h) => (h.startsWith("/") || h.startsWith(`${ON}/`)) && !h.includes("useorigens.com.br")), hrefs.slice(0, 4).join(" "));
  await foto(l.page, "desktop-06-mundo-tres-regioes");
  await l.ctx.close();
}

// ---------------------------------------------------------------- 4. PNG, compartilhamento e privacidade do analytics
{
  const salvo = JSON.stringify({ v: 2, papeis: { origem: CWB, presente: GYN, coracao: MAO }, passo: 2, concluido: true, lembrancas: { [CWB]: LEMBRANCA }, incluirLembrancas: false });
  const stubs = `
    if (!sessionStorage.getItem("qa-semeado")) { localStorage.setItem("useorigens:meu-pequeno-mundo", ${JSON.stringify(salvo)}); sessionStorage.setItem("qa-semeado", "1"); }
    window.__copiado = null;
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (t) => { window.__copiado = t; } }, configurable: true });
    navigator.canShare = () => true;
    navigator.share = () => Promise.reject(Object.assign(new Error("cancelado"), { name: "AbortError" }));`;
  const { ctx, page, coletas, terceiros } = await novaPagina("desktop", { antes: stubs });
  await page.goto(`${ON}/meu-pequeno-mundo?entrada=rodape&loja=sul`, { timeout: 120000 });
  await pronta(page); await dormir(3000);
  // busca com texto livre (não pode ir para o analytics)
  await page.click("#btn-editar"); await dormir(800);
  await page.fill("#campo-busca", BUSCA).catch(() => {});
  await dormir(1200);
  await page.click("#btn-ver-mundo").catch(() => {});
  await dormir(2000);
  for (const [comLembranca, nome] of [[false, "sem"], [true, "com"]]) {
    const caixa = page.locator("#incluir-lembrancas");
    if ((await caixa.isChecked().catch(() => false)) !== comLembranca) await caixa.click({ force: true }).catch(() => {});
    await dormir(600);
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.click("#btn-baixar")]);
    const arquivo = path.join(outDir, `png-${nome}-lembrancas.png`);
    await download.saveAs(arquivo);
    const b = readFileSync(arquivo);
    const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
    checar(`PNG ${nome} lembranças: 1080 × 1350`, b.subarray(1, 4).toString() === "PNG" && w === 1080 && h === 1350, `${w} × ${h}, ${Math.round(b.length / 1024)} KB`);
    await dormir(800);
  }
  await page.click("#btn-link"); await dormir(800);
  const copiado = await page.evaluate(() => window.__copiado);
  checar("copiar link: URL do próprio ambiente, sem entrada, cidade ou loja", copiado?.startsWith(`${ON}/meu-pequeno-mundo?mundo=1&`) && !/entrada=|cidade=|loja=/.test(copiado), copiado);
  await page.click("#btn-compartilhar"); await dormir(2500);
  const dialogoAberto = await page.evaluate(() => document.getElementById("dlg-compartilhar").open);
  const aviso = (await page.textContent("#toast").catch(() => "")) ?? "";
  checar("compartilhar cancelado na janela nativa: sem erro e sem diálogo", !dialogoAberto && !/não|falh|erro/i.test(aviso), aviso);
  checar("compartilhar cancelado registrado como \"nativo_cancelado\"", await esperarEvento(coletas, "mundo_compartilhar", (p) => p.get("ep.resultado") === "nativo_cancelado"));
  await page.click("#lista-lugares li:nth-child(1) .lugar-conhecer"); await dormir(2500);
  // um clique em "Ver camisetas" na ficha (a navegação para a loja é interrompida aqui: 204 mantém a página)
  await page.route(/\/sul\/pr\/curitiba/, (r) => r.fulfill({ status: 204, body: "" }));
  await page.click("#cidade-cta").catch((e) => console.log("  (clique em #cidade-cta falhou:", e.message.split("\n")[0], ")"));
  await esperarEvento(coletas, "mundo_camisetas");

  const vistos = new Set(eventos(coletas).map((p) => p.get("en")));
  for (const e of ["page_view", "mundo_entrada", "mundo_ficha", "mundo_png", "mundo_download_iniciado", "mundo_compartilhar", "mundo_camisetas"]) checar(`analytics: evento ${e} enviado`, vistos.has(e));
  const pv = evento(coletas, "page_view").map((p) => p.get("dl"));
  checar("analytics: page_view só com o caminho, sem consulta", pv.length > 0 && pv.every((dl) => dl === `${ON}/meu-pequeno-mundo`), pv.join(" "));
  const tudo = coletas.map((c) => decodeURIComponent(`${c.url}\n${c.corpo}`.replace(/\+/g, " "))).join("\n");
  const vazou = ["avó", "pão", "🌊", BUSCA, `origem=${CWB}`, "mundo=1", "&lo=", "lo=Minha"].filter((t) => tudo.includes(t));
  checar("analytics: nenhuma lembrança, texto de busca ou mundo nas coletas", vazou.length === 0, vazou.join(", "));
  const lugaresEnviados = evento(coletas, "mundo_concluido").map((p) => p.get("ep.lugares") ?? p.get("epn.lugares"));
  checar("analytics: mundo_concluido nunca leva os IDs juntos", evento(coletas, "mundo_concluido").every((p) => ![...p.keys()].some((k) => /lugar_id/.test(k))), lugaresEnviados.join(","));
  checar("nenhum Meta Pixel ou Clarity na rota do mundo", terceiros.length === 0, terceiros.join(" "));
  resultado.coletas = coletas.map((c) => c.url.replace(/^https?:\/\/[^/]+/, "")).slice(0, 60);
  await ctx.close();

  // consentimento recusado: a rota do mundo segue exatamente a regra da loja (src/lib/consent/policy.ts)
  const carregaGa = async (url) => {
    const r = await novaPagina("desktop", { consentimento: "rejected" });
    await r.page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
    await dormir(2500);
    const n = r.pedidos.filter((u) => /googletagmanager\.com\/gtag\/js/.test(u)).length > 0;
    await r.ctx.close();
    return n;
  };
  const naLoja = await carregaGa(`${ON}/sul`), noMundo = await carregaGa(`${ON}/meu-pequeno-mundo?mundo=1&origem=${CWB}`);
  checar("consentimento recusado: o mundo segue a mesma regra da loja", naLoja === noMundo, `loja carrega GA4: ${naLoja}; mundo: ${noMundo}`);
}

// ---------------------------------------------------------------- 5. falhas isoladas
{
  // o pedaço do Three.js falha: a apresentação plana assume, com os lugares e as camisetas
  const { ctx, page } = await novaPagina("desktop", { errosEsperados: /Failed to load chunk|Loading chunk/ });
  await page.route(/\/_next\/static\/chunks\/.*\.js/, async (r) => {
    const resposta = await r.fetch();
    const corpo = await resposta.text();
    // só os pedaços do Three.js (o da experiência também cita WebGLRenderer, mas traz o próprio código)
    if (/WebGLRenderer|OrbitControls/.test(corpo) && !corpo.includes("__meuPequenoMundo")) return r.fulfill({ status: 404, body: "" });
    return r.fulfill({ response: resposta, body: corpo });
  });
  await page.goto(`${ON}/meu-pequeno-mundo?mundo=1&origem=${CWB}&presente=${GYN}&coracao=${MAO}`, { timeout: 120000 });
  await page.waitForFunction(() => !document.getElementById("estatico").hidden && document.querySelectorAll("#lista-lugares li").length === 3, null, { timeout: 60000 }).catch(() => {});
  await dormir(1500);
  const aviso = await page.textContent("#estatico-aviso").catch(() => "");
  const nLista = await page.$$eval("#lista-lugares li", (l) => l.length);
  checar("3D não carregou: aviso e apresentação plana, com os lugares", (await page.isVisible("#estatico")) && /maquete 3D/.test(aviso) && nLista === 3, `${aviso} (${nLista} lugares)`);
  await foto(page, "desktop-07-falha-3d");
  await ctx.close();

  // o pedaço da própria experiência falha: aviso com nova tentativa, em vez de "Preparando a maquete…" para sempre
  const x = await novaPagina("mobile", { errosEsperados: /Failed to load chunk|Loading chunk|ChunkLoadError/ });
  await x.page.route(/\/_next\/static\/chunks\/.*\.js/, async (r) => {
    const resposta = await r.fetch();
    const corpo = await resposta.text();
    if (corpo.includes("__meuPequenoMundo")) return r.fulfill({ status: 404, body: "" });
    return r.fulfill({ response: resposta, body: corpo });
  });
  await x.page.goto(`${ON}/meu-pequeno-mundo`, { timeout: 120000 });
  await x.page.waitForSelector(".mpm-falha", { timeout: 30000 }).catch(() => {});
  const falha = (await x.page.textContent(".mpm-falha").catch(() => "")) ?? "";
  checar("código da experiência não chegou: aviso com \"Tentar de novo\" e \"Voltar à loja\"", /Tentar de novo/.test(falha) && (await x.page.getAttribute(".mpm-falha a", "href")) === "/sul", falha.trim());
  await foto(x.page, "mobile-08b-falha-codigo");
  await x.ctx.close();

  // o índice falha: a busca avisa e oferece nova tentativa
  const d = await novaPagina("mobile");
  await d.page.route(/\/api\/mundo\/indice/, (r) => r.fulfill({ status: 503, body: "" }));
  await d.page.goto(`${ON}/meu-pequeno-mundo`, { timeout: 120000 });
  await pronta(d.page); await dormir(1500);
  await d.page.click("#btn-comecar").catch(() => {});
  await dormir(1200);
  const texto = (await d.page.textContent("#busca-status").catch(() => "")) ?? "";
  checar("índice indisponível: aviso na busca com nova tentativa", /tentar/i.test(texto), texto.trim().slice(0, 120));
  await foto(d.page, "mobile-08-falha-dados");
  await d.ctx.close();

  // os perfis falham: o mundo segue com o cenário regional
  const p = await novaPagina("desktop");
  await p.page.route(/\/api\/mundo\/perfis/, (r) => r.fulfill({ status: 500, body: "" }));
  await p.page.goto(`${ON}/meu-pequeno-mundo?mundo=1&origem=${CWB}&presente=${GYN}`, { timeout: 120000 });
  await pronta(p.page); await dormir(2500);
  checar("perfis indisponíveis: o mundo abre mesmo assim", (await p.page.$$eval("#lista-lugares li", (l) => l.length)) === 2);
  await p.ctx.close();

  // navegador sem WebGL
  const semGl = await chromium.launch({ args: ["--disable-webgl", "--disable-3d-apis", "--disable-gpu"] });
  const ctxG = await semGl.newContext({ ...VIEWPORTS.mobile, locale: "pt-BR" });
  const g = await ctxG.newPage();
  const errosG = [];
  g.on("pageerror", (e) => errosG.push(e.message));
  await g.goto(`${ON}/meu-pequeno-mundo?mundo=1&origem=${CWB}&presente=${GYN}&coracao=${MAO}`, { timeout: 120000 });
  await g.waitForFunction(() => !document.getElementById("estatico").hidden, null, { timeout: 60000 }).catch(() => {});
  await dormir(1500);
  checar("sem WebGL: apresentação plana, sem erro de script", (await g.isVisible("#estatico")) && errosG.length === 0, errosG.join(" | "));
  await g.screenshot({ path: path.join(outDir, "mobile-09-sem-webgl.png") });
  await semGl.close();
}

// ---------------------------------------------------------------- 6. capturas do mundo com as três regiões e dos perfis novos
for (const vp of ["desktop", "mobile"]) {
  const { ctx, page } = await novaPagina(vp);
  for (const [nome, ids] of [["sul-co-norte", [CWB, GYN, MAO]], ["perfis-novos-a", [POA, "5002704", "1501402"]]]) {
    await page.goto(`${ON}/meu-pequeno-mundo?mundo=1&origem=${ids[0]}&presente=${ids[1]}&coracao=${ids[2]}`, { timeout: 120000 });
    await pronta(page); await dormir(4000);
    await foto(page, `${vp}-10-mundo-${nome}`);
  }
  await ctx.close();
}

resultado.consoleErros = [...new Set(resultado.consoleErros)];
const falhas = resultado.checagens.filter((c) => !c.ok).length;
resultado.pulados = pulados;
writeFileSync(path.join(outDir, "resultado-v3.json"), JSON.stringify(resultado, null, 2));
console.log(`\n${resultado.checagens.length - falhas}/${resultado.checagens.length} checagens ok; ${pulados.length} pulada(s); erros de console: ${resultado.consoleErros.length}`);
for (const e of resultado.consoleErros.slice(0, 10)) console.log("  console:", e.slice(0, 200));
await browser.close();
process.exit(falhas ? 1 : 0);

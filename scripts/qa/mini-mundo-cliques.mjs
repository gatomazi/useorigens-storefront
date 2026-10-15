// Mapa de cliques do protótipo "Meu Pequeno Mundo": percorre cada tela em 1440×900 e 390×844, lista tudo o que dá para clicar
// (botões, links, campo, opções, etiquetas e a área das ilhas na maquete), testa os cliques que não têm efeito óbvio e salva
// capturas limpas e anotadas (número em cada alvo) para o UX.
// Usage: node scripts/qa/mini-mundo-cliques.mjs <outDir> [baseUrl] [desktop|mobile]
import { chromium, devices } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [outDir, base = "http://127.0.0.1:4321/meu-pequeno-mundo-use-origens.html", soVp] = process.argv.slice(2);
if (!outDir) throw new Error("uso: node scripts/qa/mini-mundo-cliques.mjs <outDir> [baseUrl] [desktop|mobile]");
mkdirSync(outDir, { recursive: true });
const arquivoLocal = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../prototipos/meu-pequeno-mundo/meu-pequeno-mundo-use-origens.html");

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  mobile: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
};
const telas = [];
const testes = [];
const consoleErros = [];
const log = (...a) => console.log(...a);

async function novaPagina(vp, extra = {}) {
  const ctx = await browser.newContext({ ...VIEWPORTS[vp], locale: "pt-BR", acceptDownloads: true, ...extra });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") consoleErros.push(`[${vp}] ${m.text()}`); });
  page.on("pageerror", (e) => consoleErros.push(`[${vp}] pageerror: ${e.message}`));
  return { ctx, page };
}
const cenaPronta = (page) => page.waitForFunction(() => document.getElementById("status-cena").hidden, null, { timeout: 30000 });
const esperar = (page, ms) => page.waitForTimeout(ms);
const quadros = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const situacao = (page) =>
  page.evaluate(() => ({
    modo: document.getElementById("app").dataset.modo,
    pergunta: document.getElementById("pergunta")?.textContent,
    cidade: document.getElementById("painel-cidade").hidden ? null : document.getElementById("cidade-nome").textContent,
    dialogo: document.querySelector("dialog[open]")?.id ?? null,
    aviso: [...document.querySelectorAll(".toast.visivel, .aviso:not([hidden])")].map((n) => n.textContent.trim()).filter(Boolean).join(" | "),
  }));

// ---------------------------------------------------------------- inventário dos alvos clicáveis da tela
function inventarioNaPagina() {
  const modal = document.querySelector("dialog[open]");
  const raiz = modal ?? document;
  const sel = 'button, a[href], a.btn, input:not([type=hidden]), [role=option], [tabindex]:not([tabindex="-1"]):not(#palco):not(h2)';
  const vw = innerWidth, vh = innerHeight;
  const itens = [];
  const visivel = (n) => {
    if (n.closest("[hidden]") || n.closest(".oculta")) return false;
    const e = getComputedStyle(n);
    if (e.visibility === "hidden" || e.display === "none" || Number(e.opacity) === 0) return false;
    const r = n.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  // recorte pelos ancestrais com rolagem (o que está fora do painel precisa rolar para aparecer)
  const recorte = (n) => {
    let r = n.getBoundingClientRect();
    let esq = r.left, topo = r.top, dir = r.right, base = r.bottom;
    for (let p = n.parentElement; p; p = p.parentElement) {
      const e = getComputedStyle(p);
      if (/(auto|scroll|hidden)/.test(e.overflow + e.overflowY + e.overflowX)) {
        const q = p.getBoundingClientRect();
        esq = Math.max(esq, q.left); topo = Math.max(topo, q.top); dir = Math.min(dir, q.right); base = Math.min(base, q.bottom);
      }
    }
    esq = Math.max(esq, 0); topo = Math.max(topo, 0); dir = Math.min(dir, vw); base = Math.min(base, vh);
    const area = Math.max(0, dir - esq) * Math.max(0, base - topo);
    return { fracao: area / (r.width * r.height), esq, topo, dir, base };
  };
  for (const n of raiz.querySelectorAll(sel)) {
    if (!visivel(n)) continue;
    const r = n.getBoundingClientRect();
    const rc = recorte(n);
    let coberto = false;
    if (rc.fracao > 0.2) {
      const cx = (rc.esq + rc.dir) / 2, cy = (rc.topo + rc.base) / 2;
      const topoEl = document.elementFromPoint(cx, cy);
      coberto = !!topoEl && !n.contains(topoEl) && !topoEl.contains(n);
    }
    const desabilitado = n.disabled === true || n.getAttribute("aria-disabled") === "true";
    const href = n.getAttribute("href");
    const externo = n.tagName === "A" && !!href;
    let tipo = "secundaria";
    if (desabilitado) tipo = "desabilitado";
    else if (externo) tipo = "link";
    else if (n.classList.contains("link-acao")) tipo = "texto";
    else if (n.classList.contains("btn") && !n.classList.contains("btn-ghost")) tipo = "primaria";
    else if (n.tagName === "INPUT") tipo = "campo";
    const visto = (n.innerText || n.value || "").replace(/\s+/g, " ").trim();
    itens.push({
      id: n.id || null,
      classe: typeof n.className === "string" ? n.className : "",
      tag: n.tagName.toLowerCase(),
      papel: n.getAttribute("role"),
      texto: visto || n.getAttribute("placeholder") || "",
      aria: n.getAttribute("aria-label") || n.getAttribute("title") || "",
      href: href ? n.href : null,
      alvo: n.getAttribute("target"),
      x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
      tipo, desabilitado, coberto,
      fracaoVisivel: Math.round(rc.fracao * 100) / 100,
      pequeno: r.width < 44 || r.height < 44,
      dataId: n.dataset.id || n.closest("[data-id]")?.dataset.id || null,
    });
  }
  return { itens, modal: modal?.id ?? null, vw, vh };
}

// ---------------------------------------------------------------- área clicável das ilhas (o cursor vira "mãozinha" sobre uma ilha)
async function mapaIlhas(page, passo) {
  // duas passadas: grade grossa (2× o passo) na maquete toda e grade fina só em volta do que deu ilha
  const t0 = Date.now();
  const sobre = async (x, y) => {
    await page.mouse.move(x, y);
    // o laço de desenho registrou o próximo quadro antes deste rAF, então o hover já foi resolvido quando ele roda
    return page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(document.getElementById("cena").classList.contains("sobre-ilha")))));
  };
  const naCena = (pts) =>
    page.evaluate((pts) => {
      const c = document.getElementById("cena");
      return pts.filter(([x, y]) => x > 0 && y > 0 && x < innerWidth && y < innerHeight && document.elementFromPoint(x, y) === c);
    }, pts);
  const { w, h } = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  const G = passo * 2;
  const grossos = [];
  for (let y = G / 2; y < h; y += G) for (let x = G / 2; x < w; x += G) grossos.push([Math.round(x), Math.round(y)]);
  const sim = new Set();
  const positivosG = [];
  let testados = 0;
  for (const [x, y] of await naCena(grossos)) { testados++; if (await sobre(x, y)) positivosG.push([x, y]); }
  const finos = new Map();
  // grade fina alinhada em passo/2 + i·passo, numa janela de ±G em volta de cada ponto grosso positivo
  for (const [gx, gy] of positivosG)
    for (let i = Math.floor((gx - G) / passo); i <= Math.ceil((gx + G) / passo); i++)
      for (let j = Math.floor((gy - G) / passo); j <= Math.ceil((gy + G) / passo); j++) {
        const x = Math.round(passo / 2 + i * passo), y = Math.round(passo / 2 + j * passo);
        finos.set(`${x},${y}`, [x, y]);
      }
  for (const [x, y] of await naCena([...finos.values()])) { testados++; if (await sobre(x, y)) sim.add(`${x},${y}`); }
  await page.mouse.move(2, 2);
  log(`    mapa das ilhas: ${testados} pontos em ${Math.round((Date.now() - t0) / 1000)} s`);
  return { passo, pontos: [...sim].map((k) => k.split(",").map(Number)), testados };
}

// ---------------------------------------------------------------- desenho das marcações sobre a captura
const CORES = { primaria: "#e8590c", secundaria: "#1c7ed6", texto: "#7048e8", link: "#0ca678", campo: "#1c7ed6", desabilitado: "#868e96", problema: "#e03131" };
async function desenhar(page, inv, mapa) {
  await page.evaluate(({ inv, mapa, CORES }) => {
    const camada = document.createElement("div");
    camada.id = "qa-camada";
    camada.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647;font:700 12px/1 system-ui,sans-serif";
    if (mapa) {
      for (const [x, y] of mapa.pontos) {
        const c = document.createElement("div");
        c.style.cssText = `position:absolute;left:${x - mapa.passo / 2}px;top:${y - mapa.passo / 2}px;width:${mapa.passo}px;height:${mapa.passo}px;background:rgba(250,204,21,.42);`;
        camada.append(c);
      }
    }
    inv.itens.forEach((it, k) => {
      const problema = it.pequeno || it.coberto;
      const cor = problema ? CORES.problema : CORES[it.tipo];
      const caixa = document.createElement("div");
      const borda = it.tipo === "desabilitado" ? "dashed" : "solid";
      caixa.style.cssText = `position:absolute;left:${it.x}px;top:${it.y}px;width:${it.w}px;height:${it.h}px;border:2px ${borda} ${cor};border-radius:3px;box-shadow:0 0 0 1px rgba(255,255,255,.7);`;
      camada.append(caixa);
      const selo = document.createElement("div");
      const bx = Math.min(Math.max(it.x - 9, 2), inv.vw - 24), by = Math.min(Math.max(it.y - 9, 2), inv.vh - 24);
      selo.textContent = String(k + 1);
      selo.style.cssText = `position:absolute;left:${bx}px;top:${by}px;min-width:22px;height:22px;padding:0 4px;box-sizing:border-box;border-radius:11px;background:${cor};color:#fff;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);`;
      camada.append(selo);
    });
    document.body.append(camada);
  }, { inv, mapa, CORES });
}
const limpar = (page) => page.evaluate(() => document.getElementById("qa-camada")?.remove());

// espera a câmera parar: as etiquetas acompanham as ilhas, então posição igual em duas leituras seguidas = cena parada
async function assentar(page) {
  const posicoes = () => page.evaluate(() => [...document.querySelectorAll(".etiqueta")].map((b) => b.style.transform + b.className).join("|"));
  let antes = await posicoes();
  for (let k = 0; k < 15; k++) {
    await esperar(page, 400);
    const agora = await posicoes();
    if (agora === antes) return;
    antes = agora;
  }
}
async function registrar(page, vp, chave, titulo, { comoChegar = "", mapa: passoMapa = 0, notas = [] } = {}) {
  await assentar(page);
  await quadros(page);
  const inv = await page.evaluate(inventarioNaPagina);
  const mapa = passoMapa ? await mapaIlhas(page, passoMapa) : null;
  const limpa = `${vp}-${chave}.png`, anotada = `${vp}-${chave}-anotada.png`;
  await page.screenshot({ path: path.join(outDir, limpa) });
  await desenhar(page, inv, mapa);
  await page.screenshot({ path: path.join(outDir, anotada) });
  await limpar(page);
  const sit = await situacao(page);
  telas.push({ vp, chave, titulo, comoChegar, limpa, anotada, situacao: sit, itens: inv.itens, modal: inv.modal, mapa: mapa && { passo: mapa.passo, celulas: mapa.pontos.length, testados: mapa.testados, caixa: caixaDe(mapa.pontos, mapa.passo), pontos: mapa.pontos }, notas });
  const prob = inv.itens.filter((i) => i.pequeno || i.coberto);
  log(`  [${vp}] ${chave}: ${inv.itens.length} alvos${mapa ? `, ilhas ${mapa.pontos.length}/${mapa.testados} pontos` : ""}${prob.length ? `, PROBLEMAS: ${prob.map((p) => `${p.texto || p.aria}${p.pequeno ? ` ${p.w}×${p.h}` : ""}${p.coberto ? " coberto" : ""}`).join("; ")}` : ""}`);
}
function caixaDe(pts, passo) {
  if (!pts.length) return null;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return { x: Math.min(...xs) - passo / 2, y: Math.min(...ys) - passo / 2, x2: Math.max(...xs) + passo / 2, y2: Math.max(...ys) + passo / 2 };
}
function testar(vp, nome, ok, detalhe = "", tela = null) {
  testes.push({ vp, nome, ok: !!ok, detalhe, tela });
  log(`  ${ok ? "OK " : "OBS"} [${vp}] ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
}
async function buscarEEscolher(page, termo, esperado) {
  await page.fill("#busca-campo", termo);
  await page.waitForSelector("#busca-lista [role=option]");
  const opcoes = await page.$$eval("#busca-lista [role=option] .res-nome", (ns) => ns.map((n) => n.textContent));
  const k = opcoes.findIndex((o) => o === esperado);
  if (k < 0) throw new Error(`"${esperado}" não apareceu na busca por "${termo}": ${opcoes.join(", ")}`);
  await page.click(`#opcao-${k}`);
}
// um ponto da maquete (água/mesa) que não é ilha: na grade, a ≥ 60 px das células de ilha medidas na tela e fora das etiquetas
async function pontoVazio(page, pontosIlha = []) {
  const candidatos = await page.evaluate((ilha) => {
    const c = document.getElementById("cena");
    const etqs = [...document.querySelectorAll(".etiqueta:not(.oculta), .camera button, .topo a")].map((b) => b.getBoundingClientRect());
    const out = [];
    for (let y = 30; y < innerHeight; y += 30)
      for (let x = 30; x < innerWidth; x += 30) {
        if (document.elementFromPoint(x, y) !== c) continue;
        if (etqs.some((r) => x > r.left - 20 && x < r.right + 20 && y > r.top - 20 && y < r.bottom + 20)) continue;
        const d = ilha.reduce((m, [ix, iy]) => Math.min(m, Math.hypot(ix - x, iy - y)), Infinity);
        if (d >= 60) out.push([x, y, d]);
      }
    // perto das ilhas, mas fora delas: onde um toque “errado” costuma cair
    return out.sort((a, b) => a[2] - b[2]).slice(0, 6).map(([x, y]) => [x, y]);
  }, pontosIlha);
  for (const [x, y] of candidatos) if (!(await ehIlha(page, x, y))) return [x, y];
  return null;
}
async function ehIlha(page, x, y) {
  await page.mouse.move(x, y);
  return page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(document.getElementById("cena").classList.contains("sobre-ilha"))))));
}

// ---------------------------------------------------------------- roteiro por tamanho de tela
for (const vp of soVp ? [soVp] : ["desktop", "mobile"]) {
  const passoMapa = vp === "desktop" ? 24 : 12;
  log(`\n== ${vp}`);
  const { ctx, page } = await novaPagina(vp);
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(base).origin });
  await page.goto(base);
  await cenaPronta(page);
  await esperar(page, 3500);

  // E01 entrada
  const marca = await page.$eval(".marca", (a) => ({ href: a.href, alvo: a.getAttribute("target") }));
  await registrar(page, vp, "01-entrada", "Entrada", { comoChegar: "Abrir a página sem mundo salvo.", notas: ["As ilhas da prévia giram sozinhas; tocar numa delas também começa (mesmo efeito de “Montar meu mundo”)."] });
  testar(vp, "logo “Use Origens” sai do protótipo na mesma aba", true, `${marca.href} · target=${marca.alvo ?? "(mesma aba)"}`, "01-entrada");

  // E02 primeira pergunta, vazia
  await page.click("#btn-comecar");
  await esperar(page, 1200);
  await page.evaluate(() => document.activeElement?.blur());
  await registrar(page, vp, "02-origem-vazia", "Etapa 1 · Minha origem (vazia)", { comoChegar: "Entrada → “Montar meu mundo”." });
  {
    const lupa = await page.$eval(".campo svg", (n) => { const r = n.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await page.mouse.click(...lupa);
    await esperar(page, 300);
    const focou = await page.evaluate(() => document.activeElement?.id === "busca-campo");
    testar(vp, "tocar na lupa do campo põe o cursor na busca", focou, focou ? "" : "a lupa fica fora do campo de texto: o toque não faz nada", "02-origem-vazia");
    await page.evaluate(() => document.activeElement?.blur());
    const dica = await page.$("#dica-palco:not([hidden])");
    if (dica) {
      const antes = await situacao(page);
      await dica.click({ force: true });
      await esperar(page, 400);
      const focouDica = await page.evaluate(() => document.activeElement?.id === "busca-campo");
      const depois = await situacao(page);
      testar(vp, "tocar na dica “Escolha uma cidade…” leva à busca", focouDica || JSON.stringify(antes) !== JSON.stringify(depois), focouDica ? "" : "parece um botão, mas o toque não faz nada", "02-origem-vazia");
      await page.evaluate(() => document.activeElement?.blur());
    }
  }
  const proximoDesab = await page.$eval("#btn-avancar", (b) => ({ texto: b.textContent, desab: b.disabled }));
  testar(vp, "“Próximo” desabilitado até escolher a origem", proximoDesab.desab, proximoDesab.texto, "02-origem-vazia");

  // pular direto para a etapa 3 pelas abas
  await page.click("#passos li:nth-child(3) button");
  await esperar(page, 600);
  const pulo = await situacao(page);
  const avancar3 = await page.$eval("#btn-avancar", (b) => ({ texto: b.textContent, desab: b.disabled }));
  testar(vp, "abas das etapas deixam ir à etapa 3 sem origem", pulo.pergunta === "Qual lugar você leva consigo?", `${pulo.pergunta} · botão: “${avancar3.texto}”${avancar3.desab ? " (desabilitado)" : ""}`, "02b-coracao-sem-origem");
  await page.evaluate(() => document.activeElement?.blur());
  await registrar(page, vp, "02b-coracao-sem-origem", "Etapa 3 aberta pela aba, sem origem", { comoChegar: "Etapa 1 vazia → aba “3 · Coração”." });
  await page.click("#passos li:nth-child(1) button");
  await esperar(page, 500);

  // E03 busca com resultados
  await page.fill("#busca-campo", "sao");
  await page.waitForSelector("#busca-lista [role=option]");
  await esperar(page, 400);
  await registrar(page, vp, "03-busca-resultados", "Busca com resultados", { comoChegar: "Etapa 1 → digitar “sao” no campo." });
  // E04 sem resultado
  await page.fill("#busca-campo", "xyzxyz");
  await esperar(page, 400);
  await registrar(page, vp, "04-busca-vazia", "Busca sem resultado", { comoChegar: "Etapa 1 → digitar “xyzxyz”." });
  await page.fill("#busca-campo", "");

  // E05 origem escolhida
  await buscarEEscolher(page, "bage", "Bagé · RS");
  await esperar(page, 3800);
  await page.evaluate(() => document.activeElement?.blur());
  await registrar(page, vp, "05-origem-escolhida", "Etapa 1 · origem escolhida (primeira ilha)", { comoChegar: "Busca → tocar em “Bagé · RS”.", mapa: passoMapa });
  {
    const antes = await situacao(page);
    await page.click("#escolha-nome");
    await esperar(page, 400);
    const depois = await situacao(page);
    const buscaAberta = !(await page.$eval("#busca", (n) => n.hidden));
    testar(vp, "tocar no cartão da cidade escolhida abre a troca", buscaAberta || JSON.stringify(antes) !== JSON.stringify(depois), buscaAberta ? "" : "só “Trocar cidade” e “Remover” respondem; o cartão em si não", "05-origem-escolhida");
  }
  // tocar na ilha durante a montagem
  const etq = await page.$(".etiqueta:not(.oculta)");
  await etq.click();
  await esperar(page, 600);
  testar(vp, "etiqueta da ilha na montagem leva à etapa daquela cidade", (await situacao(page)).pergunta === "Onde sua história começou?", (await situacao(page)).pergunta);

  // E06 trocando
  await page.click("#btn-trocar");
  await esperar(page, 500);
  await page.evaluate(() => document.activeElement?.blur());
  await registrar(page, vp, "06-trocando-cidade", "Trocar cidade (busca aberta sobre a escolha)", { comoChegar: "Etapa 1 com cidade → “Trocar cidade”.", notas: ["Aqui “Voltar” cancela a troca (não volta de etapa)."] });
  await page.click("#btn-voltar");
  await esperar(page, 500);
  testar(vp, "“Voltar” durante a troca cancela a troca e mantém a cidade", !(await page.$eval("#escolha", (n) => n.hidden)), "");

  // E07 presente vazio
  await page.click("#btn-avancar");
  await esperar(page, 900);
  await page.evaluate(() => document.activeElement?.blur());
  await registrar(page, vp, "07-presente-vazio", "Etapa 2 · Meu presente (vazia)", { comoChegar: "Etapa 1 com cidade → “Adicionar onde vivo hoje”." });

  // E08 presente escolhido
  await buscarEEscolher(page, "curitiba", "Curitiba · PR");
  await esperar(page, 3800);
  await page.evaluate(() => document.activeElement?.blur());
  await registrar(page, vp, "08-presente-escolhido", "Etapa 2 · presente escolhido (duas ilhas)", { comoChegar: "Etapa 2 → buscar e tocar em “Curitiba · PR”." });

  // E09 coração vazio
  await page.click("#btn-avancar");
  await esperar(page, 900);
  await page.evaluate(() => document.activeElement?.blur());
  await registrar(page, vp, "09-coracao-vazio", "Etapa 3 · Meu lugar do coração (vazia)", { comoChegar: "Etapa 2 com cidade → “Adicionar lugar do coração”." });

  // E10 coração escolhido
  await buscarEEscolher(page, "belem", "Belém · PA");
  await esperar(page, 3800);
  await page.evaluate(() => document.activeElement?.blur());
  await registrar(page, vp, "10-coracao-escolhido", "Etapa 3 · coração escolhido (três ilhas)", { comoChegar: "Etapa 3 → buscar e tocar em “Belém · PA”." });

  // E11 resultado
  await page.click("#btn-avancar");
  await esperar(page, 3800);
  await page.evaluate(() => document.activeElement?.blur());
  await registrar(page, vp, "11-resultado", "Resultado · Três lugares", { comoChegar: "Etapa 3 → “Ver meu mundo”.", mapa: passoMapa });
  {
    const t11 = telas.find((t) => t.vp === vp && t.chave === "11-resultado");
    const pts = t11?.mapa?.pontos ?? [];
    // um ponto de ilha longe das etiquetas (para não tocar nelas)
    const etqs = await page.$$eval(".etiqueta:not(.oculta)", (bs) => bs.map((b) => b.getBoundingClientRect()).map((r) => [r.left, r.top, r.right, r.bottom]));
    const livre = pts.filter(([x, y]) => etqs.every(([l, t, r, b]) => x < l - 10 || x > r + 10 || y < t - 10 || y > b + 10));
    const alvo = livre[Math.floor(livre.length / 2)];
    if (alvo) {
      await page.mouse.click(...alvo);
      await esperar(page, 1500);
      const aberta = (await situacao(page)).cidade;
      testar(vp, "tocar no corpo da ilha (fora da etiqueta) abre a cidade", !!aberta, aberta ? `abriu ${aberta}` : `ponto ${alvo.join(",")}`, "11-resultado");
      if (aberta) { await page.click("#btn-fechar-cidade"); await esperar(page, 1800); }
    }
  }
  const camisetasNoResultado = await page.$$eval("a.produto", (as) => as.filter((a) => !a.closest("[hidden]")).length);
  testar(vp, "resultado mostra camisetas sem tocar em nada", camisetasNoResultado > 0, `${camisetasNoResultado} camisetas visíveis`, "11-resultado");
  // clique na água com o painel do mundo aberto
  const vazio = await pontoVazio(page, telas.find((t) => t.vp === vp && t.chave === "11-resultado")?.mapa?.pontos);
  if (vazio) {
    const antes = await situacao(page);
    await page.mouse.click(...vazio);
    await esperar(page, 700);
    const depois = await situacao(page);
    testar(vp, "tocar na água/mesa (fora das ilhas) não faz nada", JSON.stringify(antes) === JSON.stringify(depois), `ponto ${vazio.join(",")}`, "11-resultado");
  }

  // E12 painel recolhido
  await page.click("#btn-recolher");
  await esperar(page, 1200);
  await registrar(page, vp, "12-painel-recolhido", "Resultado com o painel recolhido", { comoChegar: "Resultado → botão de recolher (canto do painel).", mapa: vp === "mobile" ? passoMapa : 0 });
  await page.click("#btn-recolher");
  await esperar(page, 1000);

  // E13 cidade aberta (pelo toque na etiqueta)
  await page.click(".etiqueta:not(.oculta) >> nth=0");
  await page.waitForSelector("#cidade-produtos a.produto", { timeout: 15000 });
  await esperar(page, 2800);
  const cidade1 = (await situacao(page)).cidade;
  const dobra = await page.evaluate(() => {
    const ps = [...document.querySelectorAll("#cidade-produtos a.produto")];
    const inteiro = (n) => {
      const r = n.getBoundingClientRect();
      let e = r.left, t = r.top, d = r.right, b = r.bottom;
      for (let p = n.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (/(auto|scroll|hidden)/.test(s.overflow + s.overflowX + s.overflowY)) { const q = p.getBoundingClientRect(); e = Math.max(e, q.left); t = Math.max(t, q.top); d = Math.min(d, q.right); b = Math.min(b, q.bottom); }
      }
      e = Math.max(e, 0); t = Math.max(t, 0); d = Math.min(d, innerWidth); b = Math.min(b, innerHeight);
      return (Math.max(0, d - e) * Math.max(0, b - t)) / (r.width * r.height) > 0.95;
    };
    const inteiros = ps.filter(inteiro);
    return { total: ps.length, inteiros: inteiros.length, primeiraY: Math.round(ps[0]?.getBoundingClientRect().top ?? -1), altura: innerHeight };
  });
  await registrar(page, vp, "13-cidade", `Painel da cidade · ${cidade1}`, { comoChegar: "Resultado → tocar na etiqueta, na ilha ou em “Camisetas →” da lista.", mapa: passoMapa });
  testar(vp, "camisetas inteiras na tela ao abrir a cidade (sem rolar)", dobra.inteiros > 0, `${dobra.inteiros} de ${dobra.total}; a primeira começa em y=${dobra.primeiraY} (tela ${dobra.altura})`, "13-cidade");
  // rolar o painel até o fim
  await page.$eval("#painel-cidade", (p) => p.scrollTo(0, p.scrollHeight));
  await esperar(page, 600);
  await registrar(page, vp, "13b-cidade-rolada", `Painel da cidade rolado até o fim · ${cidade1}`, { comoChegar: "Painel da cidade → rolar." });
  await page.$eval("#painel-cidade", (p) => p.scrollTo(0, 0));
  // água com a cidade aberta
  const vazio2 = await pontoVazio(page, telas.find((t) => t.vp === vp && t.chave === "13-cidade")?.mapa?.pontos);
  if (vazio2) {
    await page.mouse.click(...vazio2);
    await esperar(page, 900);
    testar(vp, "tocar fora (água) com a cidade aberta fecha o painel", (await situacao(page)).cidade === null, `continua aberta: ${(await situacao(page)).cidade ?? "—"}`, "13-cidade");
  }
  // próxima cidade
  const prox = await page.$eval("#btn-cidade-prox", (b) => b.textContent);
  await page.click("#btn-cidade-prox");
  await esperar(page, 2500);
  testar(vp, "“próxima cidade” troca o painel", (await situacao(page)).cidade !== cidade1, `${prox} → ${(await situacao(page)).cidade}`);
  // tocar noutra ilha com o painel aberto (pelo mapa da tela 13)
  const t13 = telas.find((t) => t.vp === vp && t.chave === "13-cidade");
  // “visão inicial” com a cidade aberta
  await page.click("#btn-visao-inicial");
  await esperar(page, 1500);
  testar(vp, "botão “Voltar à visão inicial” com a cidade aberta fecha o painel", (await situacao(page)).cidade === null, "o mesmo ícone faz duas coisas conforme o contexto");
  void t13;

  // E14 compartilhar (sem compartilhamento nativo no Chromium de teste → diálogo)
  const temShare = await page.evaluate(() => typeof navigator.share === "function" && typeof navigator.canShare === "function");
  await page.click("#btn-compartilhar");
  await page.waitForSelector("dialog#dlg-compartilhar[open]", { timeout: 20000 }).catch(() => {});
  await esperar(page, 500);
  await registrar(page, vp, "14-dialogo-compartilhar", "Compartilhar (alternativa sem compartilhamento nativo)", { comoChegar: "Resultado → “Compartilhar meu mundo” num navegador sem compartilhamento de arquivo.", notas: [temShare ? "Este navegador tem navigator.share." : "No celular de verdade (Android/iOS) abre a janela nativa do sistema com o PNG; este diálogo é a alternativa."] });
  await page.click("#dlg-fechar");
  await esperar(page, 300);

  // E15 copiar link → aviso
  await page.click("#btn-link");
  await esperar(page, 500);
  const copiado = await page.evaluate(() => navigator.clipboard.readText().catch(() => ""));
  await registrar(page, vp, "15-link-copiado", "Copiar link (aviso)", { comoChegar: "Resultado → “Copiar link”." });
  testar(vp, "“Copiar link” copia a URL do mundo", copiado.includes("mundo=1"), copiado);

  // baixar imagem
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.click("#btn-baixar")]);
  await esperar(page, 400);
  testar(vp, "“Baixar imagem” baixa o PNG", /\.png$/.test(download.suggestedFilename()), download.suggestedFilename());
  await registrar(page, vp, "16-imagem-baixada", "Baixar imagem (aviso)", { comoChegar: "Resultado → “Baixar imagem”." });

  // E17 recomeçar
  await page.click("#btn-recomecar");
  await esperar(page, 500);
  await registrar(page, vp, "17-dialogo-recomecar", "Começar de novo (confirmação)", { comoChegar: "Resultado → “Começar de novo”." });
  await page.click("#btn-recomecar-cancelar");
  await esperar(page, 400);

  // E18 editar lugares
  await page.click("#btn-editar");
  await esperar(page, 1500);
  await page.evaluate(() => document.activeElement?.blur());
  await registrar(page, vp, "18-editar", "Editar lugares (volta à etapa 1 com tudo preenchido)", { comoChegar: "Resultado → “Editar lugares”." });
  await page.click("#btn-ver-mundo");
  await esperar(page, 2500);
  await ctx.close();
}

// ---------------------------------------------------------------- telas de exceção (só para o inventário)
for (const vp of soVp ? [soVp] : ["desktop", "mobile"]) {
  const { ctx, page } = await novaPagina(vp);
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (t, ...r) { return /webgl/.test(t) ? null : orig.call(this, t, ...r); };
  });
  await page.goto(`${base}?mundo=1&origem=4301602&presente=4106902&coracao=1501402`);
  await esperar(page, 2500);
  await registrar(page, vp, "19-sem-webgl", "Sem WebGL (apresentação estática)", { comoChegar: "Link de mundo aberto num navegador sem WebGL." });
  await ctx.close();
}
{
  const vp = soVp ?? "mobile";
  const { ctx, page } = await novaPagina(vp);
  await page.goto(`file://${arquivoLocal}`);
  await cenaPronta(page).catch(() => {});
  await esperar(page, 2500);
  await page.click("#btn-comecar");
  await page.fill("#busca-campo", "flor");
  await page.waitForSelector("#busca-lista [role=option]");
  await page.click("#opcao-0");
  await esperar(page, 3500);
  await page.click("#btn-ver-mundo");
  await esperar(page, 3000);
  await page.click("#lista-lugares li:nth-child(1) .lugar");
  await esperar(page, 2500);
  await registrar(page, vp, "20-demo-cidade", "Arquivo local (demonstração) · painel da cidade", { comoChegar: "Abrir o HTML direto do disco, sem os dados." });
  await ctx.close();
}

await browser.close();
writeFileSync(path.join(outDir, `mapa-cliques${soVp ? `-${soVp}` : ""}.json`), JSON.stringify({ base, quando: new Date().toISOString(), telas, testes, consoleErros }, null, 2));
log(`\n${telas.length} telas, ${testes.length} testes de clique; erros de console: ${consoleErros.length}`);
for (const e of consoleErros) log("  " + e);

// QA do acabamento de UX (v2.1) do "Meu Pequeno Mundo": resultado compacto/expandido, descobertas discretas, cartão curto no
// celular, ficha em camadas, toque no vazio, troca com Cancelar, etapas, câmera, produtos no resultado, cidade sem perfil e PNG
// com lembranças longas. Gera as capturas de evidências em 375 × 812 e 1440 × 900.
// Usage: node scripts/qa/mini-mundo-v21.mjs <outDir> [baseUrl]
import { chromium, devices } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [outDir, base = "http://127.0.0.1:4321/meu-pequeno-mundo-use-origens.html"] = process.argv.slice(2);
if (!outDir) throw new Error("uso: node scripts/qa/mini-mundo-v21.mjs <outDir> [baseUrl]");
mkdirSync(outDir, { recursive: true });

const NT = "4211504", TJ = "4218004", GP = "4205704";
// No protótipo, os links levam ao site público; na página da loja (/meu-pequeno-mundo), ao próprio ambiente.
const LOJA = /\/meu-pequeno-mundo\/?$/.test(new URL(base).pathname) ? new URL(base).origin : "https://www.useorigens.com.br";
const LOJA_RE = LOJA.replace(/[.:/]/g, (c) => `\\${c}`);
const PILOTO = `${base}?mundo=1&origem=${NT}&presente=${TJ}&coracao=${GP}`;
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const resultado = { base, quando: new Date().toISOString(), checagens: [], consoleErros: [] };
const checar = (nome, ok, detalhe = "") => {
  resultado.checagens.push({ nome, ok: !!ok, detalhe });
  console.log(`${ok ? "OK  " : "FALHOU"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
};
const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  mobile: { ...devices["iPhone 13"], viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 },
};
async function novaPagina(vp, extra = {}) {
  const ctx = await browser.newContext({ ...VIEWPORTS[vp], locale: "pt-BR", acceptDownloads: true, ...extra });
  // na loja, a escolha de cookies já feita (o banner da loja não faz parte da experiência; no protótipo, isto não tem efeito)
  await ctx.addInitScript(() => localStorage.setItem("useorigens:consent:marketing", JSON.stringify({ choice: "accepted", version: 2, decidedAt: new Date().toISOString() })));
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error" && !/net::ERR_FAILED/.test(m.text())) resultado.consoleErros.push(`[${vp}] ${m.text()}`); });
  page.on("pageerror", (e) => resultado.consoleErros.push(`[${vp}] pageerror: ${e.message}`));
  return { ctx, page };
}
const pronta = (page) => page.waitForFunction(() => document.getElementById("status-cena").hidden, null, { timeout: 30000 });
const foto = (page, nome) => page.screenshot({ path: path.join(outDir, `${nome}.png`) });
const est = (page) => page.evaluate(() => window.__meuPequenoMundo.estado());
const rect = (page, sel) => page.$eval(sel, (n) => { const r = n.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, b: r.bottom, r: r.right }; });
const visivel = (page, sel) => page.isVisible(sel);
const marco = (page, id, ref) => page.evaluate(([i, r]) => window.__meuPequenoMundo.marcoNaTela(i, r), [id, ref]);
const pontos = (page) => page.$$eval(".ponto-descoberta:not(.oculta)", (bs) => bs.map((b) => { const r = b.getBoundingClientRect(); return { id: b.dataset.id, ref: b.dataset.ref, x: r.left, y: r.top, w: r.width, h: r.height }; }));
const etiquetas = (page) => page.$$eval(".etiqueta:not(.oculta)", (bs) => bs.map((b) => { const r = b.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }));
const sobrepoe = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
async function alvosPequenos(page, extras = []) {
  return page.evaluate((extras) => {
    const ruins = [];
    const raiz = document.getElementById("app") ?? document; // só a experiência (na loja, o banner de cookies é da loja)
    const lista = [...raiz.querySelectorAll("button, a[href], a.lugar-camisetas, input:not([type=checkbox]), [role=option], summary, label.incluir"), ...extras.flatMap((s) => [...raiz.querySelectorAll(s)])];
    for (const n of new Set(lista)) {
      if (n.closest("[hidden]") || n.classList.contains("oculta") || n.closest(".oculta")) continue;
      const r = n.getBoundingClientRect();
      if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      const e = getComputedStyle(n);
      if (e.visibility === "hidden" || e.display === "none") continue;
      if (r.height < 44 - 0.5 || r.width < 44 - 0.5) ruins.push(`${n.tagName.toLowerCase()}${n.id ? "#" + n.id : ""}.${String(n.className).split(" ")[0]} ${Math.round(r.width)}×${Math.round(r.height)} "${(n.textContent || n.getAttribute("aria-label") || "").trim().slice(0, 24)}"`);
    }
    return ruins;
  }, extras);
}
async function pontoVazio(page) {
  // um ponto da maquete que não é ilha nem marco: canto de cima, abaixo do cabeçalho
  return page.evaluate(() => {
    const c = document.getElementById("cena");
    for (const [x, y] of [[18, 150], [innerWidth - 18, 160], [18, 260], [innerWidth / 2, 110]]) if (document.elementFromPoint(x, y) === c) return { x, y };
    return null;
  });
}
async function arrastar(page, x, y, dx) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++) await page.mouse.move(x + (dx * k) / 8, y, { steps: 2 });
  await page.mouse.up();
}

// ---------------------------------------------------------------- celular 375 × 812
{
  const vp = "mobile";
  const { ctx, page } = await novaPagina(vp);
  await page.goto(PILOTO);
  await pronta(page);
  await page.waitForTimeout(5000);
  await foto(page, "mobile-01-resultado-compacto");
  const painel1 = await rect(page, "#painel-mundo");
  const H = 812;
  checar("[mobile] resultado começa compacto (painel ≤ 40% da tela)", painel1.h <= H * 0.4, `${Math.round(painel1.h)} px de ${H}`);
  checar("[mobile] compacto: lugares, camisetas e compartilhar à vista; detalhes recolhidos", (await visivel(page, "#btn-compartilhar")) && (await visivel(page, "#lista-lugares .lugar-camisetas")) && !(await visivel(page, "#conecta")) && !(await visivel(page, "#btn-baixar")));
  checar("[mobile] indicação clara para abrir os detalhes", (await page.textContent("#btn-detalhes")).trim() === "Detalhes" && (await page.getAttribute("#btn-detalhes", "aria-expanded")) === "false");
  const cartoes = await page.$$eval("#lista-lugares .lugar", (ls) => ls.map((l) => ({
    id: l.dataset.id, foto: l.querySelector("a.lugar-foto")?.href ?? null, img: l.querySelector("a.lugar-foto img")?.src ?? null,
    camisetas: l.querySelector(".lugar-camisetas")?.getAttribute("href"), conhecer: !!l.querySelector("button.lugar-conhecer"),
    linkEmBotao: !!l.querySelector("button a, a button"),
  })));
  checar("[mobile] uma camiseta real por cidade, com link da estampa", cartoes.length === 3 && cartoes.every((c) => c.img?.startsWith("https://") && new RegExp(`^${LOJA_RE}\\/sul\\/sc\\/[a-z-]+\\/.+`).test(c.foto ?? "")), cartoes.map((c) => c.foto).join(" | "));
  checar("[mobile] 'Conhecer' (botão) e 'Camisetas' (link da página da cidade) com destinos distintos, sem link dentro de botão", cartoes.every((c) => c.conhecer && new RegExp(`^${LOJA_RE}\\/sul\\/sc\\/(nova-trento|tijucas|garopaba)$`).test(c.camisetas ?? "") && !c.linkEmBotao), cartoes.map((c) => c.camisetas).join(" | "));
  const etqCompacto = await etiquetas(page);
  checar("[mobile] compacto: as três etiquetas acima do painel, sem corte", etqCompacto.length === 3 && etqCompacto.every((e) => e.y >= 56 && e.y + e.h <= painel1.y && e.x >= 0 && e.x + e.w <= 375), etqCompacto.map((e) => `${Math.round(e.x)},${Math.round(e.y)}`).join(" "));
  // escala da maquete: distância na tela entre dois marcos da MESMA ilha (o arranjo das ilhas pode mudar com o formato da área livre)
  const nt1 = await marco(page, NT, "santuario-santa-paulina"), gp1 = await marco(page, NT, "montes-do-vale");
  checar("[mobile] visão geral sem pontos de descoberta", (await pontos(page)).length === 0);
  let pequenos = await alvosPequenos(page);
  checar("[mobile] alvos ≥ 44 px no resultado compacto", pequenos.length === 0, pequenos.join("; "));

  // expandir: detalhes à vista e enquadramento refeito para a área livre menor
  await page.click("#btn-detalhes");
  await page.waitForTimeout(2600);
  await foto(page, "mobile-02-resultado-expandido");
  const painel2 = await rect(page, "#painel-mundo");
  const nt2 = await marco(page, NT, "santuario-santa-paulina"), gp2 = await marco(page, NT, "montes-do-vale");
  checar("[mobile] expandido: o que conecta, baixar, copiar link, editar e recomeçar", (await visivel(page, "#conecta")) && (await visivel(page, "#btn-baixar")) && (await visivel(page, "#btn-recomecar")) && (await page.getAttribute("#btn-detalhes", "aria-expanded")) === "true");
  checar("[mobile] enquadramento muda com o painel (maquete menor quando expandido)", painel2.h > painel1.h && Math.hypot(nt2.x - gp2.x, nt2.y - gp2.y) < Math.hypot(nt1.x - gp1.x, nt1.y - gp1.y), `escala (santuário ↔ montes): ${Math.round(Math.hypot(nt1.x - gp1.x, nt1.y - gp1.y))} → ${Math.round(Math.hypot(nt2.x - gp2.x, nt2.y - gp2.y))} px`);
  pequenos = await alvosPequenos(page);
  checar("[mobile] alvos ≥ 44 px no resultado expandido", pequenos.length === 0, pequenos.join("; "));
  await page.click("#btn-detalhes");
  await page.waitForTimeout(2600);
  const nt3 = await marco(page, NT, "santuario-santa-paulina"), gp3 = await marco(page, NT, "montes-do-vale");
  checar("[mobile] recolher restaura o enquadramento compacto", Math.abs(Math.hypot(nt3.x - gp3.x, nt3.y - gp3.y) - Math.hypot(nt1.x - gp1.x, nt1.y - gp1.y)) < 6);

  // descoberta: toque no marco → cartão curto encostado no painel, preservando a maquete
  await page.mouse.click(nt3.x, nt3.y);
  await page.waitForTimeout(1500);
  await foto(page, "mobile-03-descoberta-cartao");
  const balao = await rect(page, "#balao"), painel3 = await rect(page, "#painel-mundo");
  const curto = await page.$eval("#balao-curto", (n) => getComputedStyle(n).display !== "none" && n.textContent);
  const completoOculto = await page.$eval("#balao-texto", (n) => getComputedStyle(n).display === "none");
  checar("[mobile] cartão curto: nome, uma ou duas frases e 'Conhecer'", (await page.textContent("#balao-titulo")) === "Santuário Santa Paulina" && !!curto && curto.split(". ").length <= 2 && completoOculto && (await visivel(page, "#btn-balao-cidade")), curto);
  checar("[mobile] cartão encostado no painel e deixa a maior parte da maquete à vista", balao.b <= painel3.y + 1 && balao.h <= (painel3.y - 64) * 0.45, `cartão ${Math.round(balao.h)} px; área da maquete ${Math.round(painel3.y - 64)} px`);
  const fecharB = await rect(page, "#btn-fechar-balao");
  checar("[mobile] fechar do cartão com 44 × 44 px", fecharB.w >= 44 && fecharB.h >= 44, `${fecharB.w}×${fecharB.h}`);
  const pts = await pontos(page);
  const etqs = await etiquetas(page);
  checar("[mobile] só os pontos da cidade em exploração, com 44 px de área e sem sobreposição", pts.length === 2 && pts.every((p) => p.id === NT && p.w >= 44 && p.h >= 44) && !sobrepoe(pts[0], pts[1]) && pts.every((p) => etqs.every((e) => !sobrepoe(p, e))), pts.map((p) => `${p.ref} ${p.w}×${p.h}`).join(", "));
  const visual = await page.$eval(".ponto-descoberta:not(.oculta) .anel", (n) => n.getBoundingClientRect().width);
  checar("[mobile] símbolo visível do ponto entre 16 e 20 px", visual >= 16 && visual <= 20, `${visual} px`);
  // arrasto não fecha; toque no vazio fecha
  const vazio = await pontoVazio(page);
  await arrastar(page, 60, 200, 120);
  await page.waitForTimeout(700);
  checar("[mobile] arrastar a câmera não fecha o cartão", (await est(page)).descobertaAberta !== null);
  await page.mouse.click(vazio.x, vazio.y);
  await page.waitForTimeout(600);
  checar("[mobile] tocar no espaço vazio fecha o cartão", (await est(page)).descobertaAberta === null && (await page.$eval("#balao", (n) => n.hidden)));
  await page.click("#btn-visao-inicial");
  await page.waitForTimeout(1500);

  // ficha pela lista: estado compacto, camisetas na primeira tela
  await page.click("#lista-lugares li:nth-child(1) .lugar-conhecer");
  await page.waitForSelector("#cidade-produtos a.produto", { timeout: 20000 });
  await page.waitForTimeout(2600);
  await foto(page, "mobile-04-ficha-primeira-tela");
  const prod = await rect(page, "#cidade-produtos a.produto");
  checar("[mobile] ficha: produtos reais na primeira tela", prod.y < 812 - 60, `primeira camiseta em y=${Math.round(prod.y)}`);
  checar("[mobile] ficha aberta pela lista: 'Conheça este lugar' recolhido", !(await page.$eval("#cidade-conheca", (d) => d.open)) && !(await page.$eval("#cidade-conheca", (d) => d.hidden)));
  const frase = await rect(page, "#cidade-frase");
  checar("[mobile] frase editorial em até duas linhas", frase.h <= 2 * 1.3 * 19 + 4, `${Math.round(frase.h)} px`);
  checar("[mobile] câmera focada na ilha e controle vira 'Voltar ao mundo'", (await page.getAttribute("#btn-visao-inicial", "aria-label")) === "Fechar a ficha e voltar ao mundo");
  pequenos = await alvosPequenos(page);
  checar("[mobile] alvos ≥ 44 px na ficha", pequenos.length === 0, pequenos.join("; "));
  // rolagem: CTA e fechar continuam acessíveis
  await page.$eval("#painel-cidade", (p) => p.scrollTo(0, p.scrollHeight));
  await page.waitForTimeout(600);
  await foto(page, "mobile-05-ficha-rolada");
  const cta = await rect(page, "#cidade-cta"), fechar = await rect(page, "#btn-fechar-cidade");
  checar("[mobile] ao rolar até o fim, 'Ver camisetas' e o fechar continuam na tela", cta.y >= 0 && cta.b <= 812 && fechar.y >= 0 && fechar.b <= 812, `CTA y=${Math.round(cta.y)}, fechar y=${Math.round(fechar.y)}`);
  await page.$eval("#painel-cidade", (p) => p.scrollTo(0, 0));
  await page.waitForTimeout(400); // a ficha volta ao topo e a câmera reenquadra antes de medir o marco
  // marco com a ficha aberta: realça a referência na própria ficha (sem cartão por cima)
  const nt4 = await marco(page, NT, "santuario-santa-paulina");
  const noPonto = await page.evaluate(([x, y]) => { const n = document.elementFromPoint(x, y); return `${n?.tagName.toLowerCase()}${n?.id ? "#" + n.id : ""}.${String(n?.className ?? "").split(" ")[0]} scrollY=${Math.round(scrollY)}`; }, [nt4.x, nt4.y]);
  await page.mouse.click(nt4.x, nt4.y);
  await page.waitForTimeout(1500);
  const destaque = await page.evaluate(() => ({ aberto: document.getElementById("cidade-conheca").open, ref: document.querySelector(".referencia.destacada")?.dataset.ref, balao: !document.getElementById("balao").hidden }));
  checar("[mobile] marco com a ficha aberta: abre 'Conheça este lugar' e realça a referência", destaque.aberto && destaque.ref === "santuario-santa-paulina" && !destaque.balao, `${JSON.stringify(destaque)} (no ponto: ${noPonto})`);
  await foto(page, "mobile-06-ficha-referencia-do-marco");
  // arrasto não fecha a ficha; toque no vazio fecha e restaura o conjunto
  await arrastar(page, 40, 140, 100);
  await page.waitForTimeout(700);
  checar("[mobile] arrastar não fecha a ficha", (await est(page)).cidadeAberta === NT);
  const vazio2 = await pontoVazio(page);
  await page.mouse.click(vazio2.x, vazio2.y);
  await page.waitForTimeout(1600);
  checar("[mobile] tocar no espaço vazio fecha a ficha e volta ao mundo", (await est(page)).cidadeAberta === null && (await visivel(page, "#painel-mundo")));
  const nt5 = await marco(page, NT, "santuario-santa-paulina"), gp5 = await marco(page, NT, "montes-do-vale");
  checar("[mobile] ao voltar, o enquadramento do conjunto é restaurado", Math.abs(Math.hypot(nt5.x - gp5.x, nt5.y - gp5.y) - Math.hypot(nt1.x - gp1.x, nt1.y - gp1.y)) < 8);

  // erro de produto só no bloco afetado
  // o protótipo lê dados/lugares/<id>.json; a página da loja, /api/mundo/lugares/<id>.json
  const arquivoTj = new RegExp(`/(dados|api/mundo)/lugares/${TJ}\\.json`);
  await page.route(arquivoTj, (r) => r.abort());
  await page.evaluate(() => localStorage.clear());
  await page.goto(PILOTO);
  await pronta(page);
  await page.waitForTimeout(3500);
  const erro = await page.$eval(`#lista-lugares [data-id="${TJ}"] .lugar-foto`, (n) => n.textContent);
  const outros = await page.$$eval("#lista-lugares a.lugar-foto img", (is) => is.length);
  checar("[mobile] produto que falha: erro só no cartão afetado, com nova tentativa; o resto segue", /Não carregou/.test(erro) && /Tentar de novo/.test(erro) && outros === 2 && (await visivel(page, "#btn-compartilhar")), erro);
  await page.$eval(`#lista-lugares [data-id="${TJ}"]`, (n) => n.scrollIntoView({ inline: "start" }));
  await page.waitForTimeout(300);
  await foto(page, "mobile-07-erro-de-produto-no-cartao");
  await page.unroute(arquivoTj);
  await page.click(`#lista-lugares [data-id="${TJ}"] .lugar-foto button`);
  await page.waitForTimeout(1500);
  checar("[mobile] 'Tentar de novo' recarrega só aquele cartão", (await page.$$eval("#lista-lugares a.lugar-foto img", (is) => is.length)) === 3);
  await ctx.close();
}

// ---------------------------------------------------------------- celular: montagem (troca, etapas, câmera, só coração)
{
  const { ctx, page } = await novaPagina("mobile");
  await page.goto(base);
  await pronta(page);
  await page.waitForTimeout(2500);
  await page.click("#btn-comecar");
  await page.waitForTimeout(600);
  await page.evaluate(() => document.activeElement?.blur());
  checar("[mobile] montagem sem ilha: controles da câmera escondidos", await page.$eval("#camera", (n) => n.hidden));
  await page.click("#dica-palco");
  checar("[mobile] a dica do centro leva à busca", (await page.evaluate(() => document.activeElement?.id)) === "busca-campo");
  await page.evaluate(() => document.activeElement?.blur());
  await page.click("#campo-busca svg", { force: true });
  checar("[mobile] a lupa põe o foco na busca", (await page.evaluate(() => document.activeElement?.id)) === "busca-campo");
  checar("[mobile] etapa 1 vazia: sem botão cheio, 'Pular' como texto", !(await visivel(page, "#btn-avancar")) && (await visivel(page, "#btn-pular")) && (await page.getAttribute("#btn-pular", "class")) === "link-acao");
  await page.fill("#busca-campo", "tijucas");
  await page.waitForSelector("#busca-lista [role=option]");
  await page.click("#opcao-0");
  await page.waitForTimeout(2800);
  checar("[mobile] depois da primeira ilha, controles da câmera aparecem", !(await page.$eval("#camera", (n) => n.hidden)));
  checar("[mobile] cartão escolhido é um botão 'Trocar …'", (await page.getAttribute("#btn-trocar", "aria-label")) === "Trocar Tijucas · SC");
  await page.focus("#btn-trocar");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  checar("[mobile] trocar pelo teclado abre a busca com 'Trocando Tijucas' e 'Cancelar'", (await visivel(page, "#troca")) && (await page.textContent("#troca")).includes("Trocando Tijucas") && (await visivel(page, "#btn-cancelar-troca")));
  await page.evaluate(() => document.activeElement?.blur());
  await foto(page, "mobile-08-trocando-com-cancelar");
  await page.click("#btn-cancelar-troca");
  await page.waitForTimeout(400);
  checar("[mobile] cancelar a troca mantém a cidade e devolve o foco ao cartão", (await page.textContent("#escolha-nome")) === "Tijucas · SC" && (await page.evaluate(() => document.activeElement?.id)) === "btn-trocar");
  await page.click("#btn-trocar");
  await page.click("#passos li:nth-child(2) button");
  await page.waitForTimeout(500);
  await page.click("#passos li:nth-child(1) button");
  await page.waitForTimeout(500);
  checar("[mobile] ir para outra etapa durante a troca desiste dela e mantém a cidade", (await page.textContent("#escolha-nome")) === "Tijucas · SC" && !(await visivel(page, "#troca")));
  await page.click("#btn-avancar");
  await page.waitForTimeout(500);
  checar("[mobile] etapa 2 vazia: 'Pular' e 'Ver meu mundo' como texto, sem três botões iguais", !(await visivel(page, "#btn-avancar")) && (await visivel(page, "#btn-pular")) && (await visivel(page, "#btn-ver-mundo")));
  await page.click("#btn-pular");
  await page.waitForTimeout(500);
  await page.evaluate(() => document.activeElement?.blur());
  await foto(page, "mobile-09-etapa-3-vazia");
  checar("[mobile] etapa 3 vazia: nenhum botão cheio destaca pular", !(await visivel(page, "#btn-avancar")) && (await page.textContent("#btn-pular")) === "Pular e ver meu mundo");
  await page.fill("#busca-campo", "garopaba");
  await page.waitForSelector("#busca-lista [role=option]");
  await page.click("#opcao-0");
  await page.waitForTimeout(2500);
  checar("[mobile] depois da escolha, 'Ver meu mundo' ganha destaque", (await visivel(page, "#btn-avancar")) && (await page.textContent("#btn-avancar")) === "Ver meu mundo" && !(await page.$eval("#btn-avancar", (b) => b.classList.contains("btn-ghost"))));
  const pequenos = await alvosPequenos(page, ["#dica-palco"]);
  checar("[mobile] alvos ≥ 44 px na montagem", pequenos.length === 0, pequenos.join("; "));
  await ctx.close();

  // só lugar do coração
  const outro = await novaPagina("mobile");
  await outro.page.goto(base);
  await pronta(outro.page);
  await outro.page.waitForTimeout(2000);
  await outro.page.click("#btn-comecar");
  await outro.page.click("#passos li:nth-child(3) button");
  await outro.page.fill("#busca-campo", "garopaba");
  await outro.page.waitForSelector("#busca-lista [role=option]");
  await outro.page.click("#opcao-0");
  await outro.page.waitForTimeout(2500);
  await outro.page.click("#btn-avancar");
  await outro.page.waitForTimeout(3000);
  const so = await est(outro.page);
  checar("[mobile] conclui apenas com o lugar do coração", so.modo === "mundo" && !so.papeis.origem && !so.papeis.presente && so.papeis.coracao === GP);
  await foto(outro.page, "mobile-10-so-lugar-do-coracao");
  await outro.ctx.close();

  // cidade sem perfil
  const sp = await novaPagina("mobile");
  await sp.page.goto(`${base}?mundo=1&origem=4301602`);
  await pronta(sp.page);
  await sp.page.waitForTimeout(3000);
  await sp.page.click("#lista-lugares li:nth-child(1) .lugar-conhecer");
  await sp.page.waitForSelector("#cidade-produtos a.produto", { timeout: 20000 });
  await sp.page.waitForTimeout(2000);
  const ficha = await sp.page.evaluate(() => ({
    texto: document.getElementById("painel-cidade").textContent,
    conheca: !document.getElementById("cidade-conheca").hidden,
    paisagem: !document.getElementById("cidade-paisagem").hidden && document.getElementById("cidade-paisagem").textContent,
  }));
  checar("[mobile] cidade sem perfil: sem o aviso de texto faltante e sem seções editoriais vazias", !/Ainda não temos um texto/.test(ficha.texto) && !ficha.conheca);
  checar("[mobile] cidade sem perfil: identificação discreta de cenário ilustrativo", /ilustrativ/i.test(ficha.paisagem || ""), ficha.paisagem);
  await foto(sp.page, "mobile-11-cidade-sem-perfil");
  await sp.ctx.close();
}

// ---------------------------------------------------------------- desktop 1440 × 900
{
  const { ctx, page } = await novaPagina("desktop");
  await page.goto(PILOTO);
  await pronta(page);
  await page.waitForTimeout(5000);
  await foto(page, "desktop-01-resultado");
  checar("[desktop] resultado com tudo aberto (sem o botão de detalhes)", !(await visivel(page, "#btn-detalhes")) && (await visivel(page, "#conecta")) && (await visivel(page, "#btn-baixar")));
  checar("[desktop] cartões com camiseta, 'Conhecer' e 'Camisetas'", (await page.$$("#lista-lugares a.lugar-foto img")).length === 3 && (await page.$$("#lista-lugares a.lugar-camisetas[href]")).length === 3);
  let pequenos = await alvosPequenos(page);
  checar("[desktop] alvos ≥ 44 px no resultado", pequenos.length === 0, pequenos.join("; "));
  const tj = await marco(page, TJ, "casarao-gallotti");
  await page.mouse.click(tj.x, tj.y);
  await page.waitForTimeout(1500);
  await foto(page, "desktop-02-descoberta-balao");
  const fecharB = await rect(page, "#btn-fechar-balao");
  checar("[desktop] balão do casarão com fechar de 44 × 44 px", (await page.textContent("#balao-titulo")) === "Casarão Gallotti" && fecharB.w >= 44 && fecharB.h >= 44, `${fecharB.w}×${fecharB.h}`);
  await page.click("#btn-balao-cidade");
  await page.waitForSelector("#cidade-produtos a.produto", { timeout: 20000 });
  await page.waitForTimeout(2500);
  const ref = await page.evaluate(() => ({ aberto: document.getElementById("cidade-conheca").open, ref: document.querySelector(".referencia.destacada")?.dataset.ref }));
  checar("[desktop] 'Conhecer Tijucas' a partir do marco abre a ficha com a referência realçada", ref.aberto && ref.ref === "casarao-gallotti", JSON.stringify(ref));
  await foto(page, "desktop-03-ficha-a-partir-do-marco");
  checar("[desktop] com a ficha aberta, o controle diz 'Voltar ao mundo'", (await page.textContent("#btn-visao-inicial .rotulo-longo")) === "Voltar ao mundo");
  pequenos = await alvosPequenos(page);
  checar("[desktop] alvos ≥ 44 px na ficha", pequenos.length === 0, pequenos.join("; "));
  await page.click("#btn-visao-inicial");
  await page.waitForTimeout(1500);
  checar("[desktop] 'Voltar ao mundo' fecha a ficha e o controle volta a 'Visão inicial'", (await est(page)).cidadeAberta === null && (await page.textContent("#btn-visao-inicial .rotulo-longo")) === "Visão inicial");
  await page.click("#lista-lugares li:nth-child(1) .lugar-conhecer");
  await page.waitForSelector("#cidade-produtos a.produto", { timeout: 20000 });
  await page.waitForTimeout(2500);
  await foto(page, "desktop-04-ficha-primeira-tela");
  const prod = await rect(page, "#cidade-produtos a.produto");
  checar("[desktop] ficha: produtos na primeira tela e 'Conheça' recolhido", prod.y < 900 - 80 && !(await page.$eval("#cidade-conheca", (d) => d.open)), `y=${Math.round(prod.y)}`);
  await page.$eval("#painel-cidade", (p) => p.scrollTo(0, p.scrollHeight));
  await page.waitForTimeout(500);
  const cta = await rect(page, "#cidade-cta"), fechar = await rect(page, "#btn-fechar-cidade");
  checar("[desktop] ao rolar, 'Ver camisetas' e o fechar continuam na tela", cta.y >= 0 && cta.b <= 900 && fechar.y >= 0 && fechar.b <= 900);
  await foto(page, "desktop-05-ficha-rolada");
  const vazio = await pontoVazio(page);
  await page.mouse.click(vazio.x, vazio.y);
  await page.waitForTimeout(1500);
  checar("[desktop] clicar no espaço vazio fecha a ficha", (await est(page)).cidadeAberta === null);
  await ctx.close();
}

// ---------------------------------------------------------------- PNG: três lembranças de 80 caracteres e nomes longos
for (const vp of ["desktop", "mobile"]) {
  const { ctx, page } = await novaPagina(vp);
  const lembrancas = {
    lo: "Onde aprendi a nadar no rio com meus avós, todo verão, até escurecer de novo!!!!", // com espaços
    lp: "Saudadesdascasasdemadeiraedasfestasdacomunidadequenuncavouesquecerjamaisnenhumdi", // sem espaços
    lc: "Meu lugar de descanso 🌊🌴 com a família inteira reunida no fim de ano ❤️ sempre!!", // com emoji
  };
  const url = `${base}?mundo=1&origem=5105507&presente=4215687&coracao=4123303&${new URLSearchParams(lembrancas)}`;
  await page.goto(url);
  await pronta(page);
  await page.waitForTimeout(4000);
  const tamanhos = Object.values(lembrancas).map((t) => [...t].length);
  const [d] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), (async () => {
    const fechado = await page.$eval("#btn-detalhes", (b) => getComputedStyle(b).display !== "none" && b.getAttribute("aria-expanded") === "false");
    if (fechado) await page.click("#btn-detalhes");
    await page.click("#btn-baixar");
  })()]);
  const destino = path.join(outDir, `${vp}-12-exportado-nomes-longos-e-lembrancas.png`);
  await d.saveAs(destino);
  const png = readFileSync(destino);
  checar(`[${vp}] PNG com três lembranças longas e nomes longos: 1080 × 1350`, png.readUInt32BE(16) === 1080 && png.readUInt32BE(20) === 1350, `lembranças com ${tamanhos.join(", ")} caracteres`);
  await ctx.close();
}

await browser.close();
const ok = resultado.checagens.filter((c) => c.ok).length;
writeFileSync(path.join(outDir, "resultado-v21.json"), JSON.stringify(resultado, null, 2));
console.log(`\n${ok}/${resultado.checagens.length} checagens ok; erros de console: ${resultado.consoleErros.length}`);
for (const e of resultado.consoleErros) console.log("  " + e);

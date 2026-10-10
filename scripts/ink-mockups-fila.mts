// Fila persistente da ativação de mockups pelo PAINEL INK (Camiseta base Norte/CO migrada, oculta). A ação de mockup é feita no painel
// (Claude in Chrome); este script só monta a fila, CONFERE por GET e registra o resultado. Nunca escreve na INK.
// Doc: docs/migracao-ink/origens-mockups-painel-execucao.md
//
//   npm run mockups:fila -- montar --run=20261005050850-ef5901c1d   # cria data/unificado/mockups/fila.json (recusa sobrescrever)
//   npm run mockups:fila -- conferir [--status=pendente,acionado,processando] [--limite=N]   # GET por id: imagem, visibilidade, tipo, preço, slug
//   npm run mockups:fila -- proximos [--n=10]                        # próximos ids pendentes (prioridade primeiro)
//   npm run mockups:fila -- marcar <id> <status> [nota…]            # registra o que foi feito no painel
//   npm run mockups:fila -- acionados <ids…>                       # registra os acionados do executor (só pendentes)
//   npm run mockups:fila -- status                                   # totais
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { INK_API_BASE_URL, tokenFor } from "../src/lib/ink/config";
import { assertForaDaProducao, diretorioSombraPadrao } from "../src/lib/catalog/unificado/destino";

type Status = "pendente" | "dispensado" | "acionado" | "processando" | "concluido" | "erro" | "bloqueado";
type Foto = { em: string; visivel: boolean; status: string | null; aprovacao: string | null; tipoId: number | null; preco: string | null; slug: string; nome: string; imagem: string | null; variantes: number };
type Item = {
  id: string;
  nome: string;
  regiao: "norte" | "centro-oeste";
  chaveProduto: string;
  /** Recupera um card hoje visível na loja regional (Camiseta antiga visível confirmada para este id). */
  prioridade: 1 | 2;
  status: Status;
  tentativas: number;
  historico: { em: string; de: Status; para: Status; nota?: string }[];
  /** Primeira leitura (antes de qualquer ação) e a mais recente. */
  antes?: Foto;
  depois?: Foto;
  urlPainel?: string;
};
type Fila = { versao: 1; criadaEm: string; run: string; itens: Item[] };

const dir = path.join(diretorioSombraPadrao(), "mockups");
const arq = path.join(dir, "fila.json");
assertForaDaProducao(dir);
const [cmd, ...resto] = process.argv.slice(2);
const opt = (n: string) => resto.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const agora = () => new Date().toISOString();

function ler(): Fila {
  if (!existsSync(arq)) throw new Error(`sem fila em ${arq} — rode "montar"`);
  return JSON.parse(readFileSync(arq, "utf8")) as Fila;
}
function gravar(f: Fila) {
  const tmp = `${arq}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(f, null, 1));
  renameSync(tmp, arq); // atômico: uma queda no meio nunca deixa a fila pela metade
}
function mudar(it: Item, para: Status, nota?: string) {
  if (it.status === para && !nota) return;
  it.historico.push({ em: agora(), de: it.status, para, ...(nota ? { nota } : {}) });
  it.status = para;
}

async function foto(id: string): Promise<Foto> {
  const token = tokenFor("use-sul");
  if (!token) throw new Error("sem INK_TOKEN_SUL");
  for (let t = 0; ; t++) {
    // Somente leitura.
    const res = await fetch(`${INK_API_BASE_URL}/v1/stores/products/${id}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60_000) }).catch(() => null);
    if (res?.ok) {
      const p = ((await res.json()) as { product: Record<string, unknown> }).product;
      const tipo = p.product_type as { id?: number } | undefined;
      return {
        em: agora(),
        visivel: p.visible_in_store === true,
        status: (p.status as string) ?? null,
        aprovacao: (p.approval_status as string) ?? null,
        tipoId: tipo?.id ?? null,
        preco: p.price == null ? null : String(p.price),
        slug: String(p.slug ?? ""),
        nome: String(p.name ?? ""),
        imagem: (p.main_image_url as string) || null,
        variantes: Array.isArray(p.product_variants) ? p.product_variants.length : 0,
      };
    }
    if (t >= 4) throw new Error(`GET ${id}: ${res ? res.status : "rede"}`);
    await new Promise((r) => setTimeout(r, res?.status === 429 ? 30_000 : 5_000));
  }
}

/** Mudança comercial inesperada entre a primeira leitura e a atual: interrompe o lote (regra do comando). */
function alteracaoComercial(a: Foto, b: Foto): string | null {
  const d: string[] = [];
  if (b.visivel !== a.visivel) d.push(`visível ${a.visivel}→${b.visivel}`);
  if (b.status !== a.status) d.push(`status ${a.status}→${b.status}`);
  if (b.preco !== a.preco) d.push(`preço ${a.preco}→${b.preco}`);
  if (b.slug !== a.slug) d.push(`slug ${a.slug}→${b.slug}`);
  if (b.nome !== a.nome) d.push(`nome mudou`);
  if (b.tipoId !== a.tipoId) d.push(`tipo ${a.tipoId}→${b.tipoId}`);
  return d.length ? d.join("; ") : null;
}

if (cmd === "montar") {
  if (existsSync(arq) && !resto.includes("--forcar")) throw new Error(`fila já existe em ${arq}; ela é o checkpoint — não sobrescrevo (use --forcar só se for de propósito)`);
  const run = opt("run");
  if (!run) throw new Error("passe --run=<runId da reconciliação>");
  const saida = path.join(diretorioSombraPadrao(), "saida", run);
  const linhas = (f: string) => readFileSync(path.join(saida, f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const bloqueadas = linhas("ativacao-bloqueada.jsonl") as { id: string; nome: string; regiao: Item["regiao"]; chaveProduto: string; motivos: string[] }[];
  const mapa = linhas("mapa-antigo-novo.jsonl") as { tipoPecaId: number; visivelAntigo: boolean; status: string; idNovo: string | null; chaveProduto: string | null }[];
  const visiveisHoje = new Set(mapa.filter((l) => l.tipoPecaId === 1 && l.visivelAntigo && l.status === "confirmado").map((l) => l.idNovo));
  // Identidade ambígua fica fora da execução automática (Maraã × Sou de Maraã: qualquer chave com linha ambígua no mapa).
  const ambiguas = new Set(mapa.filter((l) => l.status === "ambiguo" && l.chaveProduto).map((l) => l.chaveProduto));
  const vistos = new Set<string>();
  const itens: Item[] = [];
  const fora: string[] = [];
  for (const b of bloqueadas) {
    if (vistos.has(b.id)) continue;
    vistos.add(b.id);
    if (!b.motivos.every((m) => m.startsWith("sem imagem"))) {
      fora.push(`${b.id} (${b.motivos.join("; ")})`);
      continue;
    }
    if (ambiguas.has(b.chaveProduto)) {
      fora.push(`${b.id} ${b.nome} (identidade ambígua)`);
      continue;
    }
    itens.push({ id: b.id, nome: b.nome, regiao: b.regiao, chaveProduto: b.chaveProduto, prioridade: visiveisHoje.has(b.id) ? 1 : 2, status: "pendente", tentativas: 0, historico: [] });
  }
  itens.sort((a, b) => a.prioridade - b.prioridade || Number(a.id) - Number(b.id));
  mkdirSync(dir, { recursive: true });
  gravar({ versao: 1, criadaEm: agora(), run, itens });
  console.log(`fila: ${itens.length} Camisetas base (prioridade 1: ${itens.filter((i) => i.prioridade === 1).length}); fora: ${fora.length}`);
  for (const f of fora) console.log(`  fora: ${f}`);
} else if (cmd === "conferir") {
  const f = ler();
  const alvo = new Set((opt("status") ?? "pendente,acionado,processando").split(","));
  const limite = Number(opt("limite") ?? Infinity);
  let n = 0;
  const interromper: string[] = [];
  for (const it of f.itens) {
    if (!alvo.has(it.status) || n >= limite) continue;
    n++;
    let fo: Foto;
    try {
      fo = await foto(it.id);
    } catch (e) {
      mudar(it, it.status, `conferência falhou: ${String(e)}`);
      continue;
    }
    if (!it.antes) it.antes = fo;
    it.depois = fo;
    if (fo.tipoId !== 1) mudar(it, "bloqueado", `tipo ${fo.tipoId}, não é Camiseta base`);
    else if (fo.visivel) mudar(it, "bloqueado", "produto está VISÍVEL — fora do escopo (devia estar oculto)");
    else {
      const alt = alteracaoComercial(it.antes, fo);
      if (alt) {
        mudar(it, "bloqueado", `alteração comercial inesperada: ${alt}`);
        interromper.push(`${it.id}: ${alt}`);
      } else if (fo.imagem) mudar(it, it.status === "pendente" ? "dispensado" : "concluido", it.status === "pendente" ? "mockup já disponível" : "imagem presente");
    }
    if (n % 25 === 0) {
      gravar(f);
      process.stdout.write(`\r${n} conferidos…`);
    }
    await new Promise((r) => setTimeout(r, 700)); // ~85 req/min no máximo, abaixo do limite de 100/min da loja
  }
  gravar(f);
  console.log(`\r${n} conferido(s).`);
  if (interromper.length) {
    console.log("INTERROMPER O LOTE — alteração comercial inesperada:");
    for (const l of interromper) console.log(`  ${l}`);
    process.exitCode = 2;
  }
} else if (cmd === "proximos") {
  const f = ler();
  const n = Number(opt("n") ?? 10);
  console.log(JSON.stringify(f.itens.filter((i) => i.status === "pendente").slice(0, n).map((i) => ({ id: i.id, nome: i.nome, regiao: i.regiao, prioridade: i.prioridade }))));
} else if (cmd === "marcar") {
  const f = ler();
  const [id, status, ...nota] = resto.filter((a) => !a.startsWith("--"));
  const it = f.itens.find((i) => i.id === id);
  if (!it) throw new Error(`${id} não está na fila`);
  if (!["pendente", "dispensado", "acionado", "processando", "concluido", "erro", "bloqueado"].includes(status)) throw new Error(`status inválido: ${status}`);
  if (status === "acionado") it.tentativas++;
  mudar(it, status as Status, nota.join(" ") || undefined);
  gravar(f);
  console.log(`${id}: ${status}`);
} else if (cmd === "acionados") {
  // Registra de uma vez os ids que o executor do painel marcou como acionados (copiados de __mockups). Só mexe em quem está pendente;
  // id fora da fila é recusado e listado (nunca entra).
  const f = ler();
  const porId = new Map(f.itens.map((i) => [i.id, i]));
  const ids = resto.filter((a) => !a.startsWith("--")).flatMap((a) => a.split(/[\s,]+/)).filter(Boolean);
  const fora = ids.filter((id) => !porId.has(id));
  let n = 0;
  for (const id of ids) {
    const it = porId.get(id);
    if (!it || it.status !== "pendente") continue;
    it.tentativas++;
    mudar(it, "acionado", "executor do painel: vitrine 114 + Salvar Produto");
    n++;
  }
  gravar(f);
  console.log(`${n} marcado(s) como acionado; ${ids.length - n - fora.length} já registrados${fora.length ? `; FORA DA FILA (ignorados): ${fora.join(", ")}` : ""}`);
} else if (cmd === "status") {
  const f = ler();
  const t: Record<string, number> = {};
  for (const i of f.itens) t[`${i.status}`] = (t[`${i.status}`] ?? 0) + 1;
  const ocultos = f.itens.filter((i) => i.depois).every((i) => !i.depois!.visivel);
  console.log(JSON.stringify({ total: f.itens.length, ...t, conferidosTodosOcultos: ocultos }, null, 1));
} else {
  console.error("uso: montar | conferir | proximos | marcar | status");
  process.exitCode = 1;
}

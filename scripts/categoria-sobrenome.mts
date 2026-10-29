// Cria, uma vez, a categoria OCULTA "Sobrenomes" (a INK limita o nome a 20 caracteres) na loja única (use-sul) já com os produtos personalizados que existem, para a equipe
// filtrar no painel da INK. Os produtos novos entram sozinhos (PERSONALIZED_COLLECTION_ID em src/lib/customization/products-server.ts).
// Sem --criar só lista o que faria. Os tokens ficam na Railway:
//
//   railway run --service useorigens-storefront -- node --conditions=react-server --import tsx scripts/categoria-sobrenome.mts [--criar]
import { INK_API_BASE_URL, tokenFor, writeTokenFor } from "../src/lib/ink/config";

const NAME = "Sobrenomes";
/** Os produtos personalizados nasceram a partir de 27/10/2026 (piloto), ocultos e com as tags de describeJob. */
const SINCE = "2026-10-27";
const create = process.argv.includes("--criar");

const readToken = tokenFor("use-sul") ?? writeTokenFor("use-sul");
const writeToken = writeTokenFor("use-sul");
if (!readToken) throw new Error("sem INK_TOKEN_SUL nem INK_WRITE_TOKEN_SUL");

async function ink(method: "GET" | "POST", route: string, body?: unknown): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = { Authorization: `Bearer ${method === "GET" ? readToken : writeToken}` };
  if (body !== undefined) Object.assign(headers, { "Content-Type": "application/json", "Idempotency-Key": "categoria-sobrenomes-v1" });
  const res = await fetch(INK_API_BASE_URL + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${route.split("?")[0]} → ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

type Product = { id: number; name: string; tags?: string[] | null; created_at?: string | null };
const personalized = (p: Product) => !!p.tags?.includes("personalizado") && p.tags.some((t) => t.startsWith("personalizado-"));

const found: Product[] = [];
for (let page = 1; ; page++) {
  const data = await ink("GET", `/v1/stores/products?visible_in_store=false&begin_date=${SINCE}&per_page=100&page=${page}`);
  found.push(...((data.products as Product[]) ?? []).filter(personalized));
  if (page >= Number(data.total_pages ?? 1)) break;
}

const collections: { id: number; name: string }[] = [];
for (let page = 1; ; page++) {
  const data = await ink("GET", `/v1/stores/collections?per_page=100&page=${page}`);
  collections.push(...((data.collections as { id: number; name: string }[]) ?? []));
  if (page >= Number(data.total_pages ?? 1)) break;
}
const existing = collections.find((c) => c.name.trim().toLowerCase() === NAME.toLowerCase());

console.log(`${found.length} produto(s) personalizado(s) desde ${SINCE}:`);
for (const p of found) console.log(`  ${p.id}  ${p.name}  [${p.tags?.join(", ")}]  ${p.created_at ?? ""}`);
if (existing) {
  console.log(`\nA categoria "${existing.name}" já existe: id ${existing.id}. Nada criado.`);
  process.exit(0);
}
if (found.length > 100) throw new Error("mais de 100 produtos: a INK aceita no máximo 100 ids na criação");
if (!create) {
  console.log(`\nSimulação: rode com --criar para criar "${NAME}" (oculta) com esses ${found.length} produto(s).`);
  process.exit(0);
}
if (!writeToken) throw new Error("sem INK_WRITE_TOKEN_SUL");
const made = await ink("POST", "/v1/stores/collections", { name: NAME, is_available: false, product_ids: found.map((p) => p.id) });
const collection = made.collection as { id: number; name: string; is_available: boolean };
console.log(`\nCriada: id ${collection.id}, "${collection.name}", is_available=${collection.is_available}, ${found.length} produto(s).`);

// Read-only inventory of the INK collections ("categorias") of ONE store page (docs/admin/ink-collections-inventory.md).
//
//   node --env-file=.env.local --import tsx scripts/inventory-ink-collections.mts <sul|norte|centro> <page> <perPage> <outFile>
//
// Guard rails: exactly ONE GET per invocation (no retry, no backoff loop: a failure is reported, not repeated); the body is
// read as a stream and aborted past MAX_BYTES; the token is only ever sent in the Authorization header and never printed. What is
// written to <outFile> is an AGGREGATE (id, name, slug, position, availability, reported id count, and how many of those ids exist
// in the local catalog snapshot of the same store) — the raw `product_ids` arrays are NOT persisted. Matched ids are kept because
// they are bounded by the snapshot and are what a sync would need.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [storeArg, pageArg = "1", perPageArg = "100", outFile] = process.argv.slice(2);
const STORES = { sul: ["use-sul", "INK_TOKEN_SUL"], norte: ["use-norte", "INK_TOKEN_NORTE"], centro: ["use-centro", "INK_TOKEN_CENTRO"] } as const;
if (!(storeArg in STORES) || !outFile) throw new Error("usage: inventory-ink-collections.mts <sul|norte|centro> <page> <perPage> <outFile>");
const [storeKey, tokenEnv] = STORES[storeArg as keyof typeof STORES];
const token = process.env[tokenEnv];
if (!token) throw new Error(`${tokenEnv} is not set`);
const base = process.env.INK_API_BASE_URL || "https://api.reserva.ink";
const MAX_BYTES = 80 * 1024 * 1024;
const TIMEOUT_MS = 180_000;

const snapshotDir = process.env.CATALOG_SNAPSHOT_DIR ?? path.join(process.cwd(), "data", "generated");
const snap = JSON.parse(readFileSync(path.join(snapshotDir, "catalog-snapshot.json"), "utf8")).stores[storeKey] as {
  syncedAt: string; bindings: { inkProductId: string }[]; merch: { inkProductId: string }[];
};
const bindingIds = new Set(snap.bindings.map((b) => b.inkProductId));
const merchIds = new Set(snap.merch.map((m) => m.inkProductId));

const url = `${base}/v1/stores/collections?per_page=${Number(perPageArg)}&page=${Number(pageArg)}`;
const started = Date.now();
const ctrl = new AbortController();
const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal });
console.log(`${storeArg} page=${pageArg} per_page=${perPageArg} -> HTTP ${res.status}, content-length=${res.headers.get("content-length") ?? "(chunked)"}`);
if (!res.ok) { console.log("not OK; stopping (no retry)."); process.exit(2); }
const chunks: Uint8Array[] = [];
let bytes = 0;
for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
  bytes += chunk.length;
  if (bytes > MAX_BYTES) { ctrl.abort(); console.log(`ABORTED: body exceeded ${MAX_BYTES} bytes`); process.exit(3); }
  chunks.push(chunk);
}
clearTimeout(timer);
const fetchMs = Date.now() - started;
const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { collections: Record<string, unknown>[]; page: number; per_page: number; total_pages: number; total_count: number };
console.log(`body ${(bytes / 1048576).toFixed(2)} MiB in ${fetchMs} ms; meta page=${parsed.page} per_page=${parsed.per_page} total_pages=${parsed.total_pages} total_count=${parsed.total_count}; items=${parsed.collections.length}`);

const rows = parsed.collections.map((c) => {
  const ids = (Array.isArray(c.product_ids) ? c.product_ids : []).map(String);
  const matchedBindings = ids.filter((i) => bindingIds.has(i));
  const matchedMerch = ids.filter((i) => merchIds.has(i));
  return {
    id: c.id, name: c.name, slug: c.slug, position: c.position, isAvailable: c.is_available,
    reportedProductIds: ids.length, reportedKitIds: Array.isArray(c.kit_ids) ? c.kit_ids.length : 0,
    matchedBindings: matchedBindings.length, matchedMerch: matchedMerch.length,
    matchedMerchIds: matchedMerch, // bounded by the snapshot's merch (≤ a few hundred)
    matchedBindingIds: matchedBindings.length <= 200 ? matchedBindings : undefined, // only small ones are kept whole
  };
});
writeFileSync(outFile, JSON.stringify({ store: storeKey, snapshotSyncedAt: snap.syncedAt, requestedUrlPath: `/v1/stores/collections?per_page=${perPageArg}&page=${pageArg}`, http: res.status, bytes, fetchMs, meta: { page: parsed.page, per_page: parsed.per_page, total_pages: parsed.total_pages, total_count: parsed.total_count }, rows }, null, 1));
console.log(`wrote ${rows.length} rows to ${outFile}`);

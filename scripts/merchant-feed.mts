// MANUAL run of the Google Merchant feed (src/lib/merchant, docs/google-merchant-feed.md) into <snapshot dir>/loja-unica/ (or --dir).
//
//   npm run merchant:feed                      # judge new covers + regenerate the feed from INK's export
//   npm run merchant:feed -- --ler             # first read the single store's products (GET only, ~180 pages at 1.5 s) for the source
//   npm run merchant:feed -- --dir=/tmp/x      # another folder (it needs catalog-snapshot.json of the single store for the labels)
//
// Needs INK_GOOGLE_FEED_URL (INK's "google_tsv_store_feed" export) and, with --ler, INK_TOKEN_SUL. Prints the report.
import path from "node:path";
import { singleStoreDataDir } from "../src/lib/catalog/commerce-mode";
import { LOJA_UNICA } from "../src/lib/catalog/unificado/loja-unica";
import { fetchStoreProducts } from "../src/lib/ink/client";
import { writeMerchantSource } from "../src/lib/merchant/files";
import { generateMerchantFeed, updateCoverColors } from "../src/lib/merchant/generate";
import { reduceMerchantSource, type MerchantSourceProduct } from "../src/lib/merchant/source";

const args = process.argv.slice(2);
const dirArg = args.find((a) => a.startsWith("--dir="))?.slice("--dir=".length);
const dir = dirArg ? path.resolve(dirArg) : singleStoreDataDir();

if (args.includes("--ler")) {
  const products: MerchantSourceProduct[] = [];
  const syncedAt = new Date().toISOString();
  const { requests } = await fetchStoreProducts(
    LOJA_UNICA,
    ({ page, totalPages }) => page % 20 === 0 && console.log(`  página ${page}/${totalPages}`),
    undefined,
    (raw) => {
      const p = reduceMerchantSource(raw);
      if (p) products.push(p);
    },
  );
  await writeMerchantSource(dir, { version: 1, syncedAt, products });
  console.log(`fonte: ${products.length} produtos (${requests} GETs) → ${dir}`);
}

const covers = await updateCoverColors({ dir });
console.log(`capas: ${covers.judged} julgadas, ${covers.failed} falharam, ${covers.cached} no cache`);
const feed = await generateMerchantFeed({ dir });
if (!feed.ok) {
  console.error(`feed: FALHOU — ${feed.error}`);
  process.exit(1);
}
console.log(JSON.stringify(feed.report, null, 2));

import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CoverColorVerdict } from "./cover-color";
import type { FeedStats } from "./feed";
import type { MerchantSourceFile } from "./source";

/** Everything the Google Merchant feed keeps lives next to the single store's catalog (<snapshot dir>/loja-unica/), on the Volume. */
export const MERCHANT_SOURCE_FILE = "merchant-source.json";
export const COVER_COLORS_FILE = "merchant-cover-colors.json";
export const FEED_FILE = "google-merchant.tsv";
export const FEED_REPORT_FILE = "google-merchant.json";

/** Cover verdicts by image URL. `key` names the candidate colors it was judged against: a product that gains a color is judged again. */
export type CoverColorsFile = { version: 1; entries: Record<string, { key: string; verdict: CoverColorVerdict | null; at: string }> };

export type FeedReport = { generatedAt: string; inkFeedRows: number; sourceSyncedAt: string | null; sourceProducts: number; stats: FeedStats };

export async function writeAtomic(file: string, content: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, content);
  await rename(tmp, file);
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

export const writeMerchantSource = (dir: string, source: MerchantSourceFile) => writeAtomic(path.join(dir, MERCHANT_SOURCE_FILE), JSON.stringify(source));
export const readMerchantSource = (dir: string) => readJson<MerchantSourceFile>(path.join(dir, MERCHANT_SOURCE_FILE));
export const readCoverColors = async (dir: string): Promise<CoverColorsFile> => (await readJson<CoverColorsFile>(path.join(dir, COVER_COLORS_FILE))) ?? { version: 1, entries: {} };
export const writeCoverColors = (dir: string, file: CoverColorsFile) => writeAtomic(path.join(dir, COVER_COLORS_FILE), JSON.stringify(file));
export const readFeedReport = (dir: string) => readJson<FeedReport>(path.join(dir, FEED_REPORT_FILE));

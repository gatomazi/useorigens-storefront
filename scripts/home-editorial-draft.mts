// The two home themes of the Sul region (CLAUDE_REFINAMENTO_HOME_MENU_USE_ORIGENS) as a DRAFT of the LOCAL CMS sandbox (`data/admin-dev`, gitignored):
// the "editorial" theme in use, built exactly as the panel builds it (Aparência → Tema da home → Usar o tema Editorial), and the "original" one kept
// with its own sections. Review with `npm run cms:dev`, publish there (Publicar), and see either theme at /admin/preview?tema=original|editorial.
//
//   npx tsx scripts/home-editorial-draft.mts                          # from the live release of the sandbox
//   npx tsx scripts/home-editorial-draft.mts --original-from 1        # the original sections taken from release 1 (a sandbox that published an older preview)
//
// Nothing here reaches production: the files live in the local sandbox only, and production changes only from the real panel. Every value is a real one:
// collections of the synced snapshot (by slug), banners already in /public, the hero's own featured products. Coupons, tracking and everything that is
// not the home stay as they are live.
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { applyOp } from "../src/lib/admin/draft-ops";
import { EDITORIAL_COLLECTION_SLUGS, type EditorialCollections } from "../src/lib/site-config/home-themes";
import { validateScopeDoc, type ScopeDoc } from "../src/lib/site-config/schema";

const dir = path.join(process.cwd(), "data", "admin-dev");
const draftFile = (scope: string) => path.join(dir, "drafts", `${scope}.json`);
type DraftRecord = { scope: string; rev: number; updatedAt: string; baseReleaseId: string | number | null; doc: ScopeDoc };
type Bundle = { releaseId: string | number; docs: Record<string, ScopeDoc> };

const readJson = async <T,>(file: string): Promise<T | null> => {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
};
const release = (id: string) => readJson<Bundle>(path.join(dir, "published", "releases", `${id}.json`));
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

// The LIVE release (the ledger's head), never a published.json copied from elsewhere.
const ledger = await readJson<{ headId: string | null }>(path.join(dir, "ledger.json"));
const live = ledger?.headId ? await release(ledger.headId) : null;
if (!live) throw new Error("no live release in the local sandbox: run the panel once (npm run cms:dev) and publish");

/** The region's real collections the editorial theme is built on: by slug in the Sul store's synced snapshot, available ones with products only. */
async function collections(): Promise<EditorialCollections> {
  type Snapshot = { stores: Record<string, { collections: { id: number; slug: string; isAvailable: boolean; matchedCount: number }[] }> };
  const snapshot = await readJson<Snapshot>(path.join(process.cwd(), "data", "generated", "collections-snapshot.json"));
  const records = snapshot?.stores["use-sul"]?.collections ?? [];
  const out: EditorialCollections = {};
  for (const [key, slug] of Object.entries(EDITORIAL_COLLECTION_SLUGS) as [keyof EditorialCollections, string][]) {
    const r = records.find((c) => c.slug === slug && c.isAvailable && c.matchedCount >= 3);
    if (r) out[key] = { store: "use-sul", collectionId: r.id };
  }
  return out;
}

async function sulDraft(): Promise<DraftRecord> {
  const current = (await readJson<DraftRecord>(draftFile("sul"))) ?? { scope: "sul", rev: 0, updatedAt: "", baseReleaseId: live!.releaseId, doc: live!.docs.sul };
  let doc = structuredClone(live!.docs.sul);
  const from = arg("--original-from");
  if (from) {
    // The original theme as it was in that release: its sections, and its own palette and strip (the editorial theme brings its own).
    const old = (await release(from))?.docs.sul;
    if (!old?.home) throw new Error(`release ${from} has no Sul home`);
    doc = { ...doc, home: old.home, theme: old.theme, topBar: old.topBar };
    if (!old.theme) delete doc.theme;
    if (!old.topBar) delete doc.topBar;
    delete doc.homeTheme;
    delete doc.homeThemes;
  }
  // Exactly what "Usar o tema Editorial" does in the panel: the original sections kept, the editorial ones built from them.
  const r = applyOp(doc, { type: "set-home-theme", theme: "editorial", collections: await collections() }, { newId: () => randomBytes(4).toString("hex") });
  if (!r.ok) throw new Error(r.errors.join("; "));
  return { ...current, rev: current.rev + 1, updatedAt: new Date().toISOString(), baseReleaseId: live!.releaseId, doc: r.doc };
}

async function globalDraft(): Promise<DraftRecord> {
  const current = (await readJson<DraftRecord>(draftFile("global"))) ?? { scope: "global", rev: 0, updatedAt: "", baseReleaseId: live!.releaseId, doc: live!.docs.global };
  const doc = structuredClone(live!.docs.global);
  // Every product card of the store: the price and "Ver produto →" together at the foot (Aparência → Botão nos cards).
  doc.cards = { buyLabel: "Ver produto", buyStyle: "link" };
  return { ...current, rev: current.rev + 1, updatedAt: new Date().toISOString(), baseReleaseId: live!.releaseId, doc };
}

for (const record of [await sulDraft(), await globalDraft()]) {
  const check = validateScopeDoc(record.doc);
  if (!check.ok) throw new Error(`${record.scope}: ${check.errors.join("; ")}`);
  await writeFile(draftFile(record.scope), JSON.stringify(record, null, 2));
  console.log(`draft ${record.scope} rev ${record.rev}: ok${record.doc.homeTheme ? ` (tema ${record.doc.homeTheme}; guardado: ${Object.keys(record.doc.homeThemes ?? {}).join(", ")})` : ""}`);
}

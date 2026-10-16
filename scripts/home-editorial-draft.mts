// The editorial home of the Sul region (CLAUDE_REFINAMENTO_HOME_MENU_USE_ORIGENS) as a DRAFT of the LOCAL CMS sandbox (`data/admin-dev`, gitignored),
// so the composition can be reviewed with `npm run cms:dev` and published there (Publicar), exactly like an owner would do it in the panel.
//
//   npx tsx scripts/home-editorial-draft.mts            # writes data/admin-dev/drafts/{sul,global}.json
//
// Nothing here reaches production: the files live in the local sandbox only, and production is changed only from the real panel. Every value is a
// real one of the project: collections of the synced snapshot, banners already in /public, the hero's own featured products. The previous home
// sections are kept INACTIVE (not deleted), so the owner can bring any of them back.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateScopeDoc, type ScopeDoc, type Section, type Appearance } from "../src/lib/site-config/schema";

const dir = path.join(process.cwd(), "data", "admin-dev");
const draftFile = (scope: string) => path.join(dir, "drafts", `${scope}.json`);
type DraftRecord = { scope: string; rev: number; updatedAt: string; baseReleaseId: string | number | null; doc: ScopeDoc };

const readJson = async <T,>(file: string): Promise<T | null> => {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
};

// The LIVE release of the sandbox (the ledger's head), never a published.json copied from elsewhere: tracking, coupons and everything that is not
// the home stay exactly as they are live.
const ledger = await readJson<{ headId: string | null }>(path.join(dir, "ledger.json"));
const published = ledger?.headId ? await readJson<{ releaseId: string | number; docs: Record<string, ScopeDoc> }>(path.join(dir, "published", "releases", `${ledger.headId}.json`)) : null;
if (!published) throw new Error("no live release in the local sandbox: run the panel once (npm run cms:dev) and publish");

const plain = (fill: Appearance["fill"] = { kind: "none" }): Appearance => ({ fill, focal: { mobile: { x: 50, y: 50 }, desktop: { x: 50, y: 50 } }, overlay: { preset: "none" } });
const SUL = "use-sul" as const;
const COLLECTION = { terra: 152188, fala: 152079, jeito: 152187, feito: 152191, seuLugar: 152078, novidades: 153383 } as const;
const WARM = "#f3eee4"; // a warm light ground for the bands between the grey of the photos (theme stays as it is)

async function sulDraft(): Promise<DraftRecord> {
  const current = (await readJson<DraftRecord>(draftFile("sul"))) ?? { scope: "sul", rev: 0, updatedAt: "", baseReleaseId: published!.releaseId, doc: published!.docs.sul };
  // From what is PUBLISHED (an older draft may lack the coupons, the tracking or anything else edited since): only the home and the menu change.
  const doc = structuredClone(published!.docs.sul);
  // Idempotent: the sections this script adds are rebuilt, never duplicated, when the live release already has them.
  const OWN = new Set(["editorial-colecoes", "editorial-selecao"]);
  const old = doc.home!.sections.filter((s) => !OWN.has(s.id));
  const find = (template: Section["template"]) => old.find((s) => s.template === template);
  const hero = find("hero")!;
  const states = find("states")!;
  const styles = find("city-styles")!;
  const campaign = find("campaign")!;
  const footer = find("footer")!;

  const sections: Section[] = [
    {
      ...hero,
      variant: "feature",
      title: "A gente leva\na origem no peito.",
      subtitle: "Sua cidade, suas histórias, seu jeito de falar. Busque a sua e vista o que te representa.",
      appearance: {
        fill: { kind: "none" },
        image: { mobile: { assetId: "legacy:sul/hero-mobile", alt: "", decorative: true }, desktop: { assetId: "legacy:sul/hero-desktop", alt: "", decorative: true } },
        focal: { mobile: { x: 50, y: 50 }, desktop: { x: 50, y: 50 } },
        overlay: { preset: "regional-wash" },
      },
    },
    { ...states, active: true, variant: "strip", title: "Comece pelo seu estado", subtitle: undefined, appearance: plain({ kind: "solid", color: WARM }) },
    {
      ...styles,
      active: true,
      variant: "split",
      count: 3,
      title: "Sua cidade, do seu jeito.",
      subtitle: "O mapa, o nome ou as coordenadas. O exemplo aqui é {city}; ao abrir a sua, você vê só os estilos que existem para ela.",
      appearance: plain(),
    },
    {
      id: "editorial-colecoes",
      anchor: "colecoes",
      headingId: "colecoes-title",
      template: "image-grid",
      active: true,
      title: "Tem coisa que é só nossa.",
      subtitle: "Reconhecer, dar risada, sentir saudade: escolha o que faz sentido pra você.",
      grid: { columns: 3, aspect: "portrait", labels: "below" },
      tiles: [
        { label: "Da Nossa Terra", caption: "O estado inteiro numa camiseta, não só uma cidade.", format: "product", color: "#dfe3d3", cta: "Ver coleção", dest: { kind: "collection-page", store: SUL, collectionId: COLLECTION.terra } },
        {
          label: "Fala Daqui",
          caption: "Expressões dos três estados, sempre com o lugar de onde vêm.",
          format: "banner",
          // The card is a portrait from 768px and a wide band on phones: the square crop for the card, the wide one for the phone.
          image: { assetId: "legacy:sul/fala-daqui-mobile", alt: "", decorative: true },
          imageMobile: { assetId: "legacy:sul/fala-daqui-desktop", alt: "", decorative: true },
          focal: { mobile: { x: 60, y: 45 }, desktop: { x: 60, y: 40 } },
          tone: "light",
          cta: "Ver coleção",
          dest: { kind: "collection-page", store: SUL, collectionId: COLLECTION.fala },
        },
        { label: "Do Nosso Jeito", caption: "Obras, referências e ícones com sotaque local.", format: "product", color: "#e8c9a9", cta: "Ver coleção", dest: { kind: "collection-page", store: SUL, collectionId: COLLECTION.jeito } },
      ],
      appearance: plain({ kind: "solid", color: WARM }),
    },
    {
      ...campaign,
      active: true,
      variant: "split",
      title: "Você conhece a referência. O sotaque é nosso.",
      subtitle: "Um pouco de arte, um pouco de humor e muito do lugar de onde a gente vem.",
      cta: { label: "Conhecer as releituras", dest: { kind: "collection-page", store: SUL, collectionId: COLLECTION.jeito } },
      fallback: "fill",
      appearance: plain({ kind: "solid", color: "token:region-primary" }),
    },
    {
      id: "editorial-selecao",
      anchor: "selecao",
      headingId: "selecao-title",
      template: "product-carousel",
      active: true,
      title: "Qual delas é a sua cara?",
      subtitle: "As estampas que acabaram de chegar à loja.",
      source: { kind: "ink-category", store: SUL, collectionId: COLLECTION.novidades, order: "category", limit: 4 },
      layout: { variant: "standard", tone: "light", surface: "plain", display: "grid" },
      analyticsSource: "homeCollection",
      cta: { label: "Ver novidades", dest: { kind: "collection-page", store: SUL, collectionId: COLLECTION.novidades } },
      appearance: plain(),
    },
    // The previous showcases stay in the draft, switched off: one click in the panel brings any of them back.
    ...old.filter((s) => s.template === "product-carousel").map((s) => ({ ...s, active: false })),
    footer,
  ];
  for (const s of sections) if (s.subtitle === undefined) delete s.subtitle;
  doc.home = { ...doc.home!, sections };
  // The menu's hypothesis (Sua cidade · Estados · Coleções · Novidades · Canecas): the in-page "Estilos" link steps out of the bar (Navegação → links).
  doc.navigation = {
    ...(doc.navigation ?? {}),
    categoriesBlock: { label: "Coleções", visible: true, order: 15 },
    // Phone menu in the same order as the bar: the states (UF, name, number of places) before the collections; the home's own "Estados" anchor
    // link would repeat them, so it steps out too.
    statesBlock: { label: "Estados do Sul", visible: true, order: 12 },
    primaryLinks: [
      { id: "nav-styles", label: "Estilos", destination: "styles", visible: false, order: 10 },
      { id: "nav-states", label: "Estados", destination: "states", visible: false, order: 20 },
    ],
  };
  const ref = (collectionId: number) => ({ store: SUL, collectionId });
  doc.collections = {
    ...(doc.collections ?? { enabled: [] }),
    menu: { top: [ref(COLLECTION.novidades)], hidden: [], added: [] },
    descriptions: [
      { ...ref(COLLECTION.novidades), text: "As estampas que acabaram de chegar" },
      { ...ref(COLLECTION.seuLugar), text: "Sua cidade no mapa, no nome e nas coordenadas" },
      { ...ref(COLLECTION.terra), text: "O estado inteiro numa camiseta" },
      { ...ref(COLLECTION.fala), text: "Expressões dos três estados" },
      { ...ref(COLLECTION.jeito), text: "Obras e ícones com sotaque local" },
      { ...ref(COLLECTION.feito), text: "A combinação com a cara de quem vai vestir" },
    ],
  };
  return { ...current, rev: current.rev + 1, updatedAt: new Date().toISOString(), baseReleaseId: published!.releaseId, doc };
}

async function globalDraft(): Promise<DraftRecord> {
  const current = (await readJson<DraftRecord>(draftFile("global"))) ?? { scope: "global", rev: 0, updatedAt: "", baseReleaseId: published!.releaseId, doc: published!.docs.global };
  const doc = structuredClone(published!.docs.global);
  // Every product card of the store: the price and "Ver produto →" together at the foot (Aparência → Botão nos cards).
  doc.cards = { buyLabel: "Ver produto", buyStyle: "link" };
  return { ...current, rev: current.rev + 1, updatedAt: new Date().toISOString(), doc };
}

for (const record of [await sulDraft(), await globalDraft()]) {
  const check = validateScopeDoc(record.doc);
  if (!check.ok) throw new Error(`${record.scope}: ${check.errors.join("; ")}`);
  await writeFile(draftFile(record.scope), JSON.stringify(record, null, 2));
  console.log(`draft ${record.scope} rev ${record.rev}: ok`);
}

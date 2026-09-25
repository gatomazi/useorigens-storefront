/**
 * The immutable seed: the current Sul home expressed as CMS configuration (docs/admin/cms-v1-plan.md §7).
 *
 * It is derived from the SAME sources the live code uses (`REGION_BANNERS`, `REAL_COLLECTIONS`, the section copy that is
 * hard-coded in the home components) instead of being retyped, and `tests/e2e`-style equivalence checks (see
 * scripts/verify-home-equivalence.mts) compare what it renders against the current page. It is also the storefront's fallback
 * whenever no published configuration exists.
 *
 * Pure and deterministic (no I/O, no clock): the same input always yields the same bundle, so it can be checksummed.
 */
import { REGION_BANNERS, type BannerAsset } from "../editorial/banners";
import { REAL_COLLECTIONS } from "../editorial/collections";
import type { Appearance, MediaAssetInfo, Point, PublishedBundle, ScopeDoc, Section, TrackingConfig, VendorSetting } from "./schema";

export const SEED_RELEASE_ID = "seed-1";

function focalPoint(css: string | undefined): Point {
  if (!css) return { x: 50, y: 50 }; // BannerBackground's own default ("50% 50%")
  const [x, y] = css.split(" ").map((p) => Number.parseFloat(p));
  return { x, y };
}

const assetId = (src: string): string => `legacy:${src.replace(/^\/banners\//, "").replace(/\.[a-z]+$/i, "")}`;

type Collected = Record<string, MediaAssetInfo>;

function photoAppearance(asset: BannerAsset, media: Collected, overlay: Appearance["overlay"], fill: Appearance["fill"]): Appearance {
  for (const img of [asset.mobile, asset.desktop]) media[assetId(img.src)] = { src: img.src, width: img.width, height: img.height };
  const focal = focalPoint(asset.focal);
  return {
    fill,
    // The photos are decorative on purpose (banners.ts): alt is empty.
    image: {
      mobile: { assetId: assetId(asset.mobile.src), alt: "", decorative: true },
      desktop: { assetId: assetId(asset.desktop.src), alt: "", decorative: true },
    },
    focal: { mobile: focal, desktop: focal },
    overlay,
  };
}

const noImage = (): Appearance => ({ fill: { kind: "none" }, focal: { mobile: { x: 50, y: 50 }, desktop: { x: 50, y: 50 } }, overlay: { preset: "none" } });


/**
 * `env` carries the tracking IDs the site uses today (NEXT_PUBLIC_*): Sul overrides Global with exactly those values, so
 * a bundle built from this seed resolves to the current behaviour. Global starts disabled (D5).
 */
/** `_legacyIds` is accepted for the callers that still pass the build-time IDs, but they are no longer written into the seed (see `legacy`). */
export function buildSeedBundle(_legacyIds?: { metaPixelId: string | null; ga4MeasurementId: string | null }): PublishedBundle {
  const media: Collected = {};
  const banners = REGION_BANNERS.sul;
  const hero = banners.hero.asset;
  const fala = banners.collections["fala-daqui"]?.asset;
  const campaign = banners.campaign.asset;
  if (!hero || !fala || !campaign) throw new Error("seed: the Sul hero, fala-daqui and campaign banners must exist in REGION_BANNERS");

  const sections: Section[] = [
    {
      id: "seed-hero", anchor: "hero", headingId: "hero-title", template: "hero", active: true, locked: true,
      title: "O seu lugar,\ndo seu jeito.",
      subtitle: "Encontre sua cidade e vista o lugar que faz parte de você.",
      appearance: photoAppearance(hero, media, { preset: "regional-wash" }, { kind: "solid", color: "token:ground" }),
    },
    {
      id: "seed-estilos", anchor: "estilos", headingId: "styles-title", template: "city-styles", active: true,
      title: "Sua cidade, de 8 jeitos.",
      // `{city}` is the only placeholder: the showcase city's name.
      subtitle: "Do mapa às coordenadas: escolha a estampa que mais combina com o seu lugar. O exemplo aqui é {city} — ao abrir a sua, você vê só os estilos que existem para ela.",
      appearance: noImage(),
    },
    carousel({
      id: "seed-terra", anchor: "terra", headingId: "terra-title", title: "Da Nossa Terra", subtitle: "O estado inteiro numa camiseta, não só uma cidade.",
      viewAll: REAL_COLLECTIONS.terra, module: "terra", analytics: "homeTerra", surface: "paper", variant: "standard", tone: "light",
    }),
    { id: "seed-estados", anchor: "estados", headingId: "states-title", template: "states", active: true, title: "Escolha o seu estado", appearance: noImage() },
    carousel({
      id: "seed-redesenhos", anchor: "redesenhos", headingId: "redesenhos-title", title: "Redesenhos do Sul", subtitle: "Obras, referências e ícones reinterpretados com sotaque local.",
      viewAll: REAL_COLLECTIONS.redesenhos, module: "recreations", analytics: "homeRedesenhos", surface: "paper", variant: "poster", tone: "light",
    }),
    carousel({
      id: "seed-feito-para-voce", anchor: "feito-para-voce", headingId: "feito-para-voce-title", title: "Feito Para Você", subtitle: "Escolha a combinação que mais parece com quem vai vestir.",
      viewAll: REAL_COLLECTIONS.feitoParaVoce, module: "lenda", analytics: "homeFeitoParaVoce", surface: "plain", variant: "standard", tone: "light",
    }),
    carousel({
      id: "seed-fala", anchor: "fala", headingId: "fala-title", title: "Fala daqui", subtitle: "Expressões dos três estados, sempre com o lugar de onde vêm.",
      viewAll: REAL_COLLECTIONS.fala, module: "dizeres", analytics: "homeFala", surface: "region-primary", variant: "standard", tone: "dark",
      appearance: photoAppearance(fala, media, { preset: "regional-wash-primary" }, { kind: "solid", color: "token:region-primary" }),
    }),
    // DDD keeps a plain ground on purpose (docs/decisions/0003) and has no "Ver todos" (no distinct real destination).
    carousel({
      id: "seed-geografia", anchor: "geografia", headingId: "ddd-title", title: "O número de cada região", subtitle: "O DDD e o nome da região, do Paraná ao Rio Grande do Sul.",
      module: "ddd", analytics: "homeDdd", surface: "plain", variant: "standard", tone: "light",
    }),
    {
      id: "seed-origem", anchor: "origem", headingId: "origin-title", template: "campaign", active: true, fallback: "crops",
      title: "Nome, número e jeito de falar: cada cidade do Sul tem os seus.",
      subtitle: "O nome da cidade, o mapa, o DDD, a expressão de cada canto. A gente põe isso na camiseta.",
      appearance: photoAppearance(campaign, media, { preset: "regional-wash-dark" }, { kind: "solid", color: "token:near-black" }),
    },
    { id: "seed-footer", anchor: "footer", headingId: "footer-title", template: "footer", active: true, locked: true, appearance: noImage() },
  ];

  const tracking = (meta: VendorSetting, ga4: VendorSetting): TrackingConfig => ({ meta, ga4 });
  const doc = (scope: ScopeDoc["scope"], t: TrackingConfig, home?: ScopeDoc["home"]): ScopeDoc => ({ schemaVersion: 1, scope, tracking: t, ...(home ? { home } : {}) });
  return {
    schemaVersion: 1,
    releaseId: SEED_RELEASE_ID,
    docs: {
      global: doc("global", tracking({ mode: "disabled" }, { mode: "disabled" })),
      // Sul keeps the tracking it had before the CMS: the build-time NEXT_PUBLIC_* IDs, read at runtime ("legacy"), until an explicit configuration
      // is published. The IDs are deliberately NOT copied into the document, so nothing here can ever leak them to another region.
      sul: doc("sul", tracking({ mode: "legacy" }, { mode: "legacy" }), { sections }),
      // Prepared, not launched: no home yet (it is created in the admin from the region's own INK collections) and NO tracking: they never
      // inherit Sul's IDs, and they only follow the global IDs after someone explicitly chooses "inherit" for them.
      norte: doc("norte", tracking({ mode: "disabled" }, { mode: "disabled" })),
      "centro-oeste": doc("centro-oeste", tracking({ mode: "disabled" }, { mode: "disabled" })),
    },
    media,
  };
}

function carousel(o: {
  id: string; anchor: string; headingId: string; title: string; subtitle: string; viewAll?: string;
  module: "terra" | "recreations" | "lenda" | "dizeres" | "ddd"; analytics: "homeTerra" | "homeRedesenhos" | "homeFeitoParaVoce" | "homeFala" | "homeDdd";
  surface: "paper" | "plain" | "region-primary"; variant: "standard" | "poster"; tone: "light" | "dark"; appearance?: Appearance;
}): Section {
  return {
    id: o.id, anchor: o.anchor, headingId: o.headingId, template: "product-carousel", active: true,
    title: o.title, subtitle: o.subtitle,
    ...(o.viewAll ? { cta: { label: "Ver todos", dest: { kind: "external" as const, url: o.viewAll } } } : {}),
    layout: { variant: o.variant, tone: o.tone, surface: o.surface },
    source: { kind: "editorial-module", key: o.module },
    analyticsSource: o.analytics,
    appearance: o.appearance ?? noImage(),
  };
}

import { describe, expect, test, vi } from "vitest";

// Production: the single store is on, so Norte can follow Sul.
vi.mock("@/lib/site-config/published", async (original) => ({ ...(await original<typeof import("@/lib/site-config/published")>()), canFollowSul: () => true }));

import { defaultAppearance } from "@/lib/admin/draft-ops";
import { composeBundle, preflight, seedForEnv } from "@/lib/admin/publishing";
import type { Section } from "@/lib/site-config/schema";

const headless = { releases: { head: async () => null } as never, media: async () => ({}) };
/** Norte's own home as it is in production before following: a section still on the old regional store's collection, which no longer resolves. */
function norteWithStaleHome() {
  const norte = structuredClone(seedForEnv().docs.norte);
  const stale: Section = { id: "custom-antiga", anchor: "antiga", headingId: "antiga-title", template: "product-carousel", active: true, title: "Vitrine antiga", analyticsSource: "homeCollection", layout: { variant: "poster", tone: "light", surface: "plain" }, source: { kind: "ink-category", store: "use-norte", collectionId: 123456, limit: 6, order: "category" }, appearance: defaultAppearance() };
  const sul = seedForEnv().docs.sul.home!.sections;
  norte.home = { sections: [structuredClone(sul[0]), stale, structuredClone(sul.at(-1)!)] };
  return norte;
}

describe("Seguir a Sul na publicação da região", () => {
  test("a home própria guardada não bloqueia a publicação de quem segue a home da Sul", async () => {
    const own = await preflight(headless, norteWithStaleHome());
    expect(own.join(" ")).toContain("Vitrine antiga");
    const following = { ...norteWithStaleHome(), follow: ["home" as const] };
    expect(await preflight(headless, following)).toEqual([]);
  });

  test("uma imagem enviada para o Norte sobre uma seção da Sul entra na tabela de mídia publicada", async () => {
    const asked: string[] = [];
    const deps = { releases: { head: async () => null } as never, media: async (ids: Iterable<string>) => { const list = [...ids]; asked.push(...list); return Object.fromEntries(list.filter((id) => id.startsWith("01J")).map((id) => [id, { src: `/media/${id}.webp`, width: 1200, height: 1500 }])); } };
    const norte = { ...structuredClone(seedForEnv().docs.norte), follow: ["home" as const], regional: [{ sectionId: "seed-hero", appearance: { image: { mobile: { assetId: "01JNORTEBANNER", alt: "Belém", decorative: false } }, focal: { mobile: { x: 50, y: 50 }, desktop: { x: 50, y: 50 } } } }] };
    const bundle = await composeBundle(deps, norte, "r-test");
    expect(asked).toContain("01JNORTEBANNER");
    expect(bundle.media["01JNORTEBANNER"]).toMatchObject({ src: "/media/01JNORTEBANNER.webp" });
  });
});

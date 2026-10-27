import type { Customizer, StudioArt, StudioArtVersion } from "../site-config/schema";

/** What the customer picked on a studio-based page: an art, one of its versions and whether the previewed shirt is light (it then gets the light-shirt base). */
export type ArtPick = { art: number; version: number; light: boolean };
export type ArtChoice = { art: StudioArt; version: StudioArtVersion; light: boolean; templateId: string };

/** Arts of one family order (the same surname on several arts or versions, e.g. Adulto and Infantil). */
export const MAX_FAMILY_ARTS = 4;

/** Every base a model can render, dark and light. */
export const studioTemplateIds = (m: Pick<Customizer, "studioArts">): string[] => (m.studioArts ?? []).flatMap((a) => a.versions.flatMap((v) => [v.templateId, ...(v.lightTemplateId ? [v.lightTemplateId] : [])]));

/** The base to draw for a pick; a light-shirt preference falls back to the dark base when the version has no light one. */
export function choiceOf(arts: StudioArt[], pick: ArtPick): ArtChoice | null {
  const art = arts[pick.art];
  const version = art?.versions[pick.version];
  if (!version) return null;
  const light = pick.light && Boolean(version.lightTemplateId);
  return { art, version, light, templateId: light ? version.lightTemplateId! : version.templateId };
}

/** The pick that leads to a base of the model, or null when the base is not one of its own. */
export function choiceOfTemplate(model: Pick<Customizer, "studioArts">, templateId: string): ArtChoice | null {
  const arts = model.studioArts ?? [];
  for (const [a, art] of arts.entries()) for (const [v, version] of art.versions.entries()) {
    if (version.templateId === templateId) return choiceOf(arts, { art: a, version: v, light: false });
    if (version.lightTemplateId === templateId) return choiceOf(arts, { art: a, version: v, light: true });
  }
  return null;
}

/** True when the page lets the customer pick between arts or versions (the shirt colour is only for viewing and is not part of the choice). */
export const offersChoice = (model: Pick<Customizer, "studioArts">): boolean => (model.studioArts ?? []).flatMap((a) => a.versions).length > 1;

/** "Eu vim pela ceia · Infantil": the art and, when it has several, the version. The shirt colour is left out: each colour gets its matching art. */
export function choiceLabel(choice: ArtChoice): string {
  return [choice.art.label, choice.art.versions.length > 1 ? choice.version.label : undefined].filter(Boolean).join(" · ");
}

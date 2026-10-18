/**
 * The recommended size of each picture the panel accepts, shown under its field. Measured on the store as it renders (phone 390px, desktop 1440 and
 * 1920px), at twice the drawn size so it stays sharp on a retina screen. Pictures are cropped to fill their box (`object-cover`): the ratio is what
 * matters, and the subject should sit away from the edges (the focus point moves it on a section's own picture).
 */
import type { GridLayout, SectionVariant, TemplateKey } from "../site-config/schema";

/** One recommendation, in the panel's words. */
export type SizeHint = { size: string; note?: string };

/** "feature" opening: the product half (390×320 on a phone, 720×637 at 1440px, 960×637 at 1920px); the same file on every width. */
export const HERO_PANEL: SizeHint = { size: "1920×1440 px (4:3)", note: "o corte muda entre celular e desktop: deixe o assunto no centro" };

/**
 * A section's own picture (Aparência), per breakpoint. The "feature" opening and the split campaign draw it in a half of their own; every other section,
 * behind the whole section (full width, as tall as its content: wide on a desktop, tall on a phone).
 */
export function sectionImageSizes(template: TemplateKey, variant?: SectionVariant): { mobile: SizeHint; desktop: SizeHint } {
  if (template === "hero" && variant === "feature") return { mobile: { size: "1200×1000 px (6:5)" }, desktop: HERO_PANEL };
  // The split campaign: a wide band above the text on a phone (358×224), a tall half beside it on a desktop (435×584).
  if (template === "campaign" && variant === "split") return { mobile: { size: "1200×750 px (16:10)" }, desktop: { size: "1200×1600 px (3:4)" } };
  if (template === "campaign") return { mobile: { size: "1200×1500 px (4:5)" }, desktop: { size: "1200×1500 px (4:5)" } };
  if (template === "hero") return { mobile: { size: "1200×1500 px (4:5)" }, desktop: { size: "2400×900 px (8:3)" } };
  return { mobile: { size: "1200×1500 px (4:5)", note: "fica atrás da seção inteira" }, desktop: { size: "2400×1200 px (2:1)", note: "fica atrás da seção inteira" } };
}

/** The cover at the top of a state's card (4:3, about a third of the page wide). */
export const STATE_COVER: SizeHint = { size: "1200×900 px (4:3)" };
/** A card in a product row: the frame of the INK mockups (800×820). */
export const PRODUCT_CARD_IMAGE: SizeHint = { size: "800×820 px", note: "a proporção dos mockups da INK" };
/** An image grid tile, by the grid's shape; a banner tile is a wide 16:10 card on a phone. */
export const GRID_TILE: Record<GridLayout["aspect"], SizeHint> = { square: { size: "1200×1200 px (1:1)" }, portrait: { size: "1200×1500 px (4:5)" }, landscape: { size: "1200×900 px (4:3)" } };
export const GRID_BANNER_MOBILE: SizeHint = { size: "1200×750 px (16:10)" };
/** The model's picture on its personalization page: the INK mockup's frame, drawn large. */
export const CUSTOMIZER_MOCKUP: SizeHint = { size: "1600×1640 px", note: "a proporção dos mockups da INK" };
/** The picture a link shows when shared (WhatsApp, Facebook…). */
export const SHARE_IMAGE: SizeHint = { size: "1200×630 px" };

/** "Tamanho recomendado: 1920×1440 px (4:3); …" */
export const sizeHintText = (hint: SizeHint): string => `Tamanho recomendado: ${hint.size}${hint.note ? `; ${hint.note}` : ""}.`;

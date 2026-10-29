import "server-only";
import { parseProjectFile } from "../print-studio/model";
import { serverPrintStore } from "../print-studio/server";
import { PRINT_ID } from "../print-studio/server-store";
import { brazilCityExists } from "../geo/brazil-cities-server";
import type { PrintProject } from "../print-studio/model";
import { artworkFields, composeArtwork, editableTexts, publicArtworkBase, validateArtworkInput, type ArtworkInput, type RequestArtwork } from "./artwork";

/** The server's check of a customer's art: what the browser checks, plus a city answer against IBGE's list. */
export const checkArtworkInput = (base: PrintProject, templateId: string, input: ArtworkInput) => validateArtworkInput(base, templateId, input, { cityExists: brazilCityExists });

/** A saved template is immutable. Never serve the private gallery or an arbitrary saved art to the storefront. */
export async function loadArtworkBase(id: string) {
  if (!PRINT_ID.test(id)) return null;
  const store = serverPrintStore();
  const metadata = await store.read(id, "metadata.json");
  if (!metadata || JSON.parse(metadata.toString()).kind !== "template") return null;
  const bytes = await store.read(id, "project.json");
  if (!bytes) return null;
  const project = publicArtworkBase(parseProjectFile(bytes.toString()));
  return editableTexts(project).length || artworkFields(project).length ? project : null;
}

export async function loadRequestArtwork(artwork: RequestArtwork | undefined) {
  if (!artwork) return null;
  const base = await loadArtworkBase(artwork.templateId);
  return base ? composeArtwork(base, artwork.layers) : null;
}

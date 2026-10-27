import "server-only";
import { parseProjectFile } from "../print-studio/model";
import { serverPrintStore } from "../print-studio/server";
import { PRINT_ID } from "../print-studio/server-store";
import { composeArtwork, editableTexts, publicArtworkBase, type RequestArtwork } from "./artwork";

/** A saved template is immutable. Never serve the private gallery or an arbitrary saved art to the storefront. */
export async function loadArtworkBase(id: string) {
  if (!PRINT_ID.test(id)) return null;
  const store = serverPrintStore();
  const metadata = await store.read(id, "metadata.json");
  if (!metadata || JSON.parse(metadata.toString()).kind !== "template") return null;
  const bytes = await store.read(id, "project.json");
  if (!bytes) return null;
  const project = publicArtworkBase(parseProjectFile(bytes.toString()));
  return editableTexts(project).length ? project : null;
}

export async function loadRequestArtwork(artwork: RequestArtwork | undefined) {
  if (!artwork) return null;
  const base = await loadArtworkBase(artwork.templateId);
  return base ? composeArtwork(base, artwork.layers) : null;
}

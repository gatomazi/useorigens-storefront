import "server-only";
import { composeBundle, inspectReleases, preflight, type PublishDeps } from "./publishing";
import { platform } from "./platform";
import type { ScopeDoc } from "../site-config/schema";

/** Thin bindings of the publishing functions to the platform selected for this process, for the screens. */
export const publishDeps = (actorId: string | null = null): PublishDeps => {
  const p = platform();
  return { releases: p.releases, files: p.files, media: (ids) => p.media.resolve(ids), actorId };
};
export const listHistory = () => platform().releases.list(50);
export const inspectPublishing = () => inspectReleases(publishDeps());
export const preflightDoc = (doc: ScopeDoc) => preflight(publishDeps(), doc);
export const composeForPreview = (doc: ScopeDoc) => composeBundle(publishDeps(), doc, "preview");

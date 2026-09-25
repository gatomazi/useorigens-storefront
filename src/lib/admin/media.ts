import "server-only";
import { platform } from "./platform";
import { readDevUpload } from "./media/dev-store";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_PIXELS } from "./media/process";
import type { MediaChoice, MediaPurpose, RemoveResult, UploadResult } from "./media/types";

/** The screens' view of the media library: whichever store the platform selected (local sandbox files, or a Railway bucket + Postgres). */
export { MAX_UPLOAD_BYTES, MAX_UPLOAD_PIXELS };
export type { MediaChoice, UploadResult, RemoveResult };

export const listMedia = () => platform().media.list();
export const canUpload = () => platform().media.canUpload;
export const resolveMedia = (assetIds: Iterable<string>, purpose?: MediaPurpose) => platform().media.resolve(assetIds, purpose);
export const saveUpload = (bytes: Buffer, originalName: string, actorId: string | null = null) => platform().media.save(bytes, originalName, actorId);
export const deleteUpload = (assetId: string) => platform().media.remove(assetId);
/** Reads a locally uploaded file for the dev-only route. */
export const readUpload = readDevUpload;

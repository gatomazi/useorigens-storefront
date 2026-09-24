import type { MediaAssetInfo } from "../../site-config/schema";

export type MediaChoice = { assetId: string; label: string; src: string; width: number; height: number; kind: "banner" | "upload" };
export type UploadResult = { ok: true; choice: MediaChoice; duplicate?: boolean } | { ok: false; error: string };
export type RemoveResult = { ok: true } | { ok: false; error: string };

export interface MediaStore {
  /** Whether uploads work here (R2 configured / local sandbox). Choosing existing banners always works. */
  readonly canUpload: boolean;
  list(): Promise<MediaChoice[]>;
  resolve(assetIds: Iterable<string>): Promise<Record<string, MediaAssetInfo>>;
  save(bytes: Buffer, originalName: string, actorId: string | null): Promise<UploadResult>;
  remove(assetId: string): Promise<RemoveResult>;
}

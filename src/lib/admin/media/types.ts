import type { MediaAssetInfo } from "../../site-config/schema";

export type MediaChoice = { assetId: string; label: string; src: string; width: number; height: number; kind: "banner" | "upload" };
export type UploadResult = { ok: true; choice: MediaChoice; duplicate?: boolean } | { ok: false; error: string };
export type RemoveResult = { ok: true } | { ok: false; error: string };

/** `publish`: URLs a public visitor can load (the storefront's own /media route). `preview`: authenticated admin URLs, for drafts and the library. */
export type MediaPurpose = "publish" | "preview";

export interface MediaStore {
  /** Whether uploads work here (R2 configured / local sandbox). Choosing existing banners always works. */
  readonly canUpload: boolean;
  list(): Promise<MediaChoice[]>;
  resolve(assetIds: Iterable<string>, purpose?: MediaPurpose): Promise<Record<string, MediaAssetInfo>>;
  save(bytes: Buffer, originalName: string, actorId: string | null): Promise<UploadResult>;
  remove(assetId: string): Promise<RemoveResult>;
  /** Production only: is this content hash a known upload (authenticated preview route). */
  knows?(sha256: string): Promise<boolean>;
  /** Production only: the bytes of one object of the private bucket. */
  read?(key: string): Promise<{ body: Buffer; contentType: string } | null>;
}

import "server-only";
import type { MediaAssetInfo } from "../../site-config/schema";
import { adminMediaUrl, publicMediaUrl } from "../../site-config/media-hosts";
import type { Db } from "../db/db";
import { ulid } from "../ids";
import { listBanners, resolveBanners } from "./banners";
import { processImage, safeLabel } from "./process";
import type { ObjectStore } from "./s3";
import type { MediaChoice, MediaPurpose, MediaStore } from "./types";

/**
 * Production media: processed WebP variants in a PRIVATE Railway Storage Bucket (`media/<sha256>/<width>.webp`, immutable and
 * content-addressed), metadata in Postgres (`media_asset`). The bucket is never public: published images are served by the storefront's own
 * `/media/...` route (only objects listed in the published manifest), and drafts by the authenticated `/admin/media/...` route. Only
 * processed output is ever stored: the uploaded original is discarded (privacy: no EXIF/GPS survives, no untrusted bytes are ever served).
 *
 * Retention: objects are NEVER deleted by the application. "Removing" an asset only hides it from the library (soft delete), and only
 * when no release (live or restorable) and no draft references it, so a rollback can never point at a missing file. Reclaiming storage
 * is a deliberate, manual operation (docs/admin/production-runbook.md).
 */
type Row = { id: string; label: string | null; width: number; height: number; variants: { w: number; key: string }[] };

export function bucketMediaStore(deps: { db: Db; objects: ObjectStore | null }): MediaStore {
  const { db, objects } = deps;
  const thumb = (row: Row) => (row.variants.find((v) => v.w >= 640) ?? row.variants.at(-1)!).key;
  // Library thumbnails are shown to signed-in editors only, so they use the authenticated admin route.
  const choiceOf = (row: Row): MediaChoice => ({ assetId: `upload:${row.id}`, label: row.label ?? "imagem", src: adminMediaUrl(thumb(row)), width: row.width, height: row.height, kind: "upload" });

  return {
    canUpload: objects !== null,
    async list() {
      const rows = objects
        ? (await db.query<Row>(`select id, label, width, height, variants from media_asset where kind = 'upload' and status = 'ready' and deleted_at is null order by created_at desc limit 500`)).rows
        : [];
      return [...listBanners(), ...rows.map(choiceOf)];
    },
    async resolve(assetIds, purpose: MediaPurpose = "publish") {
      const ids = [...assetIds];
      const out: Record<string, MediaAssetInfo> = resolveBanners(ids);
      const uploads = ids.filter((id) => id.startsWith("upload:")).map((id) => id.slice("upload:".length));
      if (uploads.length > 0 && objects) {
        const url = purpose === "publish" ? publicMediaUrl : adminMediaUrl;
        const rows = await db.query<Row>(`select id, label, width, height, variants from media_asset where id = any($1::text[]) and status = 'ready'`, [uploads]);
        for (const row of rows.rows) {
          const largest = row.variants.at(-1)!;
          out[`upload:${row.id}`] = { src: url(largest.key), width: row.width, height: row.height, variants: row.variants.map((v) => ({ w: v.w, src: url(v.key) })) };
        }
      }
      return out;
    },
    async save(bytes, originalName, actorId) {
      if (!objects) return { ok: false, error: "o envio de imagens não está configurado neste ambiente (Railway Bucket)" };
      const processed = await processImage(bytes);
      if (!processed.ok) return processed;
      const { image } = processed;
      const existing = await db.query<Row>(`select id, label, width, height, variants from media_asset where sha256 = $1 and deleted_at is null`, [image.sha256]);
      if (existing.rows[0]) return { ok: true, choice: choiceOf(existing.rows[0]), duplicate: true };

      const variants = image.variants.map((v) => ({ w: v.w, key: `media/${image.sha256}/${v.w}.webp` }));
      // Objects first (content-addressed and immutable, so a retry or an orphan is harmless); the row only when every one is in place.
      for (const [i, v] of image.variants.entries()) await objects.put(variants[i].key, v.data, { contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" });
      const label = safeLabel(originalName);
      const id = ulid();
      const mime = `image/${image.format}`;
      const master = variants.at(-1)!;
      await db.query(
        `insert into media_asset (id, sha256, kind, original_key, mime, bytes, width, height, avg_luminance, variants, status, label, created_by)
         values ($1, $2, 'upload', $3, $4, $5, $6, $7, $8, $9::jsonb, 'ready', $10, $11)
         on conflict (sha256) do update set deleted_at = null where media_asset.deleted_at is not null`,
        [id, image.sha256, master.key, mime, Math.min(8388608, image.variants.at(-1)!.data.length), image.width, image.height, image.avgLuminance, JSON.stringify(variants), label, actorId],
      );
      const stored = await db.query<Row>(`select id, label, width, height, variants from media_asset where sha256 = $1`, [image.sha256]);
      return { ok: true, choice: choiceOf(stored.rows[0]) };
    },
    async remove(assetId) {
      const id = assetId.replace(/^upload:/, "");
      if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(id)) return { ok: false, error: "identificador inválido" };
      const key = `upload:${id}`;
      const inRelease = await db.query(`select 1 from release where bundle -> 'media' ? $1 limit 1`, [key]);
      if (inRelease.rowCount > 0) return { ok: false, error: "essa imagem faz parte de uma versão publicada (ainda restaurável) e não pode ser removida" };
      const inDraft = await db.query(`select 1 from config_draft where position($1 in doc::text) > 0 limit 1`, [key]);
      if (inDraft.rowCount > 0) return { ok: false, error: "essa imagem está em uso no rascunho" };
      const done = await db.query(`update media_asset set deleted_at = now() where id = $1 and deleted_at is null`, [id]);
      return done.rowCount > 0 ? { ok: true } : { ok: false, error: "imagem não encontrada" };
    },
    /** Whether an authenticated editor may read this object: it must belong to a known, non-deleted upload. */
    async knows(sha256: string) {
      const r = await db.query(`select 1 from media_asset where sha256 = $1 and status = 'ready' limit 1`, [sha256]);
      return r.rowCount > 0;
    },
    async read(key) {
      return objects ? objects.get(key) : null;
    },
  };
}

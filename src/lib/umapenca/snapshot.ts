import "server-only";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { catalogSnapshotDir } from "../config/env";
import { SnapshotWriteError } from "../catalog/snapshot-file";
import type { UmaPencaSnapshot } from "./types";

/**
 * `umapenca-snapshot.json`, next to the INK catalog snapshot on the same Volume (`catalogSnapshotDir()`), with the same
 * contract: written atomically by the sync only, read synchronously by pages with an mtime-keyed cache, and a missing or
 * unreadable file is simply "no articles" — a page never fails because of it.
 */
export function umaPencaSnapshotPath(): string {
  return path.join(catalogSnapshotDir(), "umapenca-snapshot.json");
}

function isSnapshot(value: unknown): value is UmaPencaSnapshot {
  return typeof value === "object" && value !== null && (value as UmaPencaSnapshot).version === 1 && Array.isArray((value as UmaPencaSnapshot).articles);
}

let cache: { filePath: string; mtimeMs: number; snapshot: UmaPencaSnapshot | null } | null = null;

/** `filePath` is only ever overridden by tests. */
export function readUmaPencaSnapshot(filePath: string = umaPencaSnapshotPath()): UmaPencaSnapshot | null {
  let mtimeMs: number;
  try {
    mtimeMs = statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
  if (cache && cache.filePath === filePath && cache.mtimeMs === mtimeMs) return cache.snapshot;
  let snapshot: UmaPencaSnapshot | null = null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
    snapshot = isSnapshot(parsed) ? parsed : null;
  } catch {
    snapshot = null;
  }
  cache = { filePath, mtimeMs, snapshot };
  return snapshot;
}

export async function writeUmaPencaSnapshot(snapshot: UmaPencaSnapshot, filePath: string = umaPencaSnapshotPath()): Promise<void> {
  const dir = path.dirname(filePath);
  try {
    await mkdir(dir, { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(snapshot));
    await rename(tmp, filePath);
  } catch (err) {
    throw new SnapshotWriteError(`could not write Uma Penca snapshot to ${filePath} (directory ${dir}) — is the volume mounted and writable?`, err);
  }
}

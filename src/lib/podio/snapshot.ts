import "server-only";
import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { catalogSnapshotDir } from "../config/env";
import { SnapshotWriteError } from "../catalog/snapshot-file";
import type { RegionSlug } from "../geo/regions";
import type { PodioRunState, PodioSnapshot } from "./types";

/**
 * Pódio files on the same Volume as the catalog (`catalogSnapshotDir()/podio/<region>/`):
 *  - `YYYY-MM-DD.json`  one complete snapshot per reference date (re-running a date replaces only that date's file, so the D−1 file used
 *                       for movement is never replaced by an earlier run of the same day);
 *  - `latest.json`      a copy of the newest complete snapshot — the ONE file pages read (home and state page alike);
 *  - `state.json`       the last attempt (ok or failed), so a failure is never mistaken for "zero sales".
 * Every write is temp file + rename: a reader sees the old snapshot or the new one, never a mix.
 */
const KEEP_DATED = 14;
const DATED = /^\d{4}-\d{2}-\d{2}\.json$/;

export function podioDir(region: RegionSlug, baseDir: string = catalogSnapshotDir()): string {
  return path.join(baseDir, "podio", region);
}

function isSnapshot(value: unknown): value is PodioSnapshot {
  const v = value as PodioSnapshot;
  return typeof v === "object" && v !== null && v.version === 1 && typeof v.referenceDate === "string" && typeof v.computedAt === "string" && typeof v.states === "object" && v.states !== null;
}

function isRunState(value: unknown): value is PodioRunState {
  const v = value as PodioRunState;
  return typeof v === "object" && v !== null && v.version === 1 && typeof v.lastAttempt === "object" && v.lastAttempt !== null;
}

async function atomicWrite(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  try {
    await mkdir(dir, { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(data));
    await rename(tmp, filePath);
  } catch (err) {
    throw new SnapshotWriteError(`could not write pódio file ${filePath} (directory ${dir}) — is the volume mounted and writable?`, err);
  }
}

export async function readDatedSnapshot(region: RegionSlug, referenceDate: string, baseDir?: string): Promise<PodioSnapshot | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path.join(podioDir(region, baseDir), `${referenceDate}.json`), "utf8"));
    return isSnapshot(parsed) && parsed.referenceDate === referenceDate && parsed.region === region ? parsed : null;
  } catch {
    return null;
  }
}

/** Publishes a complete snapshot: its dated file, then `latest.json` (only if it is not older than the current latest), then prunes. */
export async function publishSnapshot(snapshot: PodioSnapshot, baseDir?: string): Promise<void> {
  const dir = podioDir(snapshot.region, baseDir);
  await atomicWrite(path.join(dir, `${snapshot.referenceDate}.json`), snapshot);
  const current = readLatestSnapshot(snapshot.region, baseDir);
  if (!current || current.referenceDate <= snapshot.referenceDate) await atomicWrite(path.join(dir, "latest.json"), snapshot);
  try {
    const dated = (await readdir(dir)).filter((f) => DATED.test(f)).sort();
    for (const old of dated.slice(0, Math.max(0, dated.length - KEEP_DATED))) await unlink(path.join(dir, old));
  } catch {
    // Pruning is housekeeping: never fails a publish.
  }
}

export async function writeRunState(region: RegionSlug, state: PodioRunState, baseDir?: string): Promise<void> {
  await atomicWrite(path.join(podioDir(region, baseDir), "state.json"), state);
}

const cache = new Map<string, { mtimeMs: number; value: unknown }>();

function readCached<T>(filePath: string, guard: (v: unknown) => v is T): T | null {
  let mtimeMs: number;
  try {
    mtimeMs = statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
  const hit = cache.get(filePath);
  if (hit && hit.mtimeMs === mtimeMs) return hit.value as T | null;
  let value: T | null = null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
    value = guard(parsed) ? parsed : null;
  } catch {
    value = null;
  }
  cache.set(filePath, { mtimeMs, value });
  return value;
}

/** Synchronous, mtime-cached: what every page render calls. Never touches INK. */
export function readLatestSnapshot(region: RegionSlug, baseDir?: string): PodioSnapshot | null {
  const snapshot = readCached(path.join(podioDir(region, baseDir), "latest.json"), isSnapshot);
  return snapshot && snapshot.region === region ? snapshot : null;
}

export function readRunState(region: RegionSlug, baseDir?: string): PodioRunState | null {
  return readCached(path.join(podioDir(region, baseDir), "state.json"), isRunState);
}

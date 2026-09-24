import { createHash } from "node:crypto";

/** Deterministic JSON: object keys sorted recursively, so logically-equal bundles always hash equally. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Checksum of a published bundle (sha256 hex of its canonical JSON). Stored in Postgres (`release.checksum`,
 * `release_head.file_checksum`) and compared with the file on the Volume to detect Postgres ↔ file drift
 * (docs/admin/cms-v1-round2.md §5).
 */
export function bundleChecksum(bundle: unknown): string {
  return createHash("sha256").update(canonicalJson(bundle)).digest("hex");
}

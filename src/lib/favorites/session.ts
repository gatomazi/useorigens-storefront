import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { CommerceStoreKey } from "../geo/regions";
import { listSessionSecret } from "../config/env";

/**
 * The "buy session" identifier handed to INK so the Worker/loader (`use-origens-workers`) can show "sua próxima
 * estampa" without a second, shared database. See docs/buy-session-consumer.md (this repo) and
 * use-origens-workers' docs/buy-session-contract.md (authoritative contract).
 *
 * Fully self-describing and HMAC-signed, NOT stored anywhere (no DB row, no KV): `mint()` only ever runs here,
 * `verify()` only ever runs in `GET /api/buy-session/[id]`, which the Worker calls server-to-server. The signing
 * key never leaves this app — the Worker never verifies anything itself, it only relays the opaque string.
 *
 * The payload carries INK product ids only (never a name, price or URL): even a forged/tampered id can only ever
 * reference products that `resolveProductDisplay` independently re-validates against the live catalog at read
 * time, so there is nothing here for a signature to protect beyond "was this exact list issued by us" — which is
 * what buys the "identificador não adivinhável" requirement without a shared secret across two deployments.
 */

const VALID_STORE_KEYS: readonly CommerceStoreKey[] = ["use-sul", "use-norte", "use-centro", "use-origens"];
const VERSION = 1;
export const LIST_SESSION_TTL_SECONDS = 60 * 60; // 1h: long enough for a multi-item purchase journey, still bounded
export const LIST_SESSION_MAX_ITEMS = 24; // keeps the token well under any practical URL-length limit

type Payload = { v: 1; s: CommerceStoreKey; p: string[]; t: number };

const b64url = (buf: Buffer): string => buf.toString("base64url");

function sign(secret: string, payload: string): string {
  return b64url(createHmac("sha256", secret).update(payload).digest().subarray(0, 16)); // 128-bit tag, enough for integrity, not confidentiality
}

/** Builds the opaque id, or null when the secret isn't configured or there is nothing eligible to encode. */
export function mintListSession(storeKey: CommerceStoreKey, inkProductIds: readonly string[]): string | null {
  const secret = listSessionSecret();
  const ids = inkProductIds.slice(0, LIST_SESSION_MAX_ITEMS);
  if (!secret || ids.length === 0) return null;
  const payload: Payload = { v: VERSION, s: storeKey, p: ids, t: Math.floor(Date.now() / 1000) };
  const encoded = b64url(Buffer.from(JSON.stringify(payload)));
  return `${encoded}.${sign(secret, encoded)}`;
}

export type VerifiedListSession = { storeKey: CommerceStoreKey; inkProductIds: string[]; ageSeconds: number };

/** Verifies signature + shape + TTL. Returns null for anything malformed, unsigned, mis-signed or expired — never distinguishes why. */
export function verifyListSession(id: string): VerifiedListSession | null {
  const secret = listSessionSecret();
  if (!secret || typeof id !== "string" || id.length > 4000) return null;
  const dot = id.indexOf(".");
  if (dot < 1 || dot === id.length - 1) return null;
  const encoded = id.slice(0, dot);
  const providedSig = id.slice(dot + 1);
  const expectedSig = sign(secret, encoded);
  const provided = Buffer.from(providedSig);
  const expected = Buffer.from(expectedSig);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Partial<Payload>;
  if (p.v !== VERSION || typeof p.s !== "string" || !VALID_STORE_KEYS.includes(p.s as CommerceStoreKey) || typeof p.t !== "number" || !Array.isArray(p.p)) return null;
  if (!p.p.every((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 40) || p.p.length === 0 || p.p.length > LIST_SESSION_MAX_ITEMS) return null;
  const ageSeconds = Math.floor(Date.now() / 1000) - p.t;
  if (ageSeconds < 0 || ageSeconds > LIST_SESSION_TTL_SECONDS) return null;
  return { storeKey: p.s as CommerceStoreKey, inkProductIds: p.p, ageSeconds };
}

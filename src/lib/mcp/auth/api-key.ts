import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * The owner's API key: the alternative to OAuth for the MCP connector (docs/mcp/README.md §1). One key, read and write, for the owner
 * only. Claude sends it in its own header ("Sem login" + a request header in the connector settings); the server keeps only its SHA-256
 * (MCP_API_KEY_SHA256), so neither the environment nor a log ever holds the key. Unset = no key is accepted; rotating the variable
 * revokes the old key at once.
 */
export const API_KEY_HEADER = "x-origens-key";
export const API_KEY_ENV = "MCP_API_KEY_SHA256";
/** Shows up as the client of every change made with the key (audit trail and change records). */
export const API_KEY_CLIENT_ID = "chave-api";

const HASH_RE = /^[0-9a-f]{64}$/;

export const newApiKey = (): string => `uo_${randomBytes(32).toString("base64url")}`;

export const apiKeyHash = (key: string): string => createHash("sha256").update(key, "utf8").digest("hex");

/** "off" when no valid hash is configured, so a malformed variable never lets a key in. */
export function checkApiKey(presented: string, configuredHash: string | undefined): "ok" | "wrong" | "off" {
  const expected = (configuredHash ?? "").trim().toLowerCase();
  if (!HASH_RE.test(expected)) return "off";
  const got = Buffer.from(apiKeyHash(presented.trim()), "hex");
  return timingSafeEqual(got, Buffer.from(expected, "hex")) ? "ok" : "wrong";
}

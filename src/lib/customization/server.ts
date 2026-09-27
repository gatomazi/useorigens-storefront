import "server-only";
import { adminConfig } from "../admin/config";
import { platform } from "../admin/platform";
import type { RequestStore } from "./requests";

/**
 * The request store of this process, or null when there is none (the admin/database is not configured: the model page then says requests are
 * unavailable instead of pretending to save). Public visits never touch it; only a submission and the reference page do.
 */
export function requestStoreOrNull(): RequestStore | null {
  try {
    return adminConfig().mode === "off" ? null : platform().requests;
  } catch {
    return null;
  }
}

/** Secret the customer's reference is derived with: the admin session secret in production (≥ 32 chars, already required), a sandbox constant locally. */
export function requestSecret(): string | null {
  const cfg = adminConfig();
  if (cfg.mode === "prod") return cfg.sessionSecret;
  if (cfg.mode === "dev") return process.env.ADMIN_SESSION_SECRET ?? "local-sandbox-only-customization-reference-secret";
  return null;
}

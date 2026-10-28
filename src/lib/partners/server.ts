import "server-only";
import { adminConfig } from "../admin/config";
import { platform } from "../admin/platform";
import { pgPartnerStore } from "./pg-store";
import { filePartnerStore, type PartnerStore } from "./store";

const g = globalThis as unknown as { __uoPartnerStore?: PartnerStore };

/**
 * Where partner applications live: Postgres in production, a JSON file on the development server, nothing when the admin is not configured (the
 * page then says the form is unavailable instead of pretending to save). Public visits never touch it; only a submission does.
 */
export function partnerStoreOrNull(): PartnerStore | null {
  try {
    if (adminConfig().mode === "off") return null;
    const p = platform();
    if (p.mode === "prod") return p.db ? pgPartnerStore(p.db) : null;
    g.__uoPartnerStore ??= filePartnerStore();
    return g.__uoPartnerStore;
  } catch {
    return null;
  }
}

/** Postgres says the table does not exist (db/migrations/0010 not applied yet). */
export const missingTable = (error: unknown): boolean => /42P01|partner_application/.test(error instanceof Error ? `${(error as { code?: string }).code ?? ""} ${error.message}` : String(error));

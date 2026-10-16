/**
 * Form → configuration for the "Faixa do topo" screen. Pure. The editor posts its rows as one JSON field and the production time as another; nothing
 * here trusts them: every row is rebuilt field by field, dates typed in Brasília time become explicit instants, the order is the list's order, and the
 * result goes through the same strict validator the publisher uses (`validateTopBar`).
 */
import { fromBrasiliaInput } from "../site-config/promotions";
import { MAX_PRODUCTION_DAYS, MAX_TOP_BAR_MESSAGES, TOP_BAR_TEXT_MAX, validateTopBar, type TopBarConfig, type TopBarMessage } from "../site-config/top-bar-schema";
import { PROMO_ID } from "../site-config/promotions-schema";
import { promotionId, type Parsed } from "./promotions-form";
import type { Scope } from "../site-config/schema";

/** One row as the editor holds it (all strings: half-typed values must survive a re-render). */
export type TopBarRow = {
  id: string;
  enabled: boolean;
  text: string;
  href: string;
  /** `datetime-local` values, Brasília time; "" = no limit. */
  startsAt: string;
  endsAt: string;
};

const str = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

export function topBarFromForm(rows: unknown, productionDays: string, scope: Scope): Parsed<TopBarConfig> {
  if (!Array.isArray(rows)) return { ok: false, errors: ["Lista de mensagens inválida. Recarregue a página e tente de novo."] };
  if (rows.length > MAX_TOP_BAR_MESSAGES) return { ok: false, errors: [`No máximo ${MAX_TOP_BAR_MESSAGES} mensagens por região.`] };
  const errors: string[] = [];
  const days = productionDays.trim();
  let production: number | undefined;
  if (days !== "") {
    production = Number(days);
    if (!Number.isInteger(production) || production < 1 || production > MAX_PRODUCTION_DAYS) errors.push(`O prazo de produção é um número inteiro de 1 a ${MAX_PRODUCTION_DAYS} dias úteis (ou fica vazio).`);
  }
  const taken = new Set<string>(rows.map((r) => (r && typeof r === "object" ? str((r as Record<string, unknown>).id) : "")).filter((id) => PROMO_ID.test(id)));
  const seen = new Set<string>();
  const messages: TopBarMessage[] = rows.map((raw, i) => {
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const text = str(r.text);
    let id = str(r.id);
    if (!PROMO_ID.test(id) || seen.has(id)) id = promotionId(text.replace(/\{[^}]*\}/g, " "), new Set([...taken, ...seen]));
    seen.add(id);
    const name = `Mensagem ${i + 1}`;
    const startsAt = fromBrasiliaInput(str(r.startsAt).replace(" ", "T"));
    const endsAt = fromBrasiliaInput(str(r.endsAt).replace(" ", "T"));
    if (startsAt === null) errors.push(`${name}: data de início inválida.`);
    if (endsAt === null) errors.push(`${name}: data de fim inválida.`);
    const message: TopBarMessage = { id, enabled: r.enabled === true, text, order: i + 1 };
    const href = str(r.href);
    if (href) message.href = href;
    if (startsAt) message.startsAt = startsAt;
    if (endsAt) message.endsAt = endsAt;
    return message;
  });
  if (errors.length > 0) return { ok: false, errors };
  const config: TopBarConfig = production === undefined ? { messages } : { productionDays: production, messages };
  const checked = validateTopBar(config, scope);
  return checked.ok ? { ok: true, value: checked.value } : { ok: false, errors: checked.errors.map((e) => readableTopBarError(e, scope)) };
}

/** `topBar.messages[1].text: …` → `Mensagem 2: …`, something the owner can act on. */
export function readableTopBarError(error: string, scope: Scope): string {
  if (error.includes("productionDays")) return `O prazo de produção é um número inteiro de 1 a ${MAX_PRODUCTION_DAYS} dias úteis (ou fica vazio).`;
  const m = /messages\[(\d+)\]\.?(\w*)/.exec(error);
  if (!m) return error.includes("at most") ? `No máximo ${MAX_TOP_BAR_MESSAGES} mensagens por região.` : `Faixa do topo: ${error.replace(/^[^:]*:\s*/, "")}`;
  const who = `Mensagem ${Number(m[1]) + 1}`;
  const field = m[2];
  if (field === "text") {
    if (error.includes("{producao} needs")) return `${who}: {producao} precisa do prazo de produção preenchido acima.`;
    if (error.includes("{faltam} needs")) return `${who}: {faltam} precisa de uma data de fim (é a contagem até ela).`;
    const unknown = /unknown placeholder (\{[^}]*\})/.exec(error);
    if (unknown) return `${who}: ${unknown[1]} não existe. Use {producao} ou {faltam}.`;
    return `${who}: o texto precisa ter de 1 a ${TOP_BAR_TEXT_MAX} caracteres, em uma linha.`;
  }
  const say: Record<string, string> = {
    href: `o link precisa ser uma página desta região, como /${scope}/h/natal (sem domínio).`,
    endsAt: error.includes("after") ? "o fim precisa ser depois do início." : "data de fim inválida.",
    startsAt: "data de início inválida.",
  };
  return `${who}: ${say[field] ?? error.replace(/^[^:]*:\s*/, "")}`;
}

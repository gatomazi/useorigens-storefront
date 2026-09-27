/**
 * The contact part of a personalization request: who the team talks to once the print is ready. Pure and shared: the browser form checks it for inline
 * messages and the server runs the SAME function again on submit. Nothing here stores or sends anything.
 *
 * Rules (docs/admin/cms-hotpages-personalizacao-release-gate.md): a name, at least ONE valid channel (WhatsApp or e-mail, both allowed) and an explicit,
 * unticked-by-default confirmation that the contact may be used for THIS request. No tax id, address, account or password is ever asked for.
 */
import type { FieldError } from "./validate";

/** Bump when the wording the customer confirms changes: the version is stored with each request. */
export const CONTACT_NOTICE_VERSION = "2026-09-v1";
export const CONTACT_CONFIRM_TEXT = "Autorizo a equipe a usar este contato para falar sobre esta solicitação.";
export const CONTACT_NOTICE =
  "Usamos o nome e o contato só para confirmar a estampa e, quando ela estiver pronta, orientar a sua compra na loja. Não é uma inscrição para receber ofertas.";

export type ContactInput = { name?: unknown; whatsapp?: unknown; email?: unknown; confirm?: unknown };
export type ContactValues = { name: string; whatsapp?: string; email?: string };
export type ContactResult = { ok: true; contact: ContactValues } | { ok: false; errors: FieldError[] };

export const CONTACT_KEYS = { name: "contact.name", whatsapp: "contact.whatsapp", email: "contact.email", confirm: "contact.confirm" } as const;

const INVISIBLE = /[\p{C}\u{2028}\u{2029}]/u;
const collapse = (raw: string) => raw.normalize("NFKC").replace(/\s+/g, " ").trim();

const NAME = /^[\p{L}\p{M}][\p{L}\p{M} '’.\-]*$/u;
export function nameProblem(value: string): string | null {
  const len = [...value].length;
  if (len < 2) return "informe o seu nome";
  if (len > 80) return "no máximo 80 caracteres";
  if (!NAME.test(value)) return "use só letras, espaços, apóstrofo, ponto e hífen";
  return null;
}

/** A Brazilian number without the country code: 2-digit area code, then a 9-prefixed mobile (11 digits) or a landline (10 digits, 2-5). */
function brazilianNational(n: string): string | null {
  if (n.length !== 10 && n.length !== 11) return "informe o DDD e o número (ex.: (51) 99999-9999)";
  if (n[0] === "0" || n[1] === "0") return "o DDD não começa nem termina com zero: informe (51) 99999-9999, sem o zero antes do DDD";
  if (n.length === 11 && n[2] !== "9") return "celular com DDD tem 9 dígitos e começa com 9";
  if (n.length === 10 && !"2345".includes(n[2])) return "esse número parece de celular sem o 9 na frente: informe (DDD) 9xxxx-xxxx";
  return null;
}

/**
 * Turns what was typed into `+<country><number>` (digits only after the plus), or says why not. Never guesses: a number that could be read two ways is refused
 * with the way to write it. Numbers with a `+` are accepted for any country (8–15 digits); without it, Brazilian numbers with DDD.
 */
export function normalizeWhatsapp(raw: string): { ok: true; value: string } | { ok: false; message: string } {
  const text = raw.normalize("NFKC").trim();
  if (INVISIBLE.test(text) || /[^\d\s()+.\-]/.test(text)) return { ok: false, message: "use só números, DDD, espaços, parênteses e hífen" };
  if (text.lastIndexOf("+") > 0) return { ok: false, message: "o + só vale no começo, antes do código do país" };
  const digits = text.replace(/\D/g, "");
  if (text.startsWith("+")) {
    if (digits.length < 8 || digits.length > 15 || digits[0] === "0") return { ok: false, message: "número internacional inválido: use + e o código do país" };
    if (digits.startsWith("55")) {
      const problem = brazilianNational(digits.slice(2));
      if (problem) return { ok: false, message: problem };
    }
    return { ok: true, value: `+${digits}` };
  }
  if (digits.length === 12 || digits.length === 13) {
    // Too long to be a national number: only "55" + DDD + number is meaningful.
    if (!digits.startsWith("55")) return { ok: false, message: "informe o DDD e o número, ou use + e o código do país" };
    const problem = brazilianNational(digits.slice(2));
    return problem ? { ok: false, message: problem } : { ok: true, value: `+${digits}` };
  }
  const problem = brazilianNational(digits);
  return problem ? { ok: false, message: problem } : { ok: true, value: `+55${digits}` };
}

const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;
/** Trimmed, with the domain lower-cased (the part before the @ may be case-sensitive at the provider, so it is left as typed). */
export function normalizeEmail(raw: string): { ok: true; value: string } | { ok: false; message: string } {
  const text = raw.normalize("NFKC").trim();
  if (text.length > 254 || INVISIBLE.test(text) || !EMAIL.test(text)) return { ok: false, message: "informe um e-mail válido (ex.: nome@exemplo.com)" };
  const at = text.lastIndexOf("@");
  return { ok: true, value: `${text.slice(0, at)}@${text.slice(at + 1).toLowerCase()}` };
}

export function validateContact(input: ContactInput): ContactResult {
  const errors: FieldError[] = [];
  const text = (v: unknown): string | null => (v === undefined || v === null ? "" : typeof v === "string" ? v : null);
  const nameRaw = text(input.name);
  const waRaw = text(input.whatsapp);
  const mailRaw = text(input.email);
  const contact: ContactValues = { name: "" };

  if (nameRaw === null) errors.push({ key: CONTACT_KEYS.name, message: "Nome: valor inválido" });
  else {
    const name = collapse(nameRaw);
    const problem = name === "" ? "informe o seu nome" : nameProblem(name);
    if (problem) errors.push({ key: CONTACT_KEYS.name, message: `Nome: ${problem}` });
    else contact.name = name;
  }
  if (waRaw === null) errors.push({ key: CONTACT_KEYS.whatsapp, message: "WhatsApp: valor inválido" });
  else if (waRaw.trim() !== "") {
    const r = normalizeWhatsapp(waRaw);
    if (r.ok) contact.whatsapp = r.value;
    else errors.push({ key: CONTACT_KEYS.whatsapp, message: `WhatsApp: ${r.message}` });
  }
  if (mailRaw === null) errors.push({ key: CONTACT_KEYS.email, message: "E-mail: valor inválido" });
  else if (mailRaw.trim() !== "") {
    const r = normalizeEmail(mailRaw);
    if (r.ok) contact.email = r.value;
    else errors.push({ key: CONTACT_KEYS.email, message: `E-mail: ${r.message}` });
  }
  const blank = (v: string | null) => v !== null && v.trim() === "";
  if (blank(waRaw) && blank(mailRaw)) errors.push({ key: CONTACT_KEYS.whatsapp, message: "Informe um WhatsApp ou um e-mail (pode ser os dois)" });
  if (input.confirm !== true) errors.push({ key: CONTACT_KEYS.confirm, message: "Marque a autorização para podermos falar com você sobre esta solicitação" });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, contact };
}

// ── What may be shown to the customer, and what the operator sends ───────────────────────────────────────────────────────

/** Masked, for the public confirmation: enough to recognise the channel, not enough to leak it to a shared screen or a screenshot. */
export const maskWhatsapp = (number: string): string => `WhatsApp final ${number.replace(/\D/g, "").slice(-4)}`;
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  return at < 1 ? "e-mail informado" : `${email[0]}***@${email.slice(at + 1)}`;
}
export function maskedChannels(c: { whatsapp?: string; email?: string }): string[] {
  return [...(c.whatsapp ? [maskWhatsapp(c.whatsapp)] : []), ...(c.email ? [maskEmail(c.email)] : [])];
}

const firstName = (name: string) => name.split(" ")[0] || name;

/** The text an operator may send (or edit first) once the print is ready. It is only a suggestion: nothing is sent by the CMS. */
export function suggestedMessage(p: { name: string; modelName: string; reference: string; productLink?: string | null }): string {
  const how = p.productLink ? `Para comprar, é por aqui: ${p.productLink}` : "Se quiser, envio o link para você comprar.";
  return `Olá, ${firstName(p.name)}! Aqui é a equipe da Use Origens. Sobre a sua solicitação de personalização “${p.modelName}” (ref. ${p.reference}): a estampa ficou pronta. ${how} Se algo não estiver como você imaginou, é só responder esta mensagem.`;
}
export const emailSubject = (reference: string): string => `Sua personalização na Use Origens (ref. ${reference})`;
/** `wa.me` link for a normalised number (`+5551…`). It only OPENS the chat: a person still has to press send. */
export const whatsappUrl = (number: string, text: string): string => `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
export const mailtoUrl = (email: string, subject: string, body: string): string => `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

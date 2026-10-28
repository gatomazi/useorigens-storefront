/**
 * A partner application (the "Seja parceiro" page, /<region>/seja-parceiro): who wants to sell, draw or sign a collection with the store, and how to reach
 * them. Pure and shared: the browser form checks it for inline messages and the server action runs the SAME function again before anything is stored
 * (db/migrations/0010_partner_applications). Nothing here stores or sends anything.
 *
 * Asked: name, WhatsApp (the team answers there), city, the profile and the explicit, unticked-by-default authorisation. Optional: e-mail, Instagram,
 * followers and a message. Never a tax id, address, bank account or password: the commission terms are agreed in the conversation, in writing.
 */
import type { RegionSlug } from "../geo/regions";
import { nameProblem, normalizeEmail, normalizeWhatsapp } from "../customization/contact";
import type { FieldError } from "../customization/validate";

export const PARTNER_PROFILES = ["ambassador", "artist", "collab"] as const;
export type PartnerProfile = (typeof PARTNER_PROFILES)[number];
export const PROFILE_LABEL: Record<PartnerProfile, string> = { ambassador: "Embaixador", artist: "Artista", collab: "Collab" };
/** The public anchor of each profile (its section on the page, and `#quero-<slug>` preselects it in the form). */
export const PROFILE_SLUG: Record<PartnerProfile, string> = { ambassador: "embaixador", artist: "artista", collab: "collab" };

/** The team's queue: a new application, a conversation going on, a partnership agreed, or one that did not go ahead. Any status may follow any other. */
export const PARTNER_STATUSES = ["new", "talking", "partner", "declined"] as const;
export type PartnerStatus = (typeof PARTNER_STATUSES)[number];
export const STATUS_LABEL: Record<PartnerStatus, string> = { new: "Nova", talking: "Em conversa", partner: "Parceria fechada", declined: "Não seguiu" };

/** Bump when the wording the person confirms changes: the version is stored with each application. */
export const PARTNER_NOTICE_VERSION = "2026-10-v1";
export const PARTNER_CONFIRM_TEXT = "Autorizo a Use Origens a usar estes dados para avaliar a minha inscrição e falar comigo sobre a parceria.";
export const PARTNER_NOTICE = "Usamos os seus dados só para avaliar a inscrição e conversar sobre a parceria. Não é um cadastro para receber ofertas.";

/** Applications are deleted a year after they arrive, unless the partnership was agreed (that one is the team's record of the deal). */
export const PARTNER_RETENTION_DAYS = 365;

export const MAX_CITY = 80;
export const MAX_MESSAGE = 1000;
export const MAX_FOLLOWERS = 1_000_000_000;

export const PARTNER_KEYS = {
  profile: "profile",
  name: "name",
  whatsapp: "whatsapp",
  email: "email",
  city: "city",
  instagram: "instagram",
  followers: "followers",
  message: "message",
  confirm: "confirm",
} as const;

export type PartnerInput = { profile?: unknown; name?: unknown; whatsapp?: unknown; email?: unknown; city?: unknown; instagram?: unknown; followers?: unknown; message?: unknown; confirm?: unknown };
export type PartnerValues = {
  profile: PartnerProfile;
  name: string;
  whatsapp: string;
  email: string | null;
  city: string;
  instagram: string | null;
  followers: number | null;
  message: string | null;
};
export type PartnerResult = { ok: true; values: PartnerValues } | { ok: false; errors: FieldError[] };

export type PartnerApplication = PartnerValues & {
  id: string;
  region: RegionSlug;
  status: PartnerStatus;
  noticeVersion: string;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
};

export const isPartnerProfile = (v: unknown): v is PartnerProfile => typeof v === "string" && (PARTNER_PROFILES as readonly string[]).includes(v);
export const isPartnerStatus = (v: unknown): v is PartnerStatus => typeof v === "string" && (PARTNER_STATUSES as readonly string[]).includes(v);

const INVISIBLE = /[\p{C}\u{2028}\u{2029}]/u;
// The message keeps its line breaks and the joiner inside emoji (👩‍🎨); every other control or invisible character is refused.
const INVISIBLE_IN_TEXT = /[^\P{C}\n\u{200D}]|[\u{2028}\u{2029}]/u;
const collapse = (raw: string) => raw.normalize("NFKC").replace(/\s+/g, " ").trim();

const CITY = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} '’.,/()\-]*$/u;
export function cityProblem(value: string): string | null {
  const len = [...value].length;
  if (len < 2) return "informe a sua cidade";
  if (len > MAX_CITY) return `no máximo ${MAX_CITY} caracteres`;
  if (!CITY.test(value)) return "use só letras, números, espaços e - / ,";
  return null;
}

const HANDLE = /^[A-Za-z0-9._]{1,30}$/;
/** "@fulana", "fulana" or a link to the profile, as the bare handle; refused when it is not one. */
export function normalizeInstagram(raw: string): { ok: true; value: string } | { ok: false; message: string } {
  const text = raw.normalize("NFKC").trim();
  const handle = text
    .replace(/^(https?:\/\/)?(www\.)?(instagram\.com|instagr\.am)\//i, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "");
  if (INVISIBLE.test(text) || !HANDLE.test(handle)) return { ok: false, message: "informe o @ do perfil (ex.: @usesul.oficial)" };
  return { ok: true, value: handle };
}

/** "12500", "12.500", "12 mil" or "12,5k" as a whole number; refused when it cannot be read as one. */
export function parseFollowers(raw: string): { ok: true; value: number } | { ok: false; message: string } {
  const text = raw.normalize("NFKC").trim().toLowerCase();
  const short = /^(\d{1,7}(?:[.,]\d{1,3})?)\s*(k|mil)$/.exec(text);
  const n = short ? Math.round(Number(short[1].replace(",", ".")) * 1000) : /^\d{1,3}(?:[.\s]\d{3})+$|^\d{1,10}$/.test(text) ? Number(text.replace(/[.\s]/g, "")) : NaN;
  if (!Number.isSafeInteger(n) || n < 0 || n > MAX_FOLLOWERS) return { ok: false, message: "use só números (ex.: 12500 ou 12 mil)" };
  return { ok: true, value: n };
}

/** Checks one application. Field keys match PARTNER_KEYS so the form can put each message under its own field. */
export function validatePartnerApplication(input: PartnerInput): PartnerResult {
  const errors: FieldError[] = [];
  const text = (v: unknown): string | null => (v === undefined || v === null ? "" : typeof v === "string" ? v : null);
  const fail = (key: string, message: string) => errors.push({ key, message });
  const values: Partial<PartnerValues> = { email: null, instagram: null, followers: null, message: null };

  if (isPartnerProfile(input.profile)) values.profile = input.profile;
  else fail(PARTNER_KEYS.profile, "Perfil: escolha embaixador, artista ou collab");

  const name = text(input.name);
  if (name === null) fail(PARTNER_KEYS.name, "Nome: valor inválido");
  else {
    const clean = collapse(name);
    const problem = clean === "" ? "informe o seu nome" : nameProblem(clean);
    if (problem) fail(PARTNER_KEYS.name, `Nome: ${problem}`);
    else values.name = clean;
  }

  const whatsapp = text(input.whatsapp);
  if (whatsapp === null) fail(PARTNER_KEYS.whatsapp, "WhatsApp: valor inválido");
  else if (whatsapp.trim() === "") fail(PARTNER_KEYS.whatsapp, "WhatsApp: informe o número com DDD");
  else {
    const r = normalizeWhatsapp(whatsapp);
    if (r.ok) values.whatsapp = r.value;
    else fail(PARTNER_KEYS.whatsapp, `WhatsApp: ${r.message}`);
  }

  const email = text(input.email);
  if (email === null) fail(PARTNER_KEYS.email, "E-mail: valor inválido");
  else if (email.trim() !== "") {
    const r = normalizeEmail(email);
    if (r.ok) values.email = r.value;
    else fail(PARTNER_KEYS.email, `E-mail: ${r.message}`);
  }

  const city = text(input.city);
  if (city === null) fail(PARTNER_KEYS.city, "Cidade: valor inválido");
  else {
    const clean = collapse(city);
    const problem = cityProblem(clean);
    if (problem) fail(PARTNER_KEYS.city, `Cidade: ${problem}`);
    else values.city = clean;
  }

  const instagram = text(input.instagram);
  if (instagram === null) fail(PARTNER_KEYS.instagram, "Instagram: valor inválido");
  else if (instagram.trim() !== "") {
    const r = normalizeInstagram(instagram);
    if (r.ok) values.instagram = r.value;
    else fail(PARTNER_KEYS.instagram, `Instagram: ${r.message}`);
  }

  const followers = typeof input.followers === "number" ? String(input.followers) : text(input.followers);
  if (followers === null) fail(PARTNER_KEYS.followers, "Seguidores: valor inválido");
  else if (followers.trim() !== "") {
    const r = parseFollowers(followers);
    if (r.ok) values.followers = r.value;
    else fail(PARTNER_KEYS.followers, `Seguidores: ${r.message}`);
  }

  const message = text(input.message);
  if (message === null) fail(PARTNER_KEYS.message, "Mensagem: valor inválido");
  else {
    const clean = message.normalize("NFKC").replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (INVISIBLE_IN_TEXT.test(clean)) fail(PARTNER_KEYS.message, "Mensagem: tem caracteres que não podemos guardar");
    else if ([...clean].length > MAX_MESSAGE) fail(PARTNER_KEYS.message, `Mensagem: no máximo ${MAX_MESSAGE} caracteres`);
    else if (clean !== "") values.message = clean;
  }

  if (input.confirm !== true) fail(PARTNER_KEYS.confirm, "Marque a autorização para podermos avaliar a inscrição e falar com você");
  return errors.length > 0 ? { ok: false, errors } : { ok: true, values: values as PartnerValues };
}

/** What the team may send first on WhatsApp (they can edit it before sending; nothing is sent by the panel). */
export function partnerGreeting(a: Pick<PartnerApplication, "name" | "profile">): string {
  const first = a.name.split(" ")[0] || a.name;
  return `Olá, ${first}! Aqui é a equipe da Use Origens. Recebemos a sua inscrição no programa de parceiros (${PROFILE_LABEL[a.profile].toLowerCase()}) e queremos conversar com você.`;
}

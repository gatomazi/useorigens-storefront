import type { RegionSlug } from "../geo/regions";
import type { AssistantAnswer } from "../site-config/assistant-schema";
import { fold, MAX_ASSISTANT_MESSAGE, normalize, searchTerms, type AssistantReply, type AssistantReplyKind } from "./engine";

/**
 * What people ask the assistant (db/migrations/0009_assistant_questions), so the store can see what it could not answer and write that answer.
 * No visitor is kept: no IP, no hash, no cookie. A row is the question (masked), where it was asked and what the assistant answered.
 * Pure: the route builds the row, a store keeps it (Postgres in production, memory on the development server), the panel reads the report.
 */
export type AssistantSurface = "site" | "ink";
export type AssistantQuestion = {
  region: RegionSlug;
  surface: AssistantSurface;
  /** Null for a refused message (CPF, card, password): its text is never stored. */
  question: string | null;
  questionKey: string;
  kind: AssistantReplyKind;
  answerId: string | null;
  resultCount: number;
  at: number;
};

/** One line of the grouped table: the same question (by key), answered the same way, on one surface. */
export type QuestionGroup = { key: string; kind: AssistantReplyKind; answerId: string | null; surface: AssistantSurface; count: number; lastAt: number; sample: string | null };

export interface QuestionStore {
  record(row: AssistantQuestion): Promise<void>;
  /** Every question of the region since `since`, grouped (at most `limit` groups, the most asked first). */
  groups(region: RegionSlug, since: number, limit: number): Promise<QuestionGroup[]>;
  /** Deletes what is older than `before`. */
  purgeBefore(before: number): Promise<number>;
}

export const QUESTION_RETENTION_DAYS = 90;
export const QUESTION_GROUPS_LIMIT = 2000;

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;
// A run of digits with the separators people type between them: "(48) 98808-2581", "88015-200", "123.456.789-00".
const DIGITS = /\+?\(?\d[\d\s().\/-]*\d/g;

/** The question as it will be kept: e-mails and runs of 6 digits or more (phone, CEP, order or document numbers) masked, spaces collapsed, capped. */
export function maskQuestion(message: string): string {
  return message
    .replace(EMAIL, "[e-mail]")
    .replace(DIGITS, (run) => (run.replace(/\D/g, "").length >= 6 ? "[número]" : run))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_ASSISTANT_MESSAGE);
}

/**
 * The words that matter, folded: "Tem estampa de Floripa?" and "tem de floripa" are one question. The words the catalog is searched with first
 * (without "tem", "estampa", "camiseta"…), else the words of the message; only small talk falls back to the folded text itself.
 */
export function questionKey(masked: string): string {
  const plain = masked.replace(/\[(e-mail|número)\]/g, " ");
  const terms = searchTerms(plain);
  const words = terms.length > 0 ? terms : normalize(plain);
  return (words.length > 0 ? words.join(" ") : fold(masked).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()).slice(0, MAX_ASSISTANT_MESSAGE);
}

/** The row for one answered message. The base answer it used is found by its text (the reply contract carries no id, on purpose). */
export function questionRow(input: { region: RegionSlug; surface: AssistantSurface; message: string; reply: AssistantReply; answers: readonly AssistantAnswer[]; at: number }): AssistantQuestion {
  const { reply } = input;
  const refused = reply.kind === "refuse";
  const masked = refused ? "" : maskQuestion(input.message);
  const used = reply.kind === "answer" || reply.kind === "order" ? input.answers.find((a) => a.answer === reply.text) : undefined;
  return {
    region: input.region,
    surface: input.surface,
    question: refused || masked === "" ? null : masked,
    questionKey: refused ? "" : questionKey(masked),
    kind: reply.kind,
    answerId: used?.id ?? null,
    resultCount: Math.min(50, reply.items?.length ?? 0),
    at: input.at,
  };
}

/** Answers that left the person without what they asked for: what the store should write next. */
export const UNANSWERED: readonly AssistantReplyKind[] = ["not-found", "fallback", "ask", "handoff"];
/** Small talk: counted, never listed. */
const SMALL_TALK: readonly AssistantReplyKind[] = ["greeting", "chat"];

export type ReportLine = { key: string; sample: string; count: number; lastAt: number; kinds: AssistantReplyKind[]; answerIds: string[] };
export type QuestionReport = {
  total: number;
  bySurface: Record<AssistantSurface, number>;
  byKind: Partial<Record<AssistantReplyKind, number>>;
  /** Questions that ended in "não encontrei", "não tenho essa resposta", a question back or the WhatsApp. */
  unanswered: ReportLine[];
  /** Every question that is not small talk, the most asked first. */
  top: ReportLine[];
  /** How often each answer of the base was used; answers never used have 0. */
  answers: { id: string; question: string; count: number }[];
};

const line = (groups: readonly QuestionGroup[]): ReportLine => {
  const latest = groups.reduce((a, b) => (b.lastAt > a.lastAt ? b : a));
  return {
    key: latest.key,
    sample: latest.sample ?? groups.find((g) => g.sample)?.sample ?? latest.key,
    count: groups.reduce((n, g) => n + g.count, 0),
    lastAt: latest.lastAt,
    kinds: [...new Set(groups.map((g) => g.kind))],
    answerIds: [...new Set(groups.flatMap((g) => (g.answerId ? [g.answerId] : [])))],
  };
};

/** The panel's view of the grouped rows: totals, what was left unanswered, the most asked and the use of each answer. */
export function questionReport(groups: readonly QuestionGroup[], answers: readonly AssistantAnswer[], limit = 50): QuestionReport {
  const bySurface: Record<AssistantSurface, number> = { site: 0, ink: 0 };
  const byKind: Partial<Record<AssistantReplyKind, number>> = {};
  const used = new Map<string, number>();
  for (const g of groups) {
    bySurface[g.surface] += g.count;
    byKind[g.kind] = (byKind[g.kind] ?? 0) + g.count;
    if (g.answerId) used.set(g.answerId, (used.get(g.answerId) ?? 0) + g.count);
  }
  const lines = (keep: (g: QuestionGroup) => boolean) => {
    const byKey = new Map<string, QuestionGroup[]>();
    for (const g of groups) if (keep(g) && g.key) byKey.set(g.key, [...(byKey.get(g.key) ?? []), g]);
    return [...byKey.values()].map(line).sort((a, b) => b.count - a.count || b.lastAt - a.lastAt).slice(0, limit);
  };
  return {
    total: bySurface.site + bySurface.ink,
    bySurface,
    byKind,
    unanswered: lines((g) => UNANSWERED.includes(g.kind)),
    top: lines((g) => !SMALL_TALK.includes(g.kind) && g.kind !== "refuse"),
    answers: answers.map((a) => ({ id: a.id, question: a.question, count: used.get(a.id) ?? 0 })).sort((a, b) => b.count - a.count),
  };
}

/** Development server and tests: kept in memory (lost on restart). */
export function memoryQuestionStore(): QuestionStore {
  let rows: AssistantQuestion[] = [];
  return {
    async record(row) {
      rows.push(row);
    },
    async groups(region, since, limit) {
      const byGroup = new Map<string, QuestionGroup>();
      for (const r of rows) {
        if (r.region !== region || r.at < since) continue;
        const id = [r.questionKey, r.kind, r.answerId ?? "", r.surface].join("\u0000");
        const g = byGroup.get(id);
        if (!g) byGroup.set(id, { key: r.questionKey, kind: r.kind, answerId: r.answerId, surface: r.surface, count: 1, lastAt: r.at, sample: r.question });
        else {
          g.count++;
          if (r.at >= g.lastAt) [g.lastAt, g.sample] = [r.at, r.question ?? g.sample];
        }
      }
      return [...byGroup.values()].sort((a, b) => b.count - a.count || b.lastAt - a.lastAt).slice(0, limit);
    },
    async purgeBefore(before) {
      const n = rows.length;
      rows = rows.filter((r) => r.at >= before);
      return n - rows.length;
    },
  };
}

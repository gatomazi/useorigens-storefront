import "server-only";
import { adminConfig } from "../admin/config";
import { platform } from "../admin/platform";
import { memoryQuestionStore, QUESTION_RETENTION_DAYS, type AssistantQuestion, type QuestionStore } from "./questions";
import { pgQuestionStore } from "./questions-pg";

const g = globalThis as unknown as { __uoQuestionStore?: QuestionStore; __uoQuestionPurgedAt?: number; __uoQuestionWarnedAt?: number };
const DAY = 86_400_000;

/**
 * Where the assistant's questions live: Postgres in production, memory on the development server, nothing when the admin is not configured
 * (then nothing is kept and the panel says so). Public visits touch it only after an answer has been sent.
 */
export function questionStoreOrNull(): QuestionStore | null {
  try {
    if (adminConfig().mode === "off") return null;
    const p = platform();
    if (p.mode === "prod") return p.db ? pgQuestionStore(p.db) : null;
    g.__uoQuestionStore ??= memoryQuestionStore();
    return g.__uoQuestionStore;
  } catch {
    return null;
  }
}

/**
 * Keeps one question, after the answer went out. Never fails the answer: before db/migrations/0009 is applied (or with the database down) the
 * row is simply not kept. At most once an hour per process, rows older than 90 days are deleted on the way.
 */
export async function recordQuestion(row: AssistantQuestion): Promise<void> {
  const store = questionStoreOrNull();
  if (!store) return;
  try {
    await store.record(row);
    if (row.at - (g.__uoQuestionPurgedAt ?? 0) > DAY / 24) {
      g.__uoQuestionPurgedAt = row.at;
      await store.purgeBefore(row.at - QUESTION_RETENTION_DAYS * DAY);
    }
  } catch (error) {
    // One line an hour at most: before the migration every question would fail the same way.
    if (row.at - (g.__uoQuestionWarnedAt ?? 0) < DAY / 24) return;
    g.__uoQuestionWarnedAt = row.at;
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[assistant] question not kept: ${/42P01|assistant_question/.test(message) ? "migration 0009 not applied" : message.replace(/postgres(ql)?:\/\/\S+/g, "postgres://***").slice(0, 160)}`);
  }
}

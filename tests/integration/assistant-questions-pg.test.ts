import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Db } from "@/lib/admin/db/db";
import { loadMigrations, migrate } from "@/lib/admin/db/migrate";
import { createPgliteDb } from "@/lib/admin/db/pglite-db";
import { questionReport, questionRow, type QuestionStore } from "@/lib/assistant/questions";
import { pgQuestionStore } from "@/lib/assistant/questions-pg";

/** The assistant's questions on the real schema (PGlite): grouping, latest sample, a refused message without text, period and purge. */
let db: Db;
let store: QuestionStore;
const T0 = Date.parse("2026-10-25T12:00:00Z");
const notFound = { v: 1 as const, kind: "not-found" as const, text: "Não encontrei." };

beforeAll(async () => {
  db = await createPgliteDb();
  await migrate(db, loadMigrations(path.join(process.cwd(), "db", "migrations")));
  store = pgQuestionStore(db);
});
afterAll(async () => db.close());

describe("pg question store", () => {
  test("groups by key in the database, with the latest text as the sample", async () => {
    await store.record(questionRow({ region: "sul", surface: "ink", message: "tem de gaspar", reply: notFound, answers: [], at: T0 }));
    await store.record(questionRow({ region: "sul", surface: "ink", message: "Tem de Gaspar?", reply: notFound, answers: [], at: T0 + 1000 }));
    await store.record(questionRow({ region: "sul", surface: "site", message: "meu cpf é 123.456.789-00", reply: { v: 1, kind: "refuse", text: "…" }, answers: [], at: T0 }));
    const groups = await store.groups("sul", T0 - 1, 100);
    expect(groups.find((g) => g.kind === "not-found")).toMatchObject({ count: 2, sample: "Tem de Gaspar?", surface: "ink", lastAt: T0 + 1000 });
    expect(groups.some((g) => g.kind === "refuse")).toBe(false);
    const totals = await store.totals("sul", T0 - 1);
    expect(totals).toEqual(expect.arrayContaining([{ surface: "site", kind: "refuse", answerId: null, count: 1 }, { surface: "ink", kind: "not-found", answerId: null, count: 2 }]));
    const report = questionReport(totals, groups, []);
    expect(report.unanswered).toHaveLength(1);
    expect(report.total).toBe(3);
    const stored = await db.query<{ question: string | null }>(`select question from assistant_question where kind = 'refuse'`);
    expect(stored.rows).toEqual([{ question: null }]);
  });

  test("the period and the purge", async () => {
    await store.record(questionRow({ region: "sul", surface: "site", message: "tem de Ilhota?", reply: notFound, answers: [], at: T0 - 100 * 86_400_000 }));
    expect((await store.groups("sul", T0 - 30 * 86_400_000, 100)).some((g) => g.sample === "tem de Ilhota?")).toBe(false);
    expect(await store.purgeBefore(T0 - 90 * 86_400_000)).toBe(1);
    expect(await store.groups("norte", 0, 100)).toEqual([]);
  });
});

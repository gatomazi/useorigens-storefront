import type { Db } from "../admin/db/db";
import { UNLISTED, type AssistantQuestion, type QuestionGroup, type QuestionStore, type QuestionTotal } from "./questions";

/** PostgreSQL implementation of the assistant's questions (db/migrations/0009_assistant_questions). Every query is parameterised. */

const ms = (v: unknown): number => (v instanceof Date ? v.getTime() : new Date(String(v)).getTime());
const at = (epochMs: number): string => new Date(epochMs).toISOString();

type GroupRow = { question_key: string; kind: QuestionGroup["kind"]; answer_id: string | null; surface: QuestionGroup["surface"]; n: unknown; last_at: unknown; sample: string | null };

export function pgQuestionStore(db: Db): QuestionStore {
  return {
    async record(row: AssistantQuestion) {
      await db.query(`insert into assistant_question (region, surface, question, question_key, kind, answer_id, result_count, created_at) values ($1, $2, $3, $4, $5, $6, $7, $8)`, [
        row.region,
        row.surface,
        row.question,
        row.questionKey,
        row.kind,
        row.answerId,
        row.resultCount,
        at(row.at),
      ]);
    },
    // Grouped in the database: the panel reads one line per question, never the whole table. The sample is the latest text of the group.
    async groups(region, since, limit) {
      const r = await db.query<GroupRow>(
        `select question_key, kind, answer_id, surface, count(*) as n, max(created_at) as last_at,
                (array_agg(question order by created_at desc) filter (where question is not null))[1] as sample
           from assistant_question
          where region = $1 and created_at >= $2 and kind <> all($4::text[])
          group by question_key, kind, answer_id, surface
          order by n desc, last_at desc
          limit $3`,
        [region, at(since), limit, [...UNLISTED]],
      );
      return r.rows.map((g) => ({ key: g.question_key, kind: g.kind, answerId: g.answer_id, surface: g.surface, count: Number(g.n), lastAt: ms(g.last_at), sample: g.sample }));
    },
    async totals(region, since) {
      const r = await db.query<{ surface: QuestionTotal["surface"]; kind: QuestionTotal["kind"]; answer_id: string | null; n: unknown }>(
        `select surface, kind, answer_id, count(*) as n from assistant_question where region = $1 and created_at >= $2 group by surface, kind, answer_id`,
        [region, at(since)],
      );
      return r.rows.map((t) => ({ surface: t.surface, kind: t.kind, answerId: t.answer_id, count: Number(t.n) }));
    },
    async purgeBefore(before) {
      return (await db.query(`delete from assistant_question where created_at < $1`, [at(before)])).rowCount;
    },
  };
}

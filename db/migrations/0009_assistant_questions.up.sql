-- What people ask the "Ajuda" assistant (docs/storefront/assistente.md), so the store can see what it could not answer and write that answer.
-- Additive only: one new table, nothing rewritten. The public route writes here after answering; before this is applied it simply skips the write.
--   * No visitor: no IP, no hash, no cookie, no session. A row is the question, where it was asked and what the assistant answered.
--   * question: what was typed, with e-mails and long digit runs (phone, CEP, order or document numbers) masked before it reaches the database.
--     A refused message (CPF, card, password) keeps only the kind: its text is never stored.
--   * question_key: the words that matter, folded (no accents, stopwords or plurals), to group "tem de Floripa?" with "Tem de floripa".
--   * Kept 90 days; older rows are deleted by the application.
create table assistant_question (
  id            bigserial primary key,
  region        text not null check (region in ('sul', 'norte', 'centro-oeste')),
  surface       text not null check (surface in ('site', 'ink')),
  question      text check (question is null or char_length(question) between 1 and 300),
  question_key  text not null check (char_length(question_key) <= 300),
  kind          text not null check (kind in ('greeting', 'answer', 'designs', 'order', 'handoff', 'refuse', 'ask', 'not-found', 'fallback', 'chat')),
  answer_id     text check (answer_id is null or answer_id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  result_count  smallint not null default 0 check (result_count between 0 and 50),
  created_at    timestamptz not null default now(),
  check (kind <> 'refuse' or question is null)
);
create index assistant_question_region_idx on assistant_question (region, created_at desc);
create index assistant_question_created_idx on assistant_question (created_at);

insert into schema_migration (version) values ('0009_assistant_questions') on conflict do nothing;

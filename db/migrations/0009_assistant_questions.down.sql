-- Development / CI only. Every recorded question is lost.
drop table if exists assistant_question;
delete from schema_migration where version = '0009_assistant_questions';
